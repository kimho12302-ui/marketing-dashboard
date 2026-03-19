import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const STATS_SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio";

function getAuth() {
  const saKey = process.env.GOOGLE_SA_KEY;
  if (!saKey) throw new Error("GOOGLE_SA_KEY not set");
  const creds = JSON.parse(saKey);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// Channel mapping from 거래처명
const CHANNEL_MAP: Record<string, string> = {
  "PPMI_자사몰(카페24)": "cafe24",
  "PPMI_스마트스토어": "smartstore",
  "YS_스마트스토어": "smartstore",
  "PPMI_쿠팡": "coupang",
  "PPMI_쿠팡 로켓그로스": "coupang",
};

// Brand detection: YSIET* = balancelab, rest from product list
function detectBrand(productCode: string, productListMap: Map<string, any>): string {
  if (productCode.toUpperCase().startsWith("YSIET")) return "balancelab";
  const info = productListMap.get(productCode);
  if (!info) return "unknown";
  const brandName = (info.brand || "").trim();
  const BRAND_MAP: Record<string, string> = {
    "너티": "nutty", "아이언펫": "ironpet", "파미나": "saip",
    "닥터레이": "saip", "고네이티브": "saip", "테라카니스": "saip",
    "공동구매": "balancelab",
  };
  return BRAND_MAP[brandName] || "saip";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Read Excel
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });

    // Find 판매정리 sheet
    const sheetName = wb.SheetNames.find(n => n.includes("판매정리"));
    if (!sheetName) {
      return NextResponse.json({ error: "판매정리 탭을 찾을 수 없습니다" }, { status: 400 });
    }
    const ws = wb.Sheets[sheetName];

    // Read range X2:AP (cols 24-42, 0-indexed: 23-41)
    // Row 2 = headers (index 1), Row 3+ = data
    const allData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 }) as any[][];
    
    // Headers at row index 0 (which is row 2 in sheet)
    const headers = allData[0] || [];
    
    // Column indices (X=23, Y=24, ..., AG=32, ..., AP=41 in 0-based)
    // But sheet_to_json with range:1 starts from row 2, and columns from A
    // We need to map by header names
    const colMap: Record<string, number> = {};
    headers.forEach((h: any, i: number) => {
      if (h) colMap[String(h).trim()] = i;
    });

    const dateCol = colMap["일자"] ?? -1;
    const clientCol = colMap["거래처명"] ?? -1;
    const warehouseCol = colMap["출하창고"] ?? -1;
    const productCodeCol = colMap["품목코드"] ?? -1;
    const productNameCol = colMap["품목명"] ?? -1;
    const qtyCol = colMap["수량"] ?? -1;
    const unitPriceCol = colMap["단가"] ?? -1;
    const supplyCol = colMap["공급가액"] ?? -1;
    const taxCol = colMap["부가세"] ?? -1;

    if (dateCol < 0 || productCodeCol < 0) {
      return NextResponse.json({ 
        error: `필수 컬럼 누락: 일자(${dateCol}), 품목코드(${productCodeCol}). 헤더: ${headers.slice(0, 20).join(", ")}`,
      }, { status: 400 });
    }

    // Fetch product list from stats sheet
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const plRes = await sheets.spreadsheets.values.get({
      spreadsheetId: STATS_SHEET_ID,
      range: "상품 목록!A3:E200",
    });
    const plRows = plRes.data.values || [];
    const productListMap = new Map<string, any>();
    for (const row of plRows) {
      if (row[0]) {
        productListMap.set(String(row[0]).trim(), {
          category: row[1] || "",
          brand: row[2] || "",
          lineup: row[3] || "",
          product: row[4] || "",
        });
      }
    }

    // Parse data rows
    interface SalesRow {
      date: string;
      channel: string;
      brand: string;
      category: string;
      lineup: string;
      product: string;
      productCode: string;
      quantity: number;
      unitPrice: number;
      revenue: number;
      supplyAmount: number;
    }

    const rows: SalesRow[] = [];
    let skipped = 0;

    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row || !row[dateCol]) continue;

      // Parse date
      let dateVal = row[dateCol];
      let dateStr = "";
      if (dateVal instanceof Date) {
        dateStr = dateVal.toISOString().slice(0, 10);
      } else {
        dateStr = String(dateVal).slice(0, 10);
      }
      if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) { skipped++; continue; }

      const productCode = String(row[productCodeCol] || "").trim();
      if (!productCode) { skipped++; continue; }

      const client = clientCol >= 0 ? String(row[clientCol] || "").trim() : "";
      const channel = CHANNEL_MAP[client] || "other";
      const qty = Number(row[qtyCol] || 0);
      const unitPrice = Number(row[unitPriceCol] || 0);
      const supply = supplyCol >= 0 ? Number(row[supplyCol] || 0) : 0;

      const brand = detectBrand(productCode, productListMap);
      const plInfo = productListMap.get(productCode) || {};

      rows.push({
        date: dateStr,
        channel,
        brand,
        category: plInfo.category || "",
        lineup: plInfo.lineup || "",
        product: plInfo.product || productCode,
        productCode,
        quantity: qty,
        unitPrice,
        revenue: unitPrice * qty,
        supplyAmount: supply,
      });
    }

    // Aggregate for product_sales (by date + channel + product)
    const prodAgg = new Map<string, any>();
    for (const r of rows) {
      const key = `${r.date}|${r.channel}|${r.product}`;
      const ex = prodAgg.get(key);
      if (ex) {
        ex.revenue += r.revenue;
        ex.quantity += r.quantity;
      } else {
        prodAgg.set(key, {
          date: r.date, channel: r.channel, product: r.product,
          brand: r.brand, revenue: r.revenue, quantity: r.quantity, buyers: 0,
        });
      }
    }
    const productSalesRows = Array.from(prodAgg.values());

    // Aggregate for daily_sales (by date + brand + channel)
    const dailyAgg = new Map<string, any>();
    for (const r of rows) {
      const key = `${r.date}|${r.brand}|${r.channel}`;
      const ex = dailyAgg.get(key);
      if (ex) {
        ex.revenue += r.revenue;
        ex.orders += r.quantity;
      } else {
        dailyAgg.set(key, { date: r.date, brand: r.brand, channel: r.channel, revenue: r.revenue, orders: r.quantity });
      }
    }
    // Add "all" brand aggregation
    const allAgg = new Map<string, any>();
    for (const r of dailyAgg.values()) {
      const key = `${r.date}|all|${r.channel}`;
      const ex = allAgg.get(key);
      if (ex) {
        ex.revenue += r.revenue;
        ex.orders += r.orders;
      } else {
        allAgg.set(key, { date: r.date, brand: "all", channel: r.channel, revenue: r.revenue, orders: r.orders });
      }
    }
    const dailySalesRows = [...Array.from(dailyAgg.values()), ...Array.from(allAgg.values())];

    // Upsert to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    let dbResults: Record<string, any> = {};

    // product_sales
    for (let i = 0; i < productSalesRows.length; i += 500) {
      const chunk = productSalesRows.slice(i, i + 500);
      const { error } = await supabase.from("product_sales").upsert(chunk, { onConflict: "date,channel,product" });
      if (error) dbResults.productSalesError = error.message;
    }

    // daily_sales
    for (let i = 0; i < dailySalesRows.length; i += 500) {
      const chunk = dailySalesRows.slice(i, i + 500);
      const { error } = await supabase.from("daily_sales").upsert(chunk, { onConflict: "date,brand,channel" });
      if (error) dbResults.dailySalesError = error.message;
    }

    // Write to Stats sheet Sales tab
    const salesSheetRows = rows.map(r => {
      const monthStr = (() => {
        const d = new Date(r.date);
        const y = String(d.getFullYear()).slice(2);
        return `${y}년${d.getMonth() + 1}월`;
      })();
      const dayStr = (() => {
        const d = new Date(r.date);
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
      })();
      const plInfo = productListMap.get(r.productCode) || {};
      const brandKor: Record<string, string> = {
        "nutty": "너티", "ironpet": "아이언펫", "saip": plInfo.brand || "사입", "balancelab": "밸런스랩",
      };
      return [
        monthStr, dayStr, r.channel === "cafe24" ? "카페24" : r.channel === "smartstore" ? "스마트스토어" : r.channel === "coupang" ? "쿠팡" : r.channel,
        r.category, brandKor[r.brand] || plInfo.brand || r.brand,
        r.lineup, r.product, r.quantity, 1, r.revenue, r.revenue,
      ];
    });

    if (salesSheetRows.length > 0) {
      try {
        // Append to Sales tab
        await sheets.spreadsheets.values.append({
          spreadsheetId: STATS_SHEET_ID,
          range: "Sales!A3",
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: salesSheetRows },
        });
        dbResults.sheetAppended = salesSheetRows.length;
      } catch (e) {
        dbResults.sheetError = String(e);
      }
    }

    // Summary by brand
    const brandSummary: Record<string, { count: number; revenue: number }> = {};
    for (const r of rows) {
      if (!brandSummary[r.brand]) brandSummary[r.brand] = { count: 0, revenue: 0 };
      brandSummary[r.brand].count += r.quantity;
      brandSummary[r.brand].revenue += r.revenue;
    }

    return NextResponse.json({
      ok: true,
      parsed: rows.length,
      skipped,
      productSales: productSalesRows.length,
      dailySales: dailySalesRows.length,
      sheetAppended: dbResults.sheetAppended || 0,
      brandSummary,
      dates: rows.length > 0 ? { from: rows[0].date, to: rows[rows.length - 1].date } : null,
      ...dbResults,
    });
  } catch (error) {
    console.error("Upload sales error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
