import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const platform = sp.get("platform") || "all";
  const brand = sp.get("brand") || "all";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const sortBy = sp.get("sort") || "impressions";
  const limit = parseInt(sp.get("limit") || "50");

  try {
    let query = supabase
      .from("keyword_performance")
      .select("*")
      .gte("date", from)
      .lte("date", to);

    if (platform !== "all") query = query.eq("platform", platform);
    if (brand !== "all") query = query.eq("brand", brand);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

    // Aggregate by keyword
    const kwMap = new Map<string, {
      keyword: string;
      platform: string;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      conversionValue: number;
    }>();

    for (const row of rows) {
      const key = `${row.platform}|${row.keyword}`;
      const existing = kwMap.get(key) || {
        keyword: row.keyword,
        platform: row.platform,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversionValue: 0,
      };
      existing.impressions += Number(row.impressions);
      existing.clicks += Number(row.clicks);
      existing.cost += Number(row.cost);
      existing.conversions += Number(row.conversions);
      existing.conversionValue += Number(row.conversion_value);
      kwMap.set(key, existing);
    }

    const keywords = Array.from(kwMap.values())
      .map((k) => ({
        ...k,
        ctr: k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0,
        cpc: k.clicks > 0 ? k.cost / k.clicks : 0,
        roas: k.cost > 0 ? k.conversionValue / k.cost : 0,
      }))
      .sort((a, b) => {
        if (sortBy === "clicks") return b.clicks - a.clicks;
        if (sortBy === "ctr") return b.ctr - a.ctr;
        if (sortBy === "cost") return b.cost - a.cost;
        if (sortBy === "roas") return b.roas - a.roas;
        return b.impressions - a.impressions;
      })
      .slice(0, limit);

    // Summary stats
    const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0);
    const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0);
    const totalCost = keywords.reduce((s, k) => s + k.cost, 0);

    return NextResponse.json({
      keywords,
      summary: {
        totalKeywords: kwMap.size,
        totalImpressions,
        totalClicks,
        totalCost,
        avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avgCpc: totalClicks > 0 ? totalCost / totalClicks : 0,
      },
    });
  } catch (error) {
    console.error("Keywords API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch keyword data", keywords: [], summary: {} },
      { status: 500 }
    );
  }
}
