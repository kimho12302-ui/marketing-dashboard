import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = (sp.get("brand") || "all") as Brand;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  try {
    let query = supabase.from("keyword_performance").select("*").gte("date", from).lte("date", to).order("date");
    if (brand !== "all") query = query.eq("brand", brand);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];

    // Aggregate by keyword + platform
    const kwMap = new Map<string, { impressions: number; clicks: number; cost: number; conversions: number }>();
    for (const r of rows) {
      const key = `${r.keyword}|${r.platform}`;
      const existing = kwMap.get(key) || { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      existing.impressions += Number(r.impressions);
      existing.clicks += Number(r.clicks);
      existing.cost += Number(r.cost);
      existing.conversions += Number(r.conversions);
      kwMap.set(key, existing);
    }

    const keywords = Array.from(kwMap.entries()).map(([key, d]) => {
      const [keyword, platform] = key.split("|");
      return {
        keyword, platform,
        impressions: d.impressions,
        clicks: d.clicks,
        ctr: d.impressions > 0 ? d.clicks / d.impressions : 0,
        cpc: d.clicks > 0 ? d.cost / d.clicks : 0,
        cost: d.cost,
        conversions: d.conversions,
      };
    });

    return NextResponse.json({ keywords });
  } catch (error) {
    console.error("Keywords API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
