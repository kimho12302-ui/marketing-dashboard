import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Known gonggu channels without 공구_ prefix
const GONGGU_CHANNELS_NO_PREFIX = ["더에르고"];
// Brands that should be included in saip aggregation
const SAIP_SUB_BRANDS = ["고네이티브", "테라카니스"];

function isGongguChannel(channel: string): boolean {
  return channel.startsWith("공구_") || GONGGU_CHANNELS_NO_PREFIX.includes(channel);
}

function getGroupKey(dateStr: string, period: string): string {
  const d = new Date(dateStr);
  if (period === "weekly") {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  if (period === "monthly") return dateStr.slice(0, 7) + "-01";
  return dateStr;
}

// Nutty lineup classification
// 시트 F열 기반 제품→라인업 매핑
const NUTTY_LINEUP_MAP: Record<string, string> = {
  "냠 단호박": "사운드", "냠 단호박_낱개": "사운드", "바삭 닭가슴살": "사운드", "바삭! 닭가슴살 * 3개": "사운드",
  "사운드시리즈 냠+바삭": "사운드", "사운드시리즈 냠1+바삭2": "사운드", "사운드시리즈 냠2+바삭1": "사운드", "사운드시리즈 냠2+바삭2": "사운드",
  "굿모닝퓨레": "하루루틴", "스트레스제로껌": "하루루틴", "스트레스제로껌 2개": "하루루틴", "스트레스제로껌 3개": "하루루틴", "스트레스제로껌 4개": "하루루틴",
  "에너젯바": "하루루틴", "하루루틴시리즈 3종": "하루루틴",
  "설날 선물세트": "기타", "크리스마스 선물세트": "기타",
};

function classifyNuttyLineup(product: string): string {
  if (NUTTY_LINEUP_MAP[product]) return NUTTY_LINEUP_MAP[product];
  // fallback: keyword matching
  if (product.includes("스트레스") || product.includes("에너젯") || product.includes("에너겟") || product.includes("굿모닝") || product.includes("퓨레") || product.includes("하루루틴")) return "하루루틴";
  if (product.includes("사운드") || product.includes("냠") || product.includes("바삭")) return "사운드";
  return "기타";
}

// Normalize nutty product name (merge quantity variants)
function normalizeNuttyProduct(product: string): string {
  // "스트레스제로껌 2개" → "스트레스제로껌"
  // "바삭! 닭가슴살 * 3개" → "바삭! 닭가슴살"
  // But keep packages like "냠+바삭" as-is
  return product
    .replace(/\s*\*?\s*\d+개$/, "")
    .replace(/\s*\d+개$/, "")
    .trim();
}

// Saip sub-brand classification
function classifySaipSubBrand(product: string, brand: string): string {
  if (brand === "고네이티브") return "고네이티브";
  if (brand === "테라카니스") return "테라카니스";
  // product-name based for brand=saip
  if (product.includes("마그네") || product.includes("오메가") || product.includes("바나") || product.includes("베가") || product.includes("프로키온") || product.includes("카놉") || product.includes("판크레") || product.includes("후코이카")) return "닥터레이";
  // Famina products: 오션, 퀴노아, 펌킨, 트로피컬, 프라임, 화이트, 앤세스트럴, 그레인프리, 라이트, 퍼피
  if (product.includes("오션") || product.includes("퀴노아") || product.includes("펌킨") || product.includes("트로피컬") || product.includes("프라임") || product.includes("화이트") || product.includes("앤세스트럴") || product.includes("엔세스트럴") || product.includes("그레인프리") || product.includes("라이트") || product.includes("퍼피") || product.includes("스몰브리드")) return "파미나";
  return "기타";
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = sp.get("brand") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const period = sp.get("period") || "daily";

  if (!brand || brand === "all") {
    return NextResponse.json({ error: "Brand required" }, { status: 400 });
  }

  try {
    // For saip, we need to also fetch sub-brands
    const salesBrands = brand === "saip" ? ["saip", ...SAIP_SUB_BRANDS] : [brand];
    const adBrands = [brand]; // ad spend only for the main brand

    // Fetch sales data
    const salesQuery = supabase.from("daily_sales").select("*")
      .gte("date", from).lte("date", to)
      .in("brand", salesBrands)
      .order("date", { ascending: true });
    const { data: sales } = await salesQuery;

    // Fetch ad spend data
    const adQuery = supabase.from("daily_ad_spend").select("*")
      .gte("date", from).lte("date", to)
      .in("brand", adBrands)
      .order("date", { ascending: true });
    const { data: adSpend } = await adQuery;

    // Fetch product sales
    const prodBrands = brand === "saip" ? ["saip"] : [brand];
    const prodQuery = supabase.from("product_sales").select("*")
      .gte("date", from).lte("date", to)
      .in("brand", prodBrands);
    const { data: prodData } = await prodQuery;

    // Previous period for KPI comparison
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diff = toDate.getTime() - fromDate.getTime();
    const prevFrom = new Date(fromDate.getTime() - diff - 86400000).toISOString().slice(0, 10);
    const prevTo = new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10);

    const prevSalesQuery = supabase.from("daily_sales").select("revenue,orders")
      .gte("date", prevFrom).lte("date", prevTo).in("brand", salesBrands);
    const { data: prevSales } = await prevSalesQuery;

    const prevAdQuery = supabase.from("daily_ad_spend").select("spend")
      .gte("date", prevFrom).lte("date", prevTo).in("brand", adBrands);
    const { data: prevAd } = await prevAdQuery;

    // KPI
    const totalRevenue = (sales || []).reduce((s, r) => s + Number(r.revenue), 0);
    const totalOrders = (sales || []).reduce((s, r) => s + Number(r.orders), 0);
    const totalAdSpend = (adSpend || []).reduce((s, r) => s + Number(r.spend), 0);
    const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prevRevenue = (prevSales || []).reduce((s, r) => s + Number(r.revenue), 0);
    const prevOrders = (prevSales || []).reduce((s, r) => s + Number(r.orders), 0);
    const prevAdSpendTotal = (prevAd || []).reduce((s, r) => s + Number(r.spend), 0);
    const prevRoas = prevAdSpendTotal > 0 ? prevRevenue / prevAdSpendTotal : 0;
    const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0;

    const kpi = {
      revenue: totalRevenue, revenuePrev: prevRevenue,
      adSpend: totalAdSpend, adSpendPrev: prevAdSpendTotal,
      roas, roasPrev: prevRoas,
      orders: totalOrders, ordersPrev: prevOrders,
      aov, aovPrev: prevAov,
    };

    // Channel sales breakdown
    const channelSalesMap = new Map<string, number>();
    for (const row of sales || []) {
      const ch = row.channel;
      channelSalesMap.set(ch, (channelSalesMap.get(ch) || 0) + Number(row.revenue));
    }
    const salesByChannel = Array.from(channelSalesMap.entries())
      .map(([channel, revenue]) => ({ channel, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    // Channel ad spend + ROAS
    const adChannelMap = new Map<string, { spend: number; cv: number }>();
    for (const row of adSpend || []) {
      const existing = adChannelMap.get(row.channel) || { spend: 0, cv: 0 };
      existing.spend += Number(row.spend);
      existing.cv += Number(row.conversion_value || 0);
      adChannelMap.set(row.channel, existing);
    }
    const adByChannel = Array.from(adChannelMap.entries())
      .map(([channel, d]) => ({ channel, spend: d.spend, roas: d.spend > 0 ? d.cv / d.spend : 0 }))
      .sort((a, b) => b.spend - a.spend);

    // Daily trend (revenue + adSpend)
    const trendMap = new Map<string, { revenue: number; adSpend: number }>();
    for (const row of sales || []) {
      const key = getGroupKey(row.date, period);
      const existing = trendMap.get(key) || { revenue: 0, adSpend: 0 };
      existing.revenue += Number(row.revenue);
      trendMap.set(key, existing);
    }
    for (const row of adSpend || []) {
      const key = getGroupKey(row.date, period);
      const existing = trendMap.get(key) || { revenue: 0, adSpend: 0 };
      existing.adSpend += Number(row.spend);
      trendMap.set(key, existing);
    }
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, revenue: d.revenue, adSpend: d.adSpend }));

    // Top products
    const prodMap = new Map<string, { revenue: number; quantity: number }>();
    for (const r of prodData || []) {
      const name = brand === "nutty" ? normalizeNuttyProduct(r.product) : r.product;
      const existing = prodMap.get(name) || { revenue: 0, quantity: 0 };
      existing.revenue += Number(r.revenue);
      existing.quantity += Number(r.quantity);
      prodMap.set(name, existing);
    }
    const topProducts = Array.from(prodMap.entries())
      .map(([product, d]) => ({ product, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Brand-specific data
    let extra: Record<string, unknown> = {};

    if (brand === "nutty") {
      // Lineup breakdown
      const lineupMap = new Map<string, { revenue: number; quantity: number }>();
      for (const r of prodData || []) {
        const lineup = classifyNuttyLineup(r.product);
        const existing = lineupMap.get(lineup) || { revenue: 0, quantity: 0 };
        existing.revenue += Number(r.revenue);
        existing.quantity += Number(r.quantity);
        lineupMap.set(lineup, existing);
      }
      extra.lineupBreakdown = Array.from(lineupMap.entries())
        .map(([lineup, d]) => ({ lineup, ...d }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    if (brand === "balancelab") {
      // Option parsing: 종이결과지, 맞춤영양제 counts from product names
      const optionCounts = new Map<string, { count: number; revenue: number }>();
      for (const r of prodData || []) {
        const pName = r.product || "";
        // Parse "+" separated options
        const parts = pName.split("+").map((p: string) => p.trim());
        for (const part of parts) {
          if (part.includes("종이결과지")) {
            const e = optionCounts.get("종이결과지") || { count: 0, revenue: 0 };
            e.count += Number(r.quantity);
            optionCounts.set("종이결과지", e);
          } else if (part.includes("맞춤") && part.includes("영양제")) {
            const e = optionCounts.get("맞춤영양제") || { count: 0, revenue: 0 };
            e.count += Number(r.quantity);
            optionCounts.set("맞춤영양제", e);
          }
        }
        // Base product classification
        if (pName.includes("뉴트리션")) {
          const e = optionCounts.get("큐모발검사 뉴트리션") || { count: 0, revenue: 0 };
          e.count += Number(r.quantity);
          e.revenue += Number(r.revenue);
          optionCounts.set("큐모발검사 뉴트리션", e);
        } else if (pName.includes("중금속")) {
          const e = optionCounts.get("큐모발검사 중금속") || { count: 0, revenue: 0 };
          e.count += Number(r.quantity);
          e.revenue += Number(r.revenue);
          optionCounts.set("큐모발검사 중금속", e);
        } else if (pName.includes("맞춤영양제") && !pName.includes("+")) {
          const e = optionCounts.get("맞춤영양제(단품)") || { count: 0, revenue: 0 };
          e.count += Number(r.quantity);
          e.revenue += Number(r.revenue);
          optionCounts.set("맞춤영양제(단품)", e);
        }
      }
      extra.optionBreakdown = Array.from(optionCounts.entries())
        .map(([option, d]) => ({ option, count: d.count, revenue: d.revenue }))
        .sort((a, b) => b.count - a.count);

      // Self vs gonggu
      let selfRevenue = 0;
      let gongguRevenue = 0;
      const gongguMap = new Map<string, { revenue: number; orders: number; quantity: number }>();

      for (const row of sales || []) {
        if (isGongguChannel(row.channel)) {
          const seller = row.channel.startsWith("공구_") ? row.channel.replace("공구_", "") : row.channel;
          const existing = gongguMap.get(seller) || { revenue: 0, orders: 0, quantity: 0 };
          existing.revenue += Number(row.revenue);
          existing.orders += Number(row.quantity || row.orders || 0);
          existing.quantity += Number(row.quantity || 0);
          gongguMap.set(seller, existing);
          gongguRevenue += Number(row.revenue);
        } else {
          selfRevenue += Number(row.revenue);
        }
      }

      extra.selfRevenue = selfRevenue;
      extra.gongguRevenue = gongguRevenue;
      extra.gongguSales = Array.from(gongguMap.entries())
        .map(([seller, d]) => ({ seller, ...d }))
        .sort((a, b) => b.revenue - a.revenue);

      // Self vs gonggu trend by date
      const selfGongguTrend = new Map<string, { self: number; gonggu: number }>();
      for (const row of sales || []) {
        const key = getGroupKey(row.date, period);
        const existing = selfGongguTrend.get(key) || { self: 0, gonggu: 0 };
        if (isGongguChannel(row.channel)) {
          existing.gonggu += Number(row.revenue);
        } else {
          existing.self += Number(row.revenue);
        }
        selfGongguTrend.set(key, existing);
      }
      extra.selfGongguTrend = Array.from(selfGongguTrend.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, 자체판매: d.self, 공동구매: d.gonggu }));
    }

    if (brand === "saip") {
      // Sub-brand breakdown from product_sales + daily_sales for sub-brands
      const subBrandRevMap = new Map<string, number>();

      // From product_sales (brand=saip)
      for (const r of prodData || []) {
        const sub = classifySaipSubBrand(r.product, r.brand);
        subBrandRevMap.set(sub, (subBrandRevMap.get(sub) || 0) + Number(r.revenue));
      }

      // From daily_sales for sub-brand entries (고네이티브, 테라카니스)
      for (const row of sales || []) {
        if (SAIP_SUB_BRANDS.includes(row.brand)) {
          subBrandRevMap.set(row.brand, (subBrandRevMap.get(row.brand) || 0) + Number(row.revenue));
        }
      }

      extra.subBrandRevenue = Array.from(subBrandRevMap.entries())
        .map(([subBrand, revenue]) => ({ subBrand, revenue }))
        .sort((a, b) => b.revenue - a.revenue);

      // Sub-brand trend by date
      const subTrendMap = new Map<string, Record<string, number>>();
      // From daily_sales
      for (const row of sales || []) {
        const key = getGroupKey(row.date, period);
        const existing = subTrendMap.get(key) || {};
        if (SAIP_SUB_BRANDS.includes(row.brand)) {
          existing[row.brand] = (existing[row.brand] || 0) + Number(row.revenue);
        }
        subTrendMap.set(key, existing);
      }
      // From product_sales for saip brand
      for (const r of prodData || []) {
        if (r.brand === "saip") {
          const key = getGroupKey(r.date, period);
          const existing = subTrendMap.get(key) || {};
          const sub = classifySaipSubBrand(r.product, r.brand);
          existing[sub] = (existing[sub] || 0) + Number(r.revenue);
          subTrendMap.set(key, existing);
        }
      }
      extra.subBrandTrend = Array.from(subTrendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, ...d }));
    }

    // Fetch targets
    const currentMonth = to.slice(0, 7);
    const { data: targetData } = await supabase
      .from("manual_monthly")
      .select("metric,value")
      .eq("category", "target")
      .like("month", `${currentMonth}%`)
      .eq("brand", brand);
    const targets: Record<string, number> = {};
    for (const row of targetData || []) {
      const key = row.metric.replace("target_", "");
      targets[key] = Number(row.value || 0);
    }

    return NextResponse.json({
      kpi, salesByChannel, adByChannel, trend, topProducts, targets, ...extra,
    });
  } catch (error) {
    console.error("Brand detail API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
