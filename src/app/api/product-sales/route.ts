import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = (sp.get("brand") || "all") as Brand;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  try {
    let query = supabase.from("product_sales").select("*").gte("date", from).lte("date", to).order("date");
    if (brand !== "all") query = query.eq("brand", brand);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];

    // Channel pie
    const chMap = new Map<string, number>();
    for (const r of rows) {
      chMap.set(r.channel, (chMap.get(r.channel) || 0) + Number(r.revenue));
    }
    const channelLabels: Record<string, string> = { cafe24: "카페24", smartstore: "스마트스토어", coupang: "쿠팡", ably: "에이블리" };
    const channelPie = Array.from(chMap.entries()).map(([k, v]) => ({ name: channelLabels[k] || k, value: v }));

    // Category pie
    const catMap = new Map<string, number>();
    for (const r of rows) {
      catMap.set(r.category, (catMap.get(r.category) || 0) + Number(r.revenue));
    }
    const categoryPie = Array.from(catMap.entries()).map(([k, v]) => ({ name: k, value: v }));

    // Channel trend by week
    const trendMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const weekKey = r.date.slice(0, 7) + "-" + String(Math.ceil(Number(r.date.slice(8, 10)) / 7)).padStart(2, "0");
      const existing = trendMap.get(weekKey) || {};
      existing[r.channel] = (existing[r.channel] || 0) + Number(r.revenue);
      trendMap.set(weekKey, existing);
    }
    const channelTrend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // Top products
    const prodMap = new Map<string, { revenue: number; quantity: number; buyers: number }>();
    for (const r of rows) {
      const existing = prodMap.get(r.product) || { revenue: 0, quantity: 0, buyers: 0 };
      existing.revenue += Number(r.revenue);
      existing.quantity += Number(r.quantity);
      existing.buyers += Number(r.buyers);
      prodMap.set(r.product, existing);
    }
    const topProducts = Array.from(prodMap.entries())
      .map(([product, d]) => ({ product, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return NextResponse.json({ channelPie, categoryPie, channelTrend, topProducts });
  } catch (error) {
    console.error("Product sales API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
