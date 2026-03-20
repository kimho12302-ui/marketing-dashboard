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
    if (brand !== "all") { query = query.eq("brand", brand); }
    else { query = query.neq("brand", "all"); }
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

    // Fetch misc marketing costs
    let miscQuery = supabase.from("manual_monthly")
      .select("*").eq("category", "misc_cost").gte("month", from).lte("month", to);
    if (brand !== "all") miscQuery = miscQuery.eq("brand", brand);
    const { data: miscCosts } = await miscQuery;
    const totalMiscCost = (miscCosts || []).reduce((s, r) => s + Number(r.value || 0), 0);

    // CAC = total spend / total conversions
    const totalSpend = rows.reduce((s, r) => s + Number(r.spend), 0) + totalMiscCost;
    const totalConv = rows.reduce((s, r) => s + Number(r.conversions), 0);
    const cac = totalConv > 0 ? totalSpend / totalConv : 0;
    const miscCostTotal = totalMiscCost;

    // Period-based spend: daily / weekly / monthly
    const brandLabels: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
    const getWeekKey = (dateStr: string) => {
      const d = new Date(dateStr);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      return monday.toISOString().slice(0, 10);
    };
    const getMonthKey = (dateStr: string) => dateStr.slice(0, 7);

    // Build period data for all three granularities
    const buildPeriodData = (groupFn: (date: string) => string) => {
      const map = new Map<string, Record<string, number>>();
      for (const r of rows) {
        const key = groupFn(r.date);
        const existing = map.get(key) || {};
        if (brand === "all") {
          const bl = brandLabels[r.brand] || r.brand;
          existing[bl] = (existing[bl] || 0) + Number(r.spend);
        } else {
          existing[r.channel] = (existing[r.channel] || 0) + Number(r.spend);
        }
        existing["_total"] = (existing["_total"] || 0) + Number(r.spend);
        map.set(key, existing);
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => {
          const { _total, ...rest } = d;
          return { date, total: _total, ...rest };
        });
    };

    const dailySpend = buildPeriodData((d) => d);
    const weeklySpend = buildPeriodData(getWeekKey);
    const monthlySpend = buildPeriodData(getMonthKey);

    return NextResponse.json({ channels, spendTrend, cac, dailySpend, weeklySpend, monthlySpend, miscCostTotal });
  } catch (error) {
    console.error("Ads API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
