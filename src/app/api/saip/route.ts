import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  try {
    const { data, error } = await supabase
      .from("product_sales")
      .select("*")
      .eq("brand", "saip")
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (error) throw error;
    const rows = data || [];

    // lineup = 사입 브랜드 (파미나, 닥터레이, 고네이티브, 테라카니스)
    const lineupMap = new Map<string, { revenue: number; quantity: number; count: number }>();
    for (const r of rows) {
      const lineup = r.lineup || r.category || "기타";
      const existing = lineupMap.get(lineup) || { revenue: 0, quantity: 0, count: 0 };
      existing.revenue += Number(r.revenue);
      existing.quantity += Number(r.quantity);
      existing.count += 1;
      lineupMap.set(lineup, existing);
    }
    const byLineup = Array.from(lineupMap.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    // By product
    const prodMap = new Map<string, { revenue: number; quantity: number; lineup: string }>();
    for (const r of rows) {
      const existing = prodMap.get(r.product) || { revenue: 0, quantity: 0, lineup: r.lineup || r.category || "" };
      existing.revenue += Number(r.revenue);
      existing.quantity += Number(r.quantity);
      prodMap.set(r.product, existing);
    }
    const byProduct = Array.from(prodMap.entries())
      .map(([product, d]) => ({ product, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    // By channel
    const chMap = new Map<string, number>();
    for (const r of rows) {
      chMap.set(r.channel, (chMap.get(r.channel) || 0) + Number(r.revenue));
    }
    const byChannel = Array.from(chMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Daily trend
    const trendMap = new Map<string, number>();
    for (const r of rows) {
      trendMap.set(r.date, (trendMap.get(r.date) || 0) + Number(r.revenue));
    }
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue }));

    // Totals
    const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalQuantity = rows.reduce((s, r) => s + Number(r.quantity), 0);

    return NextResponse.json({ byLineup, byProduct, byChannel, trend, totalRevenue, totalQuantity });
  } catch (error) {
    console.error("Saip API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
