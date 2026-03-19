import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

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
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function syncSales(sheets: any, supabase: any) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: STATS_SHEET_ID,
    range: "Sales!A1:Z5000",
  });
  const rows = res.data.values || [];
  if (rows.length < 3) return { sales: 0 };

  // Row 0 = empty, Row 1 = headers, Row 2+ = data
  const headers = rows[1] || rows[0];
  const dateIdx = headers.findIndex((h: string) => /날짜|date/i.test(h));
  const revenueIdx = headers.findIndex((h: string) => /매출|revenue|합계/i.test(h));
  const ordersIdx = headers.findIndex((h: string) => /주문|orders|건수/i.test(h));
  const brandIdx = headers.findIndex((h: string) => /브랜드|brand/i.test(h));
  const channelIdx = headers.findIndex((h: string) => /채널|channel/i.test(h));

  let count = 0;
  const batch: any[] = [];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;

    // Parse Korean date like "3월 15일 (일)" or ISO format
    let dateStr = row[dateIdx];
    const korMatch = dateStr.match(/(\d+)월\s*(\d+)일/);
    if (korMatch) {
      const m = parseInt(korMatch[1]);
      const d = parseInt(korMatch[2]);
      const y = m >= 7 ? 2025 : 2026;
      dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    const revenue = parseFloat(String(row[revenueIdx] || "0").replace(/[,원]/g, "")) || 0;
    const orders = parseInt(String(row[ordersIdx] || "0").replace(/[,건]/g, "")) || 0;
    const brand = row[brandIdx] || "all";
    const channel = row[channelIdx] || "all";

    if (revenue > 0 || orders > 0) {
      batch.push({
        date: dateStr,
        brand,
        channel,
        revenue,
        orders,
      });
      count++;
    }
  }

  // Upsert to daily_sales (deduplicate)
  const seen = new Set<string>();
  const deduped = [];
  for (const r of batch) {
    const key = `${r.date}|${r.brand}|${r.channel}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  if (deduped.length > 0) {
    // Batch upsert in chunks of 500
    for (let i = 0; i < deduped.length; i += 500) {
      const chunk = deduped.slice(i, i + 500);
      await supabase.from("daily_sales").upsert(chunk, { onConflict: "date,brand,channel" });
    }
  }

  return { sales: deduped.length };
}

async function syncFunnel(sheets: any, supabase: any) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: STATS_SHEET_ID,
    range: "Funnel!A1:AX100",
  });
  const rows = res.data.values || [];
  if (rows.length < 3) return { funnel: 0 };

  // Row 0 = group headers (brand groups), Row 1 = sub headers, Row 2 = totals, Row 3+ = data
  const groupHeaders = rows[0] || [];
  const subHeaders = rows[1] || [];

  // Find brand column groups
  const brands: { name: string; startCol: number; metrics: Record<string, number> }[] = [];
  let currentBrand = "";
  for (let c = 0; c < groupHeaders.length; c++) {
    if (groupHeaders[c]) currentBrand = groupHeaders[c].trim().toLowerCase();
    if (currentBrand && subHeaders[c]) {
      let brand = brands.find(b => b.name === currentBrand);
      if (!brand) {
        brand = { name: currentBrand, startCol: c, metrics: {} };
        brands.push(brand);
      }
      const metric = subHeaders[c].trim().toLowerCase();
      brand.metrics[metric] = c;
    }
  }

  let count = 0;
  const batch: any[] = [];

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    // Parse month (e.g., "7월", "8월")
    const monthMatch = String(row[0]).match(/(\d+)/);
    if (!monthMatch) continue;
    const month = parseInt(monthMatch[1]);
    const year = month >= 7 ? 2025 : 2026;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-01`;

    for (const brand of brands) {
      const get = (key: string) => {
        const col = Object.entries(brand.metrics).find(([k]) => k.includes(key))?.[1];
        return col !== undefined ? parseFloat(String(row[col] || "0").replace(/[,%]/g, "")) || 0 : 0;
      };

      const brandName = brand.name === "전체" ? "all" : brand.name === "카페24" ? "cafe24" : brand.name === "스마트스토어" ? "smartstore" : brand.name === "쿠팡" ? "coupang" : brand.name;

      batch.push({
        date: dateStr,
        brand: brandName,
        impressions: get("노출") || get("impression"),
        sessions: get("세션") || get("session") || get("방문"),
        cart_adds: get("장바구니") || get("cart"),
        purchases: get("구매") || get("purchase") || get("결제"),
        repurchases: get("재구매") || get("repurchase"),
      });
      count++;
    }
  }

  const seen = new Set<string>();
  const deduped = [];
  for (const r of batch) {
    const key = `${r.date}|${r.brand}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  if (deduped.length > 0) {
    for (let i = 0; i < deduped.length; i += 500) {
      const chunk = deduped.slice(i, i + 500);
      await supabase.from("daily_funnel").upsert(chunk, { onConflict: "date,brand" });
    }
  }

  return { funnel: deduped.length };
}

async function syncProductSales(sheets: any, supabase: any) {
  const SALES_SHEET_ID = "1YT3_RMO8XJYVxf3i7kzb50cVGPU5fMChhqGCRaa6NTw";
  let count = 0;

  try {
    // Get all sheet tabs
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SALES_SHEET_ID, fields: "sheets.properties.title" });
    const tabNames = meta.data.sheets.map((s: any) => s.properties.title);

    const CHANNEL_MAP: Record<string, string> = {
      "카페24": "cafe24", "스마트스토어": "smartstore", "쿠팡": "coupang",
      "에이블리": "ably", "피피": "peepee", "펫프렌즈": "petfriends",
    };

    const batch: any[] = [];

    for (const tab of tabNames) {
      const channel = CHANNEL_MAP[tab];
      if (!channel) continue;

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SALES_SHEET_ID,
        range: `'${tab}'!A1:Z5000`,
      });
      const rows = res.data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0];
      const dateCol = headers.findIndex((h: string) => /날짜|date/i.test(h));
      const productCol = headers.findIndex((h: string) => /상품|product|품명/i.test(h));
      const revenueCol = headers.findIndex((h: string) => /매출|금액|revenue/i.test(h));
      const qtyCol = headers.findIndex((h: string) => /수량|qty|quantity/i.test(h));
      const brandCol = headers.findIndex((h: string) => /브랜드|brand/i.test(h));

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[dateCol]) continue;
        const revenue = parseFloat(String(row[revenueCol] || "0").replace(/[,원]/g, "")) || 0;
        const qty = parseInt(String(row[qtyCol] || "0").replace(/[,개건]/g, "")) || 0;
        if (revenue === 0 && qty === 0) continue;

        batch.push({
          date: row[dateCol],
          channel,
          product: row[productCol] || "unknown",
          brand: row[brandCol] || "unknown",
          revenue,
          quantity: qty,
        });
        count++;
      }
    }

    const seen = new Set<string>();
    const deduped = [];
    for (const r of batch) {
      const key = `${r.date}|${r.channel}|${r.product}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }

    if (deduped.length > 0) {
      for (let i = 0; i < deduped.length; i += 500) {
        const chunk = deduped.slice(i, i + 500);
        await supabase.from("product_sales").upsert(chunk, { onConflict: "date,channel,product" });
      }
    }

    return { productSales: deduped.length };
  } catch (e) {
    console.error("Product sales sync error:", e);
    return { productSales: 0, error: String(e) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const results: Record<string, any> = {};

    // Run syncs in parallel
    const [salesResult, funnelResult, productResult] = await Promise.allSettled([
      syncSales(sheets, supabase),
      syncFunnel(sheets, supabase),
      syncProductSales(sheets, supabase),
    ]);

    results.sales = salesResult.status === "fulfilled" ? salesResult.value : { error: String((salesResult as any).reason) };
    results.funnel = funnelResult.status === "fulfilled" ? funnelResult.value : { error: String((funnelResult as any).reason) };
    results.productSales = productResult.status === "fulfilled" ? productResult.value : { error: String((productResult as any).reason) };
    results.syncedAt = new Date().toISOString();

    return NextResponse.json(results);
  } catch (error) {
    console.error("Sync API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
