import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = sp.get("brand") || "all";
  const year = sp.get("year") || new Date().getFullYear().toString();

  try {
    // Get all sales data for the year
    const fromDate = `${year}-01-01`;
    const toDate = `${year}-12-31`;

    let salesQ = supabase.from("daily_sales").select("date,revenue,orders").gte("date", fromDate).lte("date", toDate);
    if (brand !== "all") salesQ = salesQ.eq("brand", brand);
    const { data: sales } = await salesQ;

    let adQ = supabase.from("daily_ad_spend").select("date,spend,conversion_value").gte("date", fromDate).lte("date", toDate);
    if (brand !== "all") adQ = adQ.eq("brand", brand);
    const { data: ads } = await adQ;

    // Group by month
    const months = new Map<string, { revenue: number; orders: number; adSpend: number; cv: number }>();

    for (const r of sales || []) {
      const m = r.date.slice(0, 7);
      const existing = months.get(m) || { revenue: 0, orders: 0, adSpend: 0, cv: 0 };
      existing.revenue += Number(r.revenue);
      existing.orders += Number(r.orders);
      months.set(m, existing);
    }

    for (const r of ads || []) {
      const m = r.date.slice(0, 7);
      const existing = months.get(m) || { revenue: 0, orders: 0, adSpend: 0, cv: 0 };
      existing.adSpend += Number(r.spend);
      existing.cv += Number(r.conversion_value);
      months.set(m, existing);
    }

    const summary = Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        revenue: d.revenue,
        orders: d.orders,
        adSpend: d.adSpend,
        roas: d.adSpend > 0 ? d.revenue / d.adSpend : 0,
        aov: d.orders > 0 ? d.revenue / d.orders : 0,
        // MoM growth
      }));

    // Add MoM growth
    for (let i = 1; i < summary.length; i++) {
      const prev = summary[i - 1];
      const curr = summary[i];
      (curr as any).revGrowth = prev.revenue > 0 ? ((curr.revenue / prev.revenue) - 1) * 100 : 0;
      (curr as any).orderGrowth = prev.orders > 0 ? ((curr.orders / prev.orders) - 1) * 100 : 0;
    }

    // YTD totals
    const ytd = {
      revenue: summary.reduce((s, m) => s + m.revenue, 0),
      orders: summary.reduce((s, m) => s + m.orders, 0),
      adSpend: summary.reduce((s, m) => s + m.adSpend, 0),
      roas: 0 as number,
      aov: 0 as number,
    };
    ytd.roas = ytd.adSpend > 0 ? ytd.revenue / ytd.adSpend : 0;
    ytd.aov = ytd.orders > 0 ? ytd.revenue / ytd.orders : 0;

    return NextResponse.json({ summary, ytd, year });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch monthly summary" }, { status: 500 });
  }
}
