import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brand = (searchParams.get("brand") || "all") as Brand;
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  try {
    let query = supabase
      .from("daily_funnel")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });

    if (brand !== "all") query = query.eq("brand", brand);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

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

    return NextResponse.json({ funnel, daily: rows, trend });
  } catch (error) {
    console.error("Funnel API error:", error);
    return NextResponse.json({ error: "Failed to fetch funnel data" }, { status: 500 });
  }
}
