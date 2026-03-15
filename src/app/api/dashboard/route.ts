import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Period, Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const period = (searchParams.get("period") || "daily") as Period;
  const brand = (searchParams.get("brand") || "all") as Brand;
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  try {
    let salesQuery = supabase.from("daily_sales").select("*").gte("date", from).lte("date", to).order("date", { ascending: true });
    if (brand !== "all") salesQuery = salesQuery.eq("brand", brand);
    const { data: sales, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;

    let adQuery = supabase.from("daily_ad_spend").select("*").gte("date", from).lte("date", to).order("date", { ascending: true });
    if (brand !== "all") adQuery = adQuery.eq("brand", brand);
    const { data: adSpend, error: adErr } = await adQuery;
    if (adErr) throw adErr;

    // Previous period
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diff = toDate.getTime() - fromDate.getTime();
    const prevFrom = new Date(fromDate.getTime() - diff - 86400000).toISOString().slice(0, 10);
    const prevTo = new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10);

    let prevSalesQuery = supabase.from("daily_sales").select("revenue, orders").gte("date", prevFrom).lte("date", prevTo);
    if (brand !== "all") prevSalesQuery = prevSalesQuery.eq("brand", brand);
    const { data: prevSales } = await prevSalesQuery;

    let prevAdQuery = supabase.from("daily_ad_spend").select("spend").gte("date", prevFrom).lte("date", prevTo);
    if (brand !== "all") prevAdQuery = prevAdQuery.eq("brand", brand);
    const { data: prevAd } = await prevAdQuery;

    // Aggregate KPIs
    const totalRevenue = (sales || []).reduce((s, r) => s + Number(r.revenue), 0);
    const totalOrders = (sales || []).reduce((s, r) => s + Number(r.orders), 0);
    const totalAdSpend = (adSpend || []).reduce((s, r) => s + Number(r.spend), 0);
    const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
    const profit = totalRevenue - totalAdSpend;
    const mer = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const prevRevenue = (prevSales || []).reduce((s, r) => s + Number(r.revenue), 0);
    const prevOrders = (prevSales || []).reduce((s, r) => s + Number(r.orders), 0);
    const prevAdSpendTotal = (prevAd || []).reduce((s, r) => s + Number(r.spend), 0);
    const prevRoas = prevAdSpendTotal > 0 ? prevRevenue / prevAdSpendTotal : 0;
    const prevProfit = prevRevenue - prevAdSpendTotal;
    const prevMer = prevAdSpendTotal > 0 ? prevRevenue / prevAdSpendTotal : 0;
    const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0;

    // Trend by date
    const getGroupKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (period === "weekly") {
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        return monday.toISOString().slice(0, 10);
      }
      if (period === "monthly") return dateStr.slice(0, 7) + "-01";
      return dateStr;
    };

    const trendMap = new Map<string, { revenue: number; adSpend: number }>();
    for (const row of sales || []) {
      const key = getGroupKey(row.date);
      const existing = trendMap.get(key) || { revenue: 0, adSpend: 0 };
      existing.revenue += Number(row.revenue);
      trendMap.set(key, existing);
    }
    for (const row of adSpend || []) {
      const key = getGroupKey(row.date);
      const existing = trendMap.get(key) || { revenue: 0, adSpend: 0 };
      existing.adSpend += Number(row.spend);
      trendMap.set(key, existing);
    }
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // Channel breakdown
    const channelMap = new Map<string, { spend: number; revenue: number }>();
    for (const row of adSpend || []) {
      const ch = row.channel;
      const existing = channelMap.get(ch) || { spend: 0, revenue: 0 };
      existing.spend += Number(row.spend);
      existing.revenue += Number(row.conversion_value);
      channelMap.set(ch, existing);
    }
    const channels = Array.from(channelMap.entries()).map(([channel, d]) => ({
      channel, spend: d.spend, roas: d.spend > 0 ? d.revenue / d.spend : 0,
    }));

    // Brand revenue breakdown
    const brandMap = new Map<string, number>();
    for (const row of sales || []) {
      brandMap.set(row.brand, (brandMap.get(row.brand) || 0) + Number(row.revenue));
    }
    const brandRevenue = Array.from(brandMap.entries()).map(([b, revenue]) => ({ brand: b, revenue }));

    return NextResponse.json({
      kpi: {
        revenue: totalRevenue, revenuePrev: prevRevenue,
        adSpend: totalAdSpend, adSpendPrev: prevAdSpendTotal,
        roas, roasPrev: prevRoas,
        orders: totalOrders, ordersPrev: prevOrders,
        profit, profitPrev: prevProfit,
        mer, merPrev: prevMer,
        aov, aovPrev: prevAov,
      },
      trend, channels, brandRevenue,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
