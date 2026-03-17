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

    // Fetch misc marketing costs from manual_monthly
    let miscQuery = supabase.from("manual_monthly")
      .select("*").eq("category", "misc_cost").gte("month", from).lte("month", to);
    if (brand !== "all") miscQuery = miscQuery.eq("brand", brand);
    const { data: miscCosts } = await miscQuery;
    const totalMiscCost = (miscCosts || []).reduce((s, r) => s + Number(r.value || 0), 0);

    // Fetch shipping costs from manual_monthly
    let shipQuery = supabase.from("manual_monthly")
      .select("*").eq("category", "shipping_cost").gte("month", from).lte("month", to);
    if (brand !== "all") shipQuery = shipQuery.eq("brand", brand);
    const { data: shipCosts } = await shipQuery;
    let totalShippingCost = 0;
    let totalShippingOrders = 0;
    for (const r of shipCosts || []) {
      totalShippingCost += Number(r.value || 0);
      try {
        const details = JSON.parse(r.note || "{}");
        totalShippingOrders += Number(details.total_orders || 0);
      } catch {}
    }

    // Fetch product costs for COGS calculation
    const { data: productCostsData } = await supabase.from("product_costs").select("product,brand,cost_price,manufacturing_cost,shipping_cost");
    const costMap = new Map<string, { cost_price: number; manufacturing_cost: number; shipping_cost: number }>();
    for (const pc of productCostsData || []) {
      costMap.set(`${pc.product}__${pc.brand}`, {
        cost_price: Number(pc.cost_price || 0),
        manufacturing_cost: Number(pc.manufacturing_cost || 0),
        shipping_cost: Number(pc.shipping_cost || 0),
      });
    }

    // Fetch product_sales for COGS matching
    let cogsProdQuery = supabase.from("product_sales").select("product,brand,quantity").gte("date", from).lte("date", to);
    if (brand !== "all") cogsProdQuery = cogsProdQuery.eq("brand", brand);
    const { data: cogsProdData } = await cogsProdQuery;

    let totalCOGS = 0;
    let totalManufacturing = 0;
    let totalShipping = 0;
    let matchedProducts = 0;
    for (const ps of cogsProdData || []) {
      const key = `${ps.product}__${ps.brand}`;
      const costs = costMap.get(key);
      if (costs) {
        const qty = Number(ps.quantity || 0);
        totalCOGS += (costs.cost_price + costs.manufacturing_cost + costs.shipping_cost) * qty;
        totalManufacturing += costs.manufacturing_cost * qty;
        totalShipping += costs.shipping_cost * qty;
        matchedProducts++;
      }
    }

    // Aggregate KPIs
    const totalRevenue = (sales || []).reduce((s, r) => s + Number(r.revenue), 0);
    const totalOrders = (sales || []).reduce((s, r) => s + Number(r.orders), 0);
    const totalAdSpendOnly = (adSpend || []).reduce((s, r) => s + Number(r.spend), 0);
    const totalAdSpend = totalAdSpendOnly + totalMiscCost;
    const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
    const profit = totalRevenue - totalAdSpend - totalCOGS - totalShippingCost;
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

    const brandLabelsMap: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
    const trendMap = new Map<string, Record<string, number>>();
    for (const row of sales || []) {
      const key = getGroupKey(row.date);
      const existing = trendMap.get(key) || { revenue: 0, adSpend: 0 };
      existing.revenue = (existing.revenue || 0) + Number(row.revenue);
      // Brand-level revenue
      const bl = brandLabelsMap[row.brand] || row.brand;
      existing[bl] = (existing[bl] || 0) + Number(row.revenue);
      trendMap.set(key, existing);
    }
    for (const row of adSpend || []) {
      const key = getGroupKey(row.date);
      const existing = trendMap.get(key) || { revenue: 0, adSpend: 0 };
      existing.adSpend = (existing.adSpend || 0) + Number(row.spend);
      trendMap.set(key, existing);
    }
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // Channel breakdown (ad spend)
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

    // Channel ROAS trend by date
    const chRoasTrendMap = new Map<string, Map<string, { spend: number; cv: number }>>();
    for (const row of adSpend || []) {
      const dateKey = getGroupKey(row.date);
      if (!chRoasTrendMap.has(dateKey)) chRoasTrendMap.set(dateKey, new Map());
      const dateChannels = chRoasTrendMap.get(dateKey)!;
      const ch = row.channel;
      const existing = dateChannels.get(ch) || { spend: 0, cv: 0 };
      existing.spend += Number(row.spend);
      existing.cv += Number(row.conversion_value);
      dateChannels.set(ch, existing);
    }
    const channelRoasTrend = Array.from(chRoasTrendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, chMap]) => {
        const row: Record<string, any> = { date };
        for (const [ch, d] of chMap.entries()) {
          row[ch] = d.spend > 0 ? Math.round((d.cv / d.spend) * 100) / 100 : 0;
        }
        return row;
      });

    // Brand revenue breakdown
    const brandMap = new Map<string, { revenue: number; orders: number }>();
    for (const row of sales || []) {
      const existing = brandMap.get(row.brand) || { revenue: 0, orders: 0 };
      existing.revenue += Number(row.revenue);
      existing.orders += Number(row.orders);
      brandMap.set(row.brand, existing);
    }
    const brandRevenue = Array.from(brandMap.entries()).map(([b, d]) => ({ brand: b, revenue: d.revenue, orders: d.orders }));

    // Brand revenue trend by date
    const brandLabels: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
    const brandTrendMap = new Map<string, Record<string, number>>();
    for (const row of sales || []) {
      const dateKey = getGroupKey(row.date);
      const existing = brandTrendMap.get(dateKey) || {};
      const bl = brandLabels[row.brand] || row.brand;
      existing[bl] = (existing[bl] || 0) + Number(row.revenue);
      brandTrendMap.set(dateKey, existing);
    }
    const brandRevenueTrend = Array.from(brandTrendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // Funnel summary for overview
    // Funnel: use "all" brand for total funnel (채널별은 별도 brand=cafe24/smartstore/coupang)
    let funnelQuery = supabase.from("daily_funnel").select("*").gte("date", from).lte("date", to).eq("brand", "all");
    const { data: funnelData } = await funnelQuery;
    const funnelRows = funnelData || [];
    const funnelSummary = {
      impressions: funnelRows.reduce((s, r) => s + Number(r.impressions || 0), 0),
      sessions: funnelRows.reduce((s, r) => s + Number(r.sessions || 0), 0),
      cartAdds: funnelRows.reduce((s, r) => s + Number(r.cart_adds || 0), 0),
      purchases: funnelRows.reduce((s, r) => s + Number(r.purchases || 0), 0),
      repurchases: funnelRows.reduce((s, r) => s + Number(r.repurchases || 0), 0),
    };
    const convRate = funnelSummary.sessions > 0 ? (funnelSummary.purchases / funnelSummary.sessions) * 100 : 0;
    const cartToOrderRate = funnelSummary.cartAdds > 0 ? (funnelSummary.purchases / funnelSummary.cartAdds) * 100 : 0;

    // Top 5 products for overview
    let prodQuery = supabase.from("product_sales").select("product,revenue,quantity,brand").gte("date", from).lte("date", to);
    if (brand !== "all") prodQuery = prodQuery.eq("brand", brand);
    const { data: prodData } = await prodQuery;
    const prodMap = new Map<string, { revenue: number; quantity: number; brand: string }>();
    for (const r of prodData || []) {
      const existing = prodMap.get(r.product) || { revenue: 0, quantity: 0, brand: r.brand };
      existing.revenue += Number(r.revenue);
      existing.quantity += Number(r.quantity);
      prodMap.set(r.product, existing);
    }
    const topProducts = Array.from(prodMap.entries())
      .map(([product, d]) => ({ product, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Brand ROAS trend by date
    const brandRoasTrendMap = new Map<string, Map<string, { spend: number; revenue: number }>>();
    for (const row of adSpend || []) {
      const dateKey = getGroupKey(row.date);
      if (!brandRoasTrendMap.has(dateKey)) brandRoasTrendMap.set(dateKey, new Map());
      const dateBrands = brandRoasTrendMap.get(dateKey)!;
      const b = row.brand;
      const existing = dateBrands.get(b) || { spend: 0, revenue: 0 };
      existing.spend += Number(row.spend);
      existing.revenue += Number(row.conversion_value);
      dateBrands.set(b, existing);
    }
    const brandRoasTrend = Array.from(brandRoasTrendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bMap]) => {
        const row: Record<string, any> = { date };
        for (const [b, d] of bMap.entries()) {
          row[b] = d.spend > 0 ? Math.round((d.revenue / d.spend) * 100) / 100 : 0;
        }
        return row;
      });

    // Brand ad spend breakdown
    const brandAdSpendMap = new Map<string, number>();
    for (const row of adSpend || []) {
      brandAdSpendMap.set(row.brand, (brandAdSpendMap.get(row.brand) || 0) + Number(row.spend));
    }
    const brandAdSpend = Array.from(brandAdSpendMap.entries())
      .map(([brand, spend]) => ({ brand, spend, share: totalAdSpendOnly > 0 ? spend / totalAdSpendOnly : 0 }))
      .sort((a, b) => b.spend - a.spend);

    // Channel sales breakdown (from daily_sales)
    const salesChannelMap = new Map<string, number>();
    for (const row of sales || []) {
      salesChannelMap.set(row.channel, (salesChannelMap.get(row.channel) || 0) + Number(row.revenue));
    }
    const salesByChannel = Array.from(salesChannelMap.entries())
      .map(([channel, revenue]) => ({ channel, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      kpi: {
        revenue: totalRevenue, revenuePrev: prevRevenue,
        adSpend: totalAdSpend, adSpendPrev: prevAdSpendTotal,
        roas, roasPrev: prevRoas,
        orders: totalOrders, ordersPrev: prevOrders,
        profit, profitPrev: prevProfit,
        mer, merPrev: prevMer,
        aov, aovPrev: prevAov,
        cogs: totalCOGS, manufacturing: totalManufacturing, productShipping: totalShipping,
        miscCost: totalMiscCost,
        shippingCost: totalShippingCost, shippingOrders: totalShippingOrders,
      },
      trend, channels, channelRoasTrend, brandRevenue, brandRevenueTrend, brandAdSpend, brandRoasTrend,
      funnelSummary: { ...funnelSummary, convRate, cartToOrderRate },
      topProducts, salesByChannel,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
