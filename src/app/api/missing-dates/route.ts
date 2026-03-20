import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7");
  
  // Generate last N dates
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Check each source for existing dates
  const [funnel, adSpend] = await Promise.all([
    supabase.from("daily_funnel").select("date,brand").in("date", dates),
    supabase.from("daily_ad_spend").select("date,channel").in("date", dates),
  ]);

  const funnelDates: Record<string, Set<string>> = {};
  for (const r of funnel.data || []) {
    if (!funnelDates[r.brand]) funnelDates[r.brand] = new Set();
    funnelDates[r.brand].add(r.date);
  }

  const adDates: Record<string, Set<string>> = {};
  for (const r of adSpend.data || []) {
    if (!adDates[r.channel]) adDates[r.channel] = new Set();
    adDates[r.channel].add(r.date);
  }

  // Find missing dates per source
  const missing: Record<string, string[]> = {};
  
  // Coupang item (daily_funnel brand=coupang, check if purchases > 0 isn't enough, just check existence)
  missing.coupang_item = dates.filter(d => !funnelDates["coupang"]?.has(d));
  missing.coupang_daily = missing.coupang_item; // same source
  missing.gfa = dates.filter(d => !adDates["gfa"]?.has(d));
  missing.influencer = dates.filter(d => !adDates["influencer"]?.has(d));
  
  // Cafe24 funnel (daily_funnel brand=cafe24)
  missing.cafe24 = dates.filter(d => !funnelDates["cafe24"]?.has(d));
  
  // Smartstore funnel (daily_funnel brand=smartstore)
  missing.smartstore = dates.filter(d => !funnelDates["smartstore"]?.has(d));

  // Convert Sets to arrays for JSON
  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(missing)) {
    result[k] = v.sort();
  }

  return NextResponse.json(result);
}
