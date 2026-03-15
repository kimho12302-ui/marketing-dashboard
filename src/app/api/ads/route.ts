import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = (sp.get("brand") || "all") as Brand;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  try {
    let query = supabase.from("daily_ad_spend").select("*").gte("date", from).lte("date", to).order("date");
    if (brand !== "all") query = query.eq("brand", brand);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];

    // Channel summaries
    const chMap = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; convValue: number }>();
    for (const r of rows) {
      const existing = chMap.get(r.channel) || { spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0 };
      existing.spend += Number(r.spend);
      existing.impressions += Number(r.impressions);
      existing.clicks += Number(r.clicks);
      existing.conversions += Number(r.conversions);
      existing.convValue += Number(r.conversion_value);
      chMap.set(r.channel, existing);
    }

    const channels = Array.from(chMap.entries()).map(([channel, d]) => ({
      channel,
      spend: d.spend,
      impressions: d.impressions,
      clicks: d.clicks,
      ctr: d.impressions > 0 ? d.clicks / d.impressions : 0,
      cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
      conversions: d.conversions,
      roas: d.spend > 0 ? d.convValue / d.spend : 0,
      conversionValue: d.convValue,
    })).sort((a, b) => b.spend - a.spend);

    // Spend trend by date
    const trendMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const existing = trendMap.get(r.date) || {};
      existing[r.channel] = (existing[r.channel] || 0) + Number(r.spend);
      trendMap.set(r.date, existing);
    }
    const spendTrend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // CAC = total spend / total conversions
    const totalSpend = rows.reduce((s, r) => s + Number(r.spend), 0);
    const totalConv = rows.reduce((s, r) => s + Number(r.conversions), 0);
    const cac = totalConv > 0 ? totalSpend / totalConv : 0;

    return NextResponse.json({ channels, spendTrend, cac });
  } catch (error) {
    console.error("Ads API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
