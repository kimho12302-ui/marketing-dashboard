import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brand = (searchParams.get("brand") || "all") as Brand;
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  try {
    // brand filter: "all" = total funnel (brand="all" in DB)
    // specific brand like "nutty" → filter by brand column
    // Channel-level breakdown: brand = "cafe24"/"smartstore"/"coupang"
    let query = supabase
      .from("daily_funnel")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });

    if (brand === "all") {
      // Use pre-aggregated "all" rows for total
      query = query.eq("brand", "all");
    } else {
      // For specific brand, use "all" rows (total funnel, not per-brand breakdown)
      // because daily_funnel stores channel-level (cafe24/smartstore/coupang) not brand-level
      query = query.eq("brand", "all");
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

    // Also get channel-level funnel data for comparison
    const channelBrands = ["cafe24", "smartstore", "coupang"];
    const { data: channelData } = await supabase
      .from("daily_funnel")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .in("brand", channelBrands)
      .order("date", { ascending: true });
    const channelRows = channelData || [];

    const totals = {
      impressions: rows.reduce((s, r) => s + Number(r.impressions), 0),
      sessions: rows.reduce((s, r) => s + Number(r.sessions), 0),
      cart_adds: rows.reduce((s, r) => s + Number(r.cart_adds), 0),
      purchases: rows.reduce((s, r) => s + Number(r.purchases), 0),
      repurchases: rows.reduce((s, r) => s + Number(r.repurchases), 0),
    };

    // 5-step funnel: 노출 → 유입(세션) → 장바구니 → 구매 → 재구매
    const funnel = [
      { name: "노출", value: totals.impressions },
      {
        name: "유입",
        value: totals.sessions,
        rate: totals.impressions > 0 ? (totals.sessions / totals.impressions) * 100 : 0,
      },
      {
        name: "장바구니",
        value: totals.cart_adds,
        rate: totals.sessions > 0 ? (totals.cart_adds / totals.sessions) * 100 : 0,
      },
      {
        name: "구매",
        value: totals.purchases,
        rate: totals.cart_adds > 0 ? (totals.purchases / totals.cart_adds) * 100 : 0,
      },
      {
        name: "재구매",
        value: totals.repurchases,
        rate: totals.purchases > 0 ? (totals.repurchases / totals.purchases) * 100 : 0,
      },
    ];

    // Daily trend for each step
    const dailyTrend = new Map<string, { sessions: number; cart_adds: number; purchases: number }>();
    for (const r of rows) {
      const existing = dailyTrend.get(r.date) || { sessions: 0, cart_adds: 0, purchases: 0 };
      existing.sessions += Number(r.sessions);
      existing.cart_adds += Number(r.cart_adds);
      existing.purchases += Number(r.purchases);
      dailyTrend.set(r.date, existing);
    }
    const trend = Array.from(dailyTrend.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // Channel-level funnel summaries
    const channelMap = new Map<string, { sessions: number; cart_adds: number; purchases: number; repurchases: number }>();
    for (const r of channelRows) {
      const ch = r.brand; // cafe24, smartstore, coupang
      const existing = channelMap.get(ch) || { sessions: 0, cart_adds: 0, purchases: 0, repurchases: 0 };
      existing.sessions += Number(r.sessions);
      existing.cart_adds += Number(r.cart_adds);
      existing.purchases += Number(r.purchases);
      existing.repurchases += Number(r.repurchases);
      channelMap.set(ch, existing);
    }
    const channelLabels: Record<string, string> = { cafe24: "카페24", smartstore: "스마트스토어", coupang: "쿠팡" };
    const channelFunnel = Array.from(channelMap.entries()).map(([ch, d]) => ({
      channel: channelLabels[ch] || ch,
      sessions: d.sessions,
      cart_adds: d.cart_adds,
      purchases: d.purchases,
      repurchases: d.repurchases,
      convRate: d.sessions > 0 ? (d.purchases / d.sessions * 100) : 0,
    }));

    return NextResponse.json({ funnel, daily: rows, trend, channelFunnel });
  } catch (error) {
    console.error("Funnel API error:", error);
    return NextResponse.json({ error: "Failed to fetch funnel data" }, { status: 500 });
  }
}
