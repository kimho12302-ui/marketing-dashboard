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
  const dateIdx = headers.findIndex((h: string) => /날짜|date|주문일시/i.test(h));
  const revenueIdx = headers.findIndex((h: string) => /^매출$|revenue|합계/i.test(h));
  const ordersIdx = headers.findIndex((h: string) => /수량|주문|orders|건수/i.test(h));
  const buyersIdx = headers.findIndex((h: string) => /구매자|buyers/i.test(h));
  const brandIdx = headers.findIndex((h: string) => /브랜드|brand/i.test(h));
  const channelIdx = headers.findIndex((h: string) => /판매처|채널|channel/i.test(h));
  const categoryIdx = headers.findIndex((h: string) => /카테고리|category/i.test(h));
  const productIdx = headers.findIndex((h: string) => /제품|product/i.test(h));
  const lineupIdx = headers.findIndex((h: string) => /라인업|lineup/i.test(h));

  let count = 0;
  const batch: any[] = [];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;

    // Parse Korean date like "3월 15일 (일)" or ISO format
    let dateStr = String(row[dateIdx] || "");
    const korMatch = dateStr.match(/(\d+)월\s*(\d+)일/);
    if (korMatch) {
      const m = parseInt(korMatch[1]);
      const d = parseInt(korMatch[2]);
      const y = m >= 7 ? 2025 : 2026;
      dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

    const revenue = parseFloat(String(row[revenueIdx] || "0").replace(/[,원\s]/g, "")) || 0;
    const orders = parseInt(String(row[ordersIdx] || "0").replace(/[,건\s]/g, "")) || 0;

    const CHANNEL_MAP: Record<string, string> = {
      "스마트스토어": "smartstore", "카페24": "cafe24", "쿠팡": "coupang",
      "에이블리": "ably", "피피": "peepee", "펫프렌즈": "petfriends",
    };
    const rawChannel = channelIdx >= 0 ? String(row[channelIdx] || "").trim() : "all";
    const channel = CHANNEL_MAP[rawChannel] || rawChannel || "all";

    const BRAND_MAP: Record<string, string> = {
      "너티": "nutty", "아이언펫": "ironpet", "파미나": "saip", "닥터레이": "saip",
      "공동구매": "balancelab",
    };
    const rawBrand = brandIdx >= 0 ? String(row[brandIdx] || "").trim() : "all";
    const brand = BRAND_MAP[rawBrand] || rawBrand || "all";

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

  // Aggregate by date+brand+channel
  const aggMap = new Map<string, { date: string; brand: string; channel: string; revenue: number; orders: number }>();
  for (const r of batch) {
    const key = `${r.date}|${r.brand}|${r.channel}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.revenue += r.revenue;
      existing.orders += r.orders;
    } else {
      aggMap.set(key, { ...r });
    }
  }
  const deduped = Array.from(aggMap.values());

  // Also create "all" brand aggregation per date+channel
  const allBrandMap = new Map<string, { date: string; brand: string; channel: string; revenue: number; orders: number }>();
  for (const r of deduped) {
    const key = `${r.date}|all|${r.channel}`;
    const existing = allBrandMap.get(key);
    if (existing) {
      existing.revenue += r.revenue;
      existing.orders += r.orders;
    } else {
      allBrandMap.set(key, { date: r.date, brand: "all", channel: r.channel, revenue: r.revenue, orders: r.orders });
    }
  }
  deduped.push(...Array.from(allBrandMap.values()));

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
  // Use same Stats sheet Sales tab — it has product-level data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: STATS_SHEET_ID,
    range: "Sales!A1:K10000",
  });
  const rows = res.data.values || [];
  if (rows.length < 3) return { productSales: 0 };

  const headers = rows[1] || rows[0];
  const dateIdx = headers.findIndex((h: string) => /날짜|date|주문일시/i.test(h));
  const channelIdx = headers.findIndex((h: string) => /판매처|채널|channel/i.test(h));
  const brandIdx = headers.findIndex((h: string) => /브랜드|brand/i.test(h));
  const productIdx = headers.findIndex((h: string) => /제품|product/i.test(h));
  const qtyIdx = headers.findIndex((h: string) => /수량|qty/i.test(h));
  const revenueIdx = headers.findIndex((h: string) => /^매출$|revenue/i.test(h));
  const buyersIdx = headers.findIndex((h: string) => /구매자|buyers/i.test(h));

  const CHANNEL_MAP: Record<string, string> = {
    "스마트스토어": "smartstore", "카페24": "cafe24", "쿠팡": "coupang",
    "에이블리": "ably", "피피": "peepee", "펫프렌즈": "petfriends",
  };
  const BRAND_MAP: Record<string, string> = {
    "너티": "nutty", "아이언펫": "ironpet", "파미나": "saip", "닥터레이": "saip",
    "공동구매": "balancelab",
  };

  const batch: any[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[dateIdx]) continue;

    let dateStr = String(row[dateIdx] || "");
    const korMatch = dateStr.match(/(\d+)월\s*(\d+)일/);
    if (korMatch) {
      const m = parseInt(korMatch[1]);
      const d = parseInt(korMatch[2]);
      const y = m >= 7 ? 2025 : 2026;
      dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

    const rawChannel = channelIdx >= 0 ? String(row[channelIdx] || "").trim() : "all";
    const channel = CHANNEL_MAP[rawChannel] || rawChannel || "all";
    const rawBrand = brandIdx >= 0 ? String(row[brandIdx] || "").trim() : "unknown";
    const brand = BRAND_MAP[rawBrand] || rawBrand || "unknown";
    const product = productIdx >= 0 ? String(row[productIdx] || "unknown").trim() : "unknown";
    const revenue = parseFloat(String(row[revenueIdx] || "0").replace(/[,원\s]/g, "")) || 0;
    const quantity = parseInt(String(row[qtyIdx] || "0").replace(/[,건\s]/g, "")) || 0;
    const buyers = buyersIdx >= 0 ? parseInt(String(row[buyersIdx] || "0").replace(/[,\s]/g, "")) || 0 : 0;

    if (revenue > 0 || quantity > 0) {
      batch.push({ date: dateStr, channel, product, brand, revenue, quantity, buyers });
    }
  }

  // Aggregate by date+channel+product
  const aggMap = new Map<string, any>();
  for (const r of batch) {
    const key = `${r.date}|${r.channel}|${r.product}`;
    const ex = aggMap.get(key);
    if (ex) {
      ex.revenue += r.revenue;
      ex.quantity += r.quantity;
      ex.buyers += r.buyers;
    } else {
      aggMap.set(key, { ...r });
    }
  }
  const deduped = Array.from(aggMap.values());

  if (deduped.length > 0) {
    for (let i = 0; i < deduped.length; i += 500) {
      const chunk = deduped.slice(i, i + 500);
      await supabase.from("product_sales").upsert(chunk, { onConflict: "date,channel,product" });
    }
  }

  return { productSales: deduped.length };
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
