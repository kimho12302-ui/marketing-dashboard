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
    const channelPie = Array.from(chMap.entries()).map(([k, v]) => ({ name: k, value: v }));

    // Category pie (kept for backwards compat)
    const catMap = new Map<string, number>();
    for (const r of rows) {
      catMap.set(r.category, (catMap.get(r.category) || 0) + Number(r.revenue));
    }
    const categoryPie = Array.from(catMap.entries()).map(([k, v]) => ({ name: k, value: v }));

    // Brand pie - aggregate revenue by brand
    const brandLabels: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
    const brandMap = new Map<string, number>();
    for (const r of rows) {
      brandMap.set(r.brand, (brandMap.get(r.brand) || 0) + Number(r.revenue));
    }
    const brandPie = Array.from(brandMap.entries()).map(([k, v]) => ({ name: brandLabels[k] || k, value: v }));

    // Channel trend by date - use actual channel names from data (dynamic)
    const trendMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const existing = trendMap.get(r.date) || {};
      existing[r.channel] = (existing[r.channel] || 0) + Number(r.revenue);
      trendMap.set(r.date, existing);
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

    // Fetch product costs for COGS
    const { data: costsData } = await supabase.from("product_costs").select("product,brand,manufacturing_cost");
    const costMap = new Map<string, number>();
    for (const pc of costsData || []) {
      costMap.set(`${pc.product}__${pc.brand}`, Number(pc.manufacturing_cost || 0));
    }

    // Brand trend by date (revenue + COGS)
    const brandTrendMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const existing = brandTrendMap.get(r.date) || {};
      const bl = brandLabels[r.brand] || r.brand;
      existing[bl] = (existing[bl] || 0) + Number(r.revenue);
      // Accumulate COGS per date
      const mfgCost = costMap.get(`${r.product}__${r.brand}`) || 0;
      const qty = Number(r.quantity || 0);
      existing[`${bl}_cogs`] = (existing[`${bl}_cogs`] || 0) + mfgCost * qty;
      brandTrendMap.set(r.date, existing);
    }
    const brandTrend = Array.from(brandTrendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // Product trend by date (top 5 products only)
    const top5Names = new Set(topProducts.slice(0, 5).map(p => p.product));
    const prodTrendMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!top5Names.has(r.product)) continue;
      const existing = prodTrendMap.get(r.date) || {};
      existing[r.product] = (existing[r.product] || 0) + Number(r.revenue);
      prodTrendMap.set(r.date, existing);
    }
    const productTrend = Array.from(prodTrendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // Brand-specific breakdown pie:
    // - nutty: lineup (extract first word/line name from product)
    // - ironpet/balancelab: product-level
    // - saip/all: category (default)
    let breakdownPie: { name: string; value: number }[] = [];
    let breakdownTitle = "카테고리별 매출";

    if (brand === "nutty" || brand === "saip") {
      // DB lineup 컬럼 직접 사용 (source of truth = 시트 F열 → SQL UPDATE)
      const lineupMap = new Map<string, number>();
      for (const r of rows) {
        const lineup = r.lineup || "기타";
        lineupMap.set(lineup, (lineupMap.get(lineup) || 0) + Number(r.revenue));
      }
      breakdownPie = Array.from(lineupMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
      breakdownTitle = brand === "nutty" ? "라인업별 매출" : "하위 브랜드별 매출";
    } else if (brand === "ironpet" || brand === "balancelab") {
      // Product-level
      const prodBreakdown = new Map<string, number>();
      for (const r of rows) {
        const pName = r.product.length > 20 ? r.product.slice(0, 20) + "…" : r.product;
        prodBreakdown.set(pName, (prodBreakdown.get(pName) || 0) + Number(r.revenue));
      }
      breakdownPie = Array.from(prodBreakdown.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      breakdownTitle = "제품별 매출";
    } else {
      // all: category
      breakdownPie = categoryPie;
      breakdownTitle = "카테고리별 매출";
    }

    // Orders trend by brand
    // Fetch daily_sales for order counts
    let ordersQuery = supabase.from("daily_sales").select("date,brand,orders").gte("date", from).lte("date", to).order("date");
    if (brand !== "all") { ordersQuery = ordersQuery.eq("brand", brand); }
    else { ordersQuery = ordersQuery.neq("brand", "all"); }
    const { data: salesData } = await ordersQuery;
    const ordersMap = new Map<string, Record<string, number>>();
    const brandLabels2: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
    for (const r of salesData || []) {
      const existing = ordersMap.get(r.date) || {};
      const bl = brandLabels2[r.brand] || r.brand;
      existing[bl] = (existing[bl] || 0) + Number(r.orders);
      ordersMap.set(r.date, existing);
    }
    const ordersTrend = Array.from(ordersMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    // 공구별 매출 집계 (product_sales.lineup 기반)
    const gongguMap = new Map<string, { revenue: number; orders: number; quantity: number }>();
    let selfSalesRevenue = 0;
    
    for (const r of rows) {
      const lineup = r.lineup || "";
      if (lineup && lineup.trim() !== "") {
        // lineup 있음 = 공구
        const seller = lineup.trim();
        const existing = gongguMap.get(seller) || { revenue: 0, orders: 0, quantity: 0 };
        existing.revenue += Number(r.revenue);
        existing.orders += Number(r.buyers || 0);  // buyers = 주문 건수
        existing.quantity += Number(r.quantity || 0);
        gongguMap.set(seller, existing);
      } else {
        // lineup 없음 = 자체판매
        selfSalesRevenue += Number(r.revenue);
      }
    }
    
    const gongguSales = Array.from(gongguMap.entries())
      .map(([seller, d]) => ({ seller, ...d }))
      .sort((a, b) => b.revenue - a.revenue);
    
    const gongguSalesTotal = gongguSales.reduce((sum, g) => sum + g.revenue, 0);

    return NextResponse.json({ 
      channelPie, categoryPie, breakdownPie, breakdownTitle, channelTrend, 
      topProducts, brandPie, brandTrend, productTrend, ordersTrend,
      gongguSales, gongguSalesTotal, selfSalesTotal: selfSalesRevenue 
    });
  } catch (error) {
    console.error("Product sales API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
