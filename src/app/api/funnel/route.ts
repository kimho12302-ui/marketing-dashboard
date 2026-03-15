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
      signups: rows.reduce((s, r) => s + Number(r.signups), 0),
      purchases: rows.reduce((s, r) => s + Number(r.purchases), 0),
      repurchases: rows.reduce((s, r) => s + Number(r.repurchases), 0),
    };

    const funnel = [
      { name: "노출", value: totals.impressions },
      {
        name: "유입",
        value: totals.sessions,
        rate:
          totals.impressions > 0
            ? (totals.sessions / totals.impressions) * 100
            : 0,
      },
      {
        name: "장바구니",
        value: totals.cart_adds,
        rate:
          totals.sessions > 0
            ? (totals.cart_adds / totals.sessions) * 100
            : 0,
      },
      {
        name: "가입",
        value: totals.signups,
        rate:
          totals.cart_adds > 0
            ? (totals.signups / totals.cart_adds) * 100
            : 0,
      },
      {
        name: "구매",
        value: totals.purchases,
        rate:
          totals.signups > 0
            ? (totals.purchases / totals.signups) * 100
            : 0,
      },
      {
        name: "재구매",
        value: totals.repurchases,
        rate:
          totals.purchases > 0
            ? (totals.repurchases / totals.purchases) * 100
            : 0,
      },
    ];

    return NextResponse.json({ funnel, daily: rows });
  } catch (error) {
    console.error("Funnel API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch funnel data" },
      { status: 500 }
    );
  }
}
