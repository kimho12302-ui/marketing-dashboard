import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const STATS_SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio";
const DRIVE_FOLDER_ID = "1WOGhcIrTMx6t7X3VmgA1453WQGzXNsRh";

function getAuth() {
  const saKey = process.env.GOOGLE_SA_KEY;
  if (!saKey) throw new Error("GOOGLE_SA_KEY not set");
  const creds = JSON.parse(saKey);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const fileType = formData.get("type") as string; // "daily" or "item"
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    if (allData.length < 2) {
      return NextResponse.json({ error: "데이터가 없습니다" }, { status: 400 });
    }

    const headers = allData[0] as string[];
    const colMap: Record<string, number> = {};
    headers.forEach((h, i) => { if (h) colMap[String(h).trim()] = i; });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    let result: any = {};

    // === DAILY SUMMARY ===
    if (fileType === "daily" || colMap["방문자"] !== undefined) {
      const dateCol = colMap["날짜"] ?? -1;
      const visitorsCol = colMap["방문자"] ?? -1;
      const viewsCol = colMap["조회"] ?? -1;
      const cartCol = colMap["장바구니"] ?? -1;
      const ordersCol = colMap["주문"] ?? -1;
      const convRateCol = colMap["구매전환율"] ?? -1;
      const salesQtyCol = colMap["판매량"] ?? -1;
      const revenueCol = colMap["매출(원)"] ?? -1;

      if (dateCol < 0) return NextResponse.json({ error: "날짜 컬럼 없음" }, { status: 400 });

      const funnelRows: any[] = [];
      const salesRows: any[] = [];

      for (let i = 1; i < allData.length; i++) {
        const row = allData[i];
        if (!row || !row[dateCol]) continue;

        const dateStr = String(row[dateCol]).slice(0, 10);
        if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

        const visitors = Number(row[visitorsCol] || 0);
        const views = Number(row[viewsCol] || 0);
        const cart = Number(row[cartCol] || 0);
        const orders = Number(row[ordersCol] || 0);
        const revenue = Number(String(row[revenueCol] || "0").replace(/,/g, ""));

        // Funnel data
        funnelRows.push({
          date: dateStr,
          brand: "coupang",
          sessions: visitors,
          impressions: views,
          cart_adds: cart,
          purchases: orders,
          repurchases: 0,
        });

        // Sales data (for daily_sales)
        if (revenue > 0) {
          salesRows.push({
            date: dateStr,
            brand: "nutty", // 쿠팡은 현재 너티만
            channel: "coupang",
            revenue,
            orders,
          });
        }
      }

      // Upsert funnel
      if (funnelRows.length > 0) {
        const { error } = await supabase.from("daily_funnel").upsert(funnelRows, { onConflict: "date,brand" });
        if (error) result.funnelError = error.message;
      }

      // Upsert sales
      if (salesRows.length > 0) {
        const { error } = await supabase.from("daily_sales").upsert(salesRows, { onConflict: "date,brand,channel" });
        if (error) result.salesError = error.message;
      }

      result.type = "daily";
      result.funnel = funnelRows.length;
      result.sales = salesRows.length;
      result.dates = funnelRows.length > 0
        ? { from: funnelRows[0].date, to: funnelRows[funnelRows.length - 1].date }
        : null;
    }

    // === VENDOR ITEM METRICS ===
    else if (fileType === "item" || colMap["옵션 ID"] !== undefined || colMap["옵션명"] !== undefined) {
      // Fetch product mapping from stats sheet (col F = 쿠팡옵션ID)
      const auth = getAuth();
      const sheets = google.sheets({ version: "v4", auth });
      const plRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STATS_SHEET_ID,
        range: "'상품 목록'!A3:F200",
      });
      const plRows = plRes.data.values || [];

      // Build mapping: coupangOptionId → { productCode, brand, category, product }
      const optionMap = new Map<string, any>();
      for (const row of plRows) {
        if (row[5]) { // F column = 쿠팡옵션ID
          const optionIds = String(row[5]).split(",").map(s => s.trim());
          for (const oid of optionIds) {
            optionMap.set(oid, {
              productCode: row[0] || "",
              category: row[1] || "",
              brand: row[2] || "",
              lineup: row[3] || "",
              product: row[4] || "",
            });
          }
        }
      }

      const optionIdCol = colMap["옵션 ID"] ?? -1;
      const optionNameCol = colMap["옵션명"] ?? -1;
      const productNameCol = colMap["상품명"] ?? -1;
      const itemRevenueCol = colMap["매출(원)"] ?? -1;
      const itemOrdersCol = colMap["주문"] ?? -1;
      const itemVisitorsCol = colMap["방문자"] ?? -1;
      const itemViewsCol = colMap["조회"] ?? -1;
      const itemCartCol = colMap["장바구니"] ?? -1;

      const itemRows: any[] = [];
      let unmapped = 0;

      for (let i = 1; i < allData.length; i++) {
        const row = allData[i];
        if (!row) continue;

        const optionId = optionIdCol >= 0 ? String(row[optionIdCol] || "") : "";
        const mapped = optionMap.get(optionId);
        if (!mapped) unmapped++;

        itemRows.push({
          optionId,
          optionName: optionNameCol >= 0 ? String(row[optionNameCol] || "") : "",
          productName: productNameCol >= 0 ? String(row[productNameCol] || "") : "",
          mappedProduct: mapped?.product || null,
          mappedBrand: mapped?.brand || null,
          revenue: itemRevenueCol >= 0 ? Number(String(row[itemRevenueCol] || "0").replace(/,/g, "")) : 0,
          orders: itemOrdersCol >= 0 ? Number(row[itemOrdersCol] || 0) : 0,
          visitors: itemVisitorsCol >= 0 ? Number(row[itemVisitorsCol] || 0) : 0,
          views: itemViewsCol >= 0 ? Number(row[itemViewsCol] || 0) : 0,
          cart: itemCartCol >= 0 ? Number(row[itemCartCol] || 0) : 0,
        });
      }

      result.type = "item";
      result.items = itemRows.length;
      result.mapped = itemRows.length - unmapped;
      result.unmapped = unmapped;
      result.itemSummary = itemRows.map(r => ({
        name: r.mappedProduct || r.productName?.slice(0, 30) || r.optionName?.slice(0, 30),
        revenue: r.revenue,
        orders: r.orders,
        mapped: !!r.mappedProduct,
      }));
    } else {
      return NextResponse.json({ error: "파일 형식을 인식할 수 없습니다 (daily summary 또는 vendor item 필요)" }, { status: 400 });
    }

    // Archive to Google Drive
    try {
      const auth = getAuth();
      const drive = google.drive({ version: "v3", auth });
      const fileBuffer = Buffer.from(buffer);
      const driveRes = await drive.files.create({
        requestBody: { name: file.name, parents: [DRIVE_FOLDER_ID] },
        media: {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: require("stream").Readable.from(fileBuffer),
        },
        fields: "id",
      });
      result.driveArchived = true;
    } catch {
      result.driveArchived = false;
    }

    result.ok = true;
    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload coupang funnel error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
