import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Sources to check per date
const SALES_CHANNELS = ["coupang", "cafe24", "smartstore", "pp", "ably", "petfriends"];
const AD_CHANNELS = ["meta", "google_ads", "naver_search", "coupang_ads", "gfa"];
const FUNNEL_BRANDS = ["coupang", "cafe24", "smartstore"];

export async function GET(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7");
  
  // Generate last N dates (skip today)
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Fetch all data for date range
  const [salesData, adData, funnelData] = await Promise.all([
    supabase.from("daily_sales").select("date,channel").in("date", dates),
    supabase.from("daily_ad_spend").select("date,channel").in("date", dates),
    supabase.from("daily_funnel").select("date,brand").in("date", dates),
  ]);

  // Build lookup sets: "date|channel" or "date|brand"
  const salesSet = new Set((salesData.data || []).map((r: any) => `${r.date}|${r.channel}`));
  const adSet = new Set((adData.data || []).map((r: any) => `${r.date}|${r.channel}`));
  const funnelSet = new Set((funnelData.data || []).map((r: any) => `${r.date}|${r.brand}`));
  const salesDateSet = new Set((salesData.data || []).map((r: any) => r.date));

  // Build per-date gap report (only dates with gaps)
  const gaps: { date: string; missing: string[] }[] = [];

  for (const date of dates.sort()) {
    const missing: string[] = [];

    // Sales: check if any sales data exists for this date
    if (!salesDateSet.has(date)) {
      missing.push("판매실적");
    }

    // Ad spend: check key channels
    if (!adSet.has(`${date}|meta`)) missing.push("메타광고");
    if (!adSet.has(`${date}|google_ads`)) missing.push("구글광고");
    if (!adSet.has(`${date}|naver_search`)) missing.push("네이버SA");
    if (!adSet.has(`${date}|coupang_ads`)) missing.push("쿠팡광고");
    if (!adSet.has(`${date}|gfa`)) missing.push("GFA");

    // Funnel: check key sources
    if (!funnelSet.has(`${date}|coupang`)) missing.push("쿠팡퍼널");
    if (!funnelSet.has(`${date}|cafe24`)) missing.push("카페24퍼널");
    if (!funnelSet.has(`${date}|smartstore`)) missing.push("스마트스토어퍼널");

    if (missing.length > 0) {
      gaps.push({ date, missing });
    }
  }

  // Legacy format (backward compatible)
  const legacy: Record<string, string[]> = {};
  legacy.coupang_item = dates.filter(d => !funnelSet.has(`${d}|coupang`));
  legacy.gfa = dates.filter(d => !adSet.has(`${d}|gfa`));
  legacy.sales = dates.filter(d => !salesDateSet.has(d));
  legacy.cafe24 = dates.filter(d => !funnelSet.has(`${d}|cafe24`));
  legacy.smartstore = dates.filter(d => !funnelSet.has(`${d}|smartstore`));

  return NextResponse.json({ gaps, ...legacy });
}
