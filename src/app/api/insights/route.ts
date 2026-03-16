import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  try {
    // Get sales data
    const { data: sales } = await supabase.from("daily_sales").select("*").gte("date", from).lte("date", to);
    const { data: adSpend } = await supabase.from("daily_ad_spend").select("*").gte("date", from).lte("date", to);
    const { data: funnel } = await supabase.from("daily_funnel").select("*").gte("date", from).lte("date", to);
    const { data: products } = await supabase.from("product_sales").select("*").gte("date", from).lte("date", to);

    const salesRows = sales || [];
    const adRows = adSpend || [];
    const funnelRows = funnel || [];
    const prodRows = products || [];

    const insights: { type: "critical" | "warning" | "opportunity" | "info"; text: string; detail?: string }[] = [];

    // ===== REVENUE ANALYSIS =====
    const totalRevenue = salesRows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalOrders = salesRows.reduce((s, r) => s + Number(r.orders), 0);
    const totalAdSpend = adRows.reduce((s, r) => s + Number(r.spend), 0);
    const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

    if (roas < 2.0 && totalAdSpend > 0) {
      insights.push({ type: "critical", text: `전체 ROAS ${roas.toFixed(2)}x — 목표 3.0x 미달`, detail: `매출 ₩${(totalRevenue/10000).toFixed(0)}만 대비 광고비 ₩${(totalAdSpend/10000).toFixed(0)}만. 광고 효율 개선 필요` });
    } else if (roas >= 3.0) {
      insights.push({ type: "opportunity", text: `전체 ROAS ${roas.toFixed(2)}x — 양호! 예산 증액 검토`, detail: `현재 효율이 좋으므로 일 예산 증액 시 매출 성장 가능` });
    }

    // ===== CHANNEL ANALYSIS =====
    const channelSpend = new Map<string, { spend: number; convValue: number }>();
    for (const r of adRows) {
      const existing = channelSpend.get(r.channel) || { spend: 0, convValue: 0 };
      existing.spend += Number(r.spend);
      existing.convValue += Number(r.conversion_value);
      channelSpend.set(r.channel, existing);
    }

    for (const [channel, d] of channelSpend.entries()) {
      const chRoas = d.spend > 0 ? d.convValue / d.spend : 0;
      if (d.spend > 100000 && chRoas < 1.0) {
        insights.push({ type: "critical", text: `${channel} ROAS ${chRoas.toFixed(2)}x — 적자 채널`, detail: `광고비 ₩${(d.spend/10000).toFixed(0)}만 투입 대비 전환매출 ₩${(d.convValue/10000).toFixed(0)}만. 예산 재검토 필요` });
      } else if (d.spend > 100000 && chRoas < 2.0) {
        insights.push({ type: "warning", text: `${channel} ROAS ${chRoas.toFixed(2)}x — 효율 저조`, detail: `크리에이티브 교체 또는 타겟팅 재설정 권장` });
      }
    }

    // ===== BRAND ANALYSIS =====
    const brandSales = new Map<string, { revenue: number; orders: number }>();
    for (const r of salesRows) {
      const existing = brandSales.get(r.brand) || { revenue: 0, orders: 0 };
      existing.revenue += Number(r.revenue);
      existing.orders += Number(r.orders);
      brandSales.set(r.brand, existing);
    }

    const brandLabels: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
    for (const [brand, d] of brandSales.entries()) {
      const aov = d.orders > 0 ? d.revenue / d.orders : 0;
      const revShare = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0;
      if (revShare > 40) {
        insights.push({ type: "info", text: `${brandLabels[brand] || brand} 매출 비중 ${revShare.toFixed(0)}% — 핵심 브랜드`, detail: `AOV ₩${aov.toFixed(0)}, 총 ${d.orders}건` });
      }
      if (d.orders > 10 && aov > 50000) {
        insights.push({ type: "opportunity", text: `${brandLabels[brand] || brand} AOV ₩${aov.toFixed(0)} — 고가 상품 번들 기회`, detail: `객단가가 높은 고객군. 업셀/크로스셀 전략 검토` });
      }
    }

    // ===== FUNNEL ANALYSIS =====
    const totalSessions = funnelRows.reduce((s, r) => s + Number(r.sessions), 0);
    const totalCartAdds = funnelRows.reduce((s, r) => s + Number(r.cart_adds), 0);
    const totalPurchases = funnelRows.reduce((s, r) => s + Number(r.purchases), 0);

    if (totalSessions > 0 && totalCartAdds > 0) {
      const convRate = (totalPurchases / totalSessions) * 100;
      const cartToOrder = (totalPurchases / totalCartAdds) * 100;
      const abandonRate = 100 - cartToOrder;

      if (convRate < 1.0) {
        insights.push({ type: "warning", text: `전환율 ${convRate.toFixed(2)}% — 업계 평균(2-3%) 미달`, detail: `세션 ${totalSessions} 중 ${totalPurchases}건만 구매. 랜딩페이지 및 상품페이지 최적화 필요` });
      }
      if (abandonRate > 70) {
        insights.push({ type: "critical", text: `장바구니 이탈률 ${abandonRate.toFixed(0)}% — 심각`, detail: `간편결제 추가, 무료배송 기준 조정, 장바구니 리마인더 설정 권장` });
      } else if (abandonRate > 50) {
        insights.push({ type: "warning", text: `장바구니 이탈률 ${abandonRate.toFixed(0)}% — 개선 여지`, detail: `배송비 사전 표시, 결제 단계 간소화 검토` });
      }
    }

    // ===== TOP PRODUCTS =====
    const prodMap = new Map<string, { revenue: number; quantity: number }>();
    for (const r of prodRows) {
      const existing = prodMap.get(r.product) || { revenue: 0, quantity: 0 };
      existing.revenue += Number(r.revenue);
      existing.quantity += Number(r.quantity);
      prodMap.set(r.product, existing);
    }
    const topProds = Array.from(prodMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
    if (topProds.length > 0) {
      const topProd = topProds[0];
      const topShare = totalRevenue > 0 ? (topProd[1].revenue / totalRevenue) * 100 : 0;
      if (topShare > 20) {
        insights.push({ type: "info", text: `'${topProd[0]}' 매출 비중 ${topShare.toFixed(0)}% — 히어로 상품`, detail: `이 제품 중심 마케팅 강화 + 연관 상품 번들 추천` });
      }
    }

    // ===== CHANNEL CONCENTRATION =====
    const salesChannelMap = new Map<string, number>();
    for (const r of salesRows) {
      salesChannelMap.set(r.channel, (salesChannelMap.get(r.channel) || 0) + Number(r.revenue));
    }
    for (const [ch, rev] of salesChannelMap.entries()) {
      const share = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
      if (share > 40) {
        insights.push({ type: "warning", text: `${ch} 매출 비중 ${share.toFixed(0)}% — 채널 집중 리스크`, detail: `특정 채널 의존도가 높습니다. 자사몰 비중 확대 전략 필요` });
      }
    }

    // Sort by priority
    const priority = { critical: 0, warning: 1, opportunity: 2, info: 3 };
    insights.sort((a, b) => priority[a.type] - priority[b.type]);

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("Insights API error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
