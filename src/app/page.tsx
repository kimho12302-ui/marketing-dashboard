"use client";

import { useState, useEffect, useCallback } from "react";
import type { KPIData, TrendDataPoint } from "@/lib/types";
import { useFilters } from "@/lib/filter-context";
import Filters from "@/components/filters";
import KPICards from "@/components/kpi-cards";
import AnomalyBanner from "@/components/anomaly-banner";
import MissingDataAlert from "@/components/missing-data-alert";
import ExportReport from "@/components/export-report";
import SyncButton from "@/components/sync-button";
import TrendChart from "@/components/trend-chart";
import ChannelChart from "@/components/channel-chart";
import BrandCompareChart from "@/components/brand-compare-chart";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
  PieChart, Pie, LineChart, Line,
} from "recharts";

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const defaultKPI: KPIData = {
  revenue: 0, revenuePrev: 0, adSpend: 0, adSpendPrev: 0,
  roas: 0, roasPrev: 0, orders: 0, ordersPrev: 0,
  profit: 0, profitPrev: 0, mer: 0, merPrev: 0, aov: 0, aovPrev: 0,
};

interface ChannelData { channel: string; spend: number; roas: number; }
interface FunnelSummary { impressions: number; sessions: number; cartAdds: number; purchases: number; repurchases: number; convRate: number; cartToOrderRate: number; }
interface TopProduct { product: string; revenue: number; quantity: number; }
interface SalesChannel { channel: string; revenue: number; }

const BRAND_COLORS: Record<string, string> = { nutty: "#6366f1", ironpet: "#22c55e", saip: "#f97316", balancelab: "#ec4899" };
const BRAND_LABELS: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
const ALL_BRANDS = ["nutty", "ironpet", "saip", "balancelab"];
const CH_LABELS: Record<string, string> = {
  meta: "Meta", naver_search: "네이버검색", naver_shopping: "네이버쇼핑",
  google_search: "구글검색", "ga4_Performance Max": "P-Max", "ga4_Search": "Google검색(GA4)",
  coupang: "쿠팡광고", smartstore: "스마트스토어", cafe24: "카페24",
};
const CHANNEL_COLORS: Record<string, string> = {
  meta: "#3b82f6", naver_search: "#22c55e", naver_shopping: "#10b981",
  google_search: "#ef4444", "ga4_Performance Max": "#eab308", "ga4_Search": "#ef4444",
  coupang: "#f97316", smartstore: "#14b8a6", cafe24: "#8b5cf6",
};
const PRODUCT_COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e"];
const FUNNEL_COLORS = ["#3b82f6", "#6366f1", "#a78bfa", "#22c55e", "#14b8a6"];

export default function OverviewPage() {
  const chartTheme = useChartTheme();
  const { filters, setFilters } = useFilters();
  const [kpi, setKpi] = useState<KPIData>(defaultKPI);
  const [trend, setTrend] = useState<TrendDataPoint[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [channelRoasTrend, setChannelRoasTrend] = useState<Record<string, any>[]>([]);
  const [brandRevenue, setBrandRevenue] = useState<{ brand: string; revenue: number; orders: number }[]>([]);
  const [brandRevenueTrend, setBrandRevenueTrend] = useState<Record<string, any>[]>([]);
  const [funnelSummary, setFunnelSummary] = useState<FunnelSummary>({ impressions: 0, sessions: 0, cartAdds: 0, purchases: 0, repurchases: 0, convRate: 0, cartToOrderRate: 0 });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesByChannel, setSalesByChannel] = useState<SalesChannel[]>([]);
  const [brandAdSpend, setBrandAdSpend] = useState<{ brand: string; spend: number; share: number }[]>([]);
  const [brandRoasTrend, setBrandRoasTrend] = useState<Record<string, any>[]>([]);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adsChannels, setAdsChannels] = useState<{ channel: string; spend: number; conversionValue: number }[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [gongguSales, setGongguSales] = useState<{ seller: string; revenue: number; orders: number }[]>([]);
  const [gongguSalesTotal, setGongguSalesTotal] = useState(0);
  const [selfSalesTotal, setSelfSalesTotal] = useState(0);
  const [gongguTargets, setGongguTargets] = useState<{ seller: string; target: number; note: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period: filters.period, brand: filters.brand, from: filters.from, to: filters.to,
      });
      const [dashRes, adsRes] = await Promise.all([
        fetch(`/api/dashboard?${params}`),
        fetch(`/api/ads?${new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to })}`),
      ]);
      if (!dashRes.ok) throw new Error("데이터를 불러오는데 실패했습니다");
      const data = await dashRes.json();
      setKpi(data.kpi || defaultKPI);
      setTrend(data.trend || []);
      setChannels(data.channels || []);
      setChannelRoasTrend(data.channelRoasTrend || []);
      setBrandRevenue(data.brandRevenue || []);
      setBrandRevenueTrend(data.brandRevenueTrend || []);
      setFunnelSummary(data.funnelSummary || { impressions: 0, sessions: 0, cartAdds: 0, purchases: 0, repurchases: 0, convRate: 0, cartToOrderRate: 0 });
      setTopProducts(data.topProducts || []);
      setSalesByChannel(data.salesByChannel || []);
      setBrandAdSpend(data.brandAdSpend || []);
      setBrandRoasTrend(data.brandRoasTrend || []);
      setTargets(data.targets || {});
      setGongguSales(data.gongguSales || []);
      setGongguSalesTotal(data.gongguSalesTotal || 0);
      setSelfSalesTotal(data.selfSalesTotal || 0);
      setGongguTargets(data.gongguTargets || []);

      if (adsRes.ok) {
        const adsData = await adsRes.json();
        setAdsChannels((adsData.channels || []).map((c: any) => ({ channel: c.channel, spend: c.spend, conversionValue: c.conversionValue })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fullBrandRevenue = ALL_BRANDS.map(b => {
    const found = brandRevenue.find(br => br.brand === b);
    return found || { brand: b, revenue: 0, orders: 0 };
  });

  const gmTotalRevenue = adsChannels.reduce((s, c) => s + (c.conversionValue || 0), 0);
  const gmTotalSpend = adsChannels.reduce((s, c) => s + c.spend, 0);
  const hasActualCogs = (kpi.cogs || 0) > 0;
  const gmCogs = hasActualCogs ? (kpi.cogs || 0) : gmTotalRevenue * 0.4;
  const grossMarginRoas = gmTotalSpend > 0 ? (gmTotalRevenue - gmCogs) / gmTotalSpend : 0;

  const renderDrilldown = () => {
    if (!selectedKpi) return null;

    if (selectedKpi === "revenue") {
      return (
        <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardHeader><CardTitle>💰 매출 분석</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">브랜드별 매출</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fullBrandRevenue.map(b => ({ name: BRAND_LABELS[b.brand] || b.brand, revenue: b.revenue, fill: BRAND_COLORS[b.brand] || "#888" }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                      <YAxis type="category" dataKey="name" width={70} tick={{ fill: chartTheme.labelColor, fontSize: 12 }} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle}
                        formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                        {fullBrandRevenue.map((b, i) => <Cell key={i} fill={BRAND_COLORS[b.brand] || "#888"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {fullBrandRevenue.filter(b => b.revenue === 0).map(b => (
                  <p key={b.brand} className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                    {BRAND_LABELS[b.brand]}: ₩0 — <span className="text-gray-300 dark:text-zinc-600">데이터 없음</span>
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">채널별 매출</p>
                <div className="space-y-2">
                  {salesByChannel.map((ch, i) => {
                    const maxRev = salesByChannel[0]?.revenue || 1;
                    const pct = (ch.revenue / maxRev) * 100;
                    const color = CHANNEL_COLORS[ch.channel] || PRODUCT_COLORS[i % PRODUCT_COLORS.length];
                    return (
                      <div key={ch.channel} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-zinc-400 w-20 truncate">{CH_LABELS[ch.channel] || ch.channel}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-5 relative overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                          <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium text-gray-700 dark:text-zinc-300">₩{formatCompact(ch.revenue)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (selectedKpi === "adSpend" || selectedKpi === "roas") {
      const data = channels.map(c => ({
        name: CH_LABELS[c.channel] || c.channel,
        channel: c.channel,
        spend: c.spend,
        roas: c.roas,
      })).sort((a, b) => b.spend - a.spend);
      return (
        <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardHeader><CardTitle>{selectedKpi === "adSpend" ? "📢 채널별 광고비" : "📈 채널별 ROAS"}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis dataKey="name" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis yAxisId="spend" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                  <YAxis yAxisId="roas" orientation="right" tick={{ fill: "#22c55e", fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                  <Tooltip contentStyle={chartTheme.tooltipStyle}
                    formatter={(v: any, name: any) => [name === "광고비" ? `₩${formatCompact(v)}` : `${Number(v).toFixed(2)}x`, name]} />
                  <Legend />
                  <Bar yAxisId="spend" dataKey="spend" name="광고비" radius={[4, 4, 0, 0]}>
                    {data.map((d, i) => <Cell key={i} fill={CHANNEL_COLORS[d.channel] || PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />)}
                  </Bar>
                  <Bar yAxisId="roas" dataKey="roas" name="ROAS" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (selectedKpi === "orders") {
      if (filters.brand === "all") {
        // 전체: 브랜드별 주문수
        return (
          <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
            <CardHeader><CardTitle>🛒 브랜드별 주문수</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fullBrandRevenue.map(b => ({ name: BRAND_LABELS[b.brand] || b.brand, orders: b.orders, fill: BRAND_COLORS[b.brand] || "#888" }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                    <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={70} tick={{ fill: chartTheme.labelColor, fontSize: 12 }} />
                    <Tooltip contentStyle={chartTheme.tooltipStyle}
                      formatter={(v: any) => [`${v}건`, "주문수"]} />
                    <Bar dataKey="orders" radius={[0, 6, 6, 0]}>
                      {fullBrandRevenue.map((b, i) => <Cell key={i} fill={BRAND_COLORS[b.brand] || "#888"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      } else {
        // 개별 브랜드: 채널별 주문수
        return (
          <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
            <CardHeader><CardTitle>🛒 채널별 주문 비중</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">판매 채널 매출 (주문 포함)</p>
                  <div className="space-y-2">
                    {salesByChannel.sort((a, b) => b.revenue - a.revenue).map((ch, i) => {
                      const total = salesByChannel.reduce((s, c) => s + c.revenue, 0);
                      const pct = total > 0 ? (ch.revenue / total * 100) : 0;
                      return (
                        <div key={ch.channel} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 dark:text-zinc-300 w-24 truncate">{ch.channel}</span>
                          <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-5 relative overflow-hidden">
                            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">{pct.toFixed(0)}%</span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-zinc-400 w-16 text-right">₩{formatCompact(ch.revenue)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">총 주문수: <span className="font-bold text-indigo-400">{kpi.orders.toLocaleString()}건</span></p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">AOV: <span className="font-bold">₩{formatCompact(kpi.aov || 0)}</span></p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2">이전 대비: <span className={kpi.orders >= kpi.ordersPrev ? "text-green-400" : "text-red-400"}>{kpi.ordersPrev > 0 ? `${((kpi.orders / kpi.ordersPrev - 1) * 100).toFixed(1)}%` : "N/A"}</span></p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      }
    }

    if (selectedKpi === "profit") {
      const hasCogs = (kpi.cogs || 0) > 0;
      const costBreakdown = [
        { label: "매출", value: kpi.revenue, color: "text-green-400", icon: "💰" },
        { label: "제품원가 (COGS)", value: kpi.cogs || 0, color: "text-orange-400", icon: "📦", sub: [
          { label: "판매원가", value: (kpi.cogs || 0) - (kpi.manufacturing || 0) - (kpi.productShipping || 0) },
          { label: "제작원가", value: kpi.manufacturing || 0 },
          { label: "제품 배송비", value: kpi.productShipping || 0 },
        ]},
        { label: "광고비", value: kpi.adSpend - (kpi.miscCost || 0), color: "text-red-400", icon: "📢" },
        { label: "건별 마케팅비", value: kpi.miscCost || 0, color: "text-pink-400", icon: "🧾" },
        { label: "배송비", value: kpi.shippingCost || 0, color: "text-blue-400", icon: "📦", sub: kpi.shippingOrders ? [
          { label: `${kpi.shippingOrders.toLocaleString()}건`, value: kpi.shippingOrders > 0 ? (kpi.shippingCost || 0) / kpi.shippingOrders : 0 },
        ] : undefined },
      ];
      const totalCost = (kpi.cogs || 0) + kpi.adSpend + (kpi.shippingCost || 0);
      return (
        <Card className="border-yellow-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardContent className="pt-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-200">
                영업이익 = 매출 - 제품원가 - 광고비 - 건별비용
              </p>
              <div className="space-y-2">
                {costBreakdown.map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-center py-1.5 px-2 bg-gray-50 dark:bg-zinc-800/50 rounded">
                      <span className="text-sm text-gray-600 dark:text-zinc-300">{item.icon} {item.label}</span>
                      <span className={`text-sm font-bold ${item.color}`}>
                        {i === 0 ? "+" : "-"}₩{formatCompact(item.value)}
                      </span>
                    </div>
                    {item.sub && item.value > 0 && (
                      <div className="ml-6 space-y-0.5 mt-0.5">
                        {item.sub.map((s, j) => (
                          <div key={j} className="flex justify-between text-xs text-gray-400 dark:text-zinc-500 px-2">
                            <span>└ {s.label}</span>
                            <span>₩{formatCompact(s.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="border-t border-gray-200 dark:border-zinc-700 pt-2 flex justify-between items-center px-2">
                  <span className="text-sm font-bold text-gray-700 dark:text-zinc-200">= 영업이익</span>
                  <span className={`text-lg font-bold ${(kpi.profit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ₩{formatCompact(kpi.profit || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 dark:text-zinc-500 px-2">
                  <span>영업이익률</span>
                  <span>{kpi.revenue > 0 ? ((kpi.profit || 0) / kpi.revenue * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
              {!hasCogs && (
                <p className="text-xs text-yellow-500 mt-2">⚠️ 제품 원가가 미입력 상태입니다. 설정 → 제품 원가에서 입력하면 정확한 영업이익이 계산됩니다.</p>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }
    if (selectedKpi === "cac") {
      const totalSpend = kpi.adSpend;
      const funnelSteps = [
        { label: "노출", key: "impressions", value: funnelSummary.impressions, icon: "👁️" },
        { label: "유입 (세션)", key: "sessions", value: funnelSummary.sessions, icon: "🚪" },
        { label: "장바구니", key: "cartAdds", value: funnelSummary.cartAdds, icon: "🛒" },
        { label: "구매", key: "purchases", value: funnelSummary.purchases, icon: "💳" },
        { label: "재구매", key: "repurchases", value: funnelSummary.repurchases, icon: "🔄" },
      ];
      return (
        <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardHeader><CardTitle>🎯 퍼널별 CAC (Cost per Action)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-4">CAC = 총 광고비(₩{formatCompact(totalSpend)}) ÷ 각 퍼널 단계 수</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {funnelSteps.map((step) => {
                const cac = step.value > 0 ? totalSpend / step.value : 0;
                return (
                  <div key={step.key} className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-4 text-center">
                    <span className="text-2xl">{step.icon}</span>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">{step.label}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1">
                      {step.value > 0 ? `₩${formatCompact(cac)}` : "-"}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                      {step.value > 0 ? `${step.value.toLocaleString()}건` : "데이터 없음"}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="📊 Overview" subtitle="Executive Summary" />
          <div className="flex items-center gap-2">
            <SyncButton onComplete={() => fetchData()} />
            <ExportReport targetId="overview-content" filename="PPMI-Overview" />
          </div>
        </div>
        <Filters filters={filters} onChange={setFilters} />

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}

        <div id="overview-content" className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            <MissingDataAlert />
            <AnomalyBanner data={kpi} />

            <section>
              <KPICards data={kpi} periodLabel={`${filters.from} ~ ${filters.to}`}
                onCardClick={(key) => setSelectedKpi(selectedKpi === key ? null : key)}
                selectedCard={selectedKpi}
                targets={targets} />
              {renderDrilldown()}
            </section>

            <section>
              <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-3">📈 매출 vs 광고비 트렌드</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <TrendChart data={trend} />
                <Card>
                  <CardHeader><CardTitle>🏷️ 브랜드별 광고비</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {brandAdSpend.map((b) => {
                        const label = BRAND_LABELS[b.brand] || b.brand;
                        const maxSpend = brandAdSpend[0]?.spend || 1;
                        return (
                          <div key={b.brand}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-700 dark:text-zinc-300">{label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">₩{formatCompact(b.spend)}</span>
                                <span className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{(b.share * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${(b.spend / maxSpend) * 100}%`, backgroundColor: BRAND_COLORS[b.brand] || "#888" }} />
                            </div>
                          </div>
                        );
                      })}
                      {brandAdSpend.length === 0 && <p className="text-sm text-gray-400 dark:text-zinc-500">데이터 없음</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {/* ChannelChart removed — 채널별 광고비는 하단 광고 성과 요약에서 표시 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>📊 채널별 ROAS 추이</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={channelRoasTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                        <Tooltip
                          contentStyle={chartTheme.tooltipStyle}
                          formatter={(value: any, name: any) => [`${Number(value).toFixed(2)}x`, CH_LABELS[name as string] || name]}
                          labelFormatter={(label: any) => String(label)}
                        />
                        <Legend formatter={(value: string) => CH_LABELS[value] || value} />
                        {channels.map((ch) => (
                          <Line
                            key={ch.channel}
                            type="monotone"
                            dataKey={ch.channel}
                            name={ch.channel}
                            stroke={CHANNEL_COLORS[ch.channel] || "#888"}
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>🏷️ 브랜드별 ROAS 추이</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={brandRoasTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                        <Tooltip
                          contentStyle={chartTheme.tooltipStyle}
                          formatter={(value: any, name: any) => [`${Number(value).toFixed(2)}x`, BRAND_LABELS[name as string] || name]}
                          labelFormatter={(label: any) => String(label)}
                        />
                        <Legend formatter={(value: string) => BRAND_LABELS[value] || value} />
                        {brandAdSpend.map((b) => (
                          <Line
                            key={b.brand}
                            type="monotone"
                            dataKey={b.brand}
                            name={b.brand}
                            stroke={BRAND_COLORS[b.brand] || "#888"}
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              </div>
            </section>

            {/* 밸런스랩 공동구매 현황 카드 */}
            {(gongguSales.length > 0 || selfSalesTotal > 0) && (
              <section>
                <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-3">🤝 밸런스랩 공동구매 현황</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle>자체판매 vs 공동구매</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                          <p className="text-xs text-gray-500 dark:text-zinc-400">자체판매</p>
                          <p className="text-xl font-bold text-blue-400">₩{formatCompact(selfSalesTotal)}</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                          <p className="text-xs text-gray-500 dark:text-zinc-400">공동구매</p>
                          <p className="text-xl font-bold text-purple-400">₩{formatCompact(gongguSalesTotal)}</p>
                        </div>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                        {(selfSalesTotal + gongguSalesTotal) > 0 && (
                          <>
                            <div className="bg-blue-400 h-full" style={{ width: `${(selfSalesTotal / (selfSalesTotal + gongguSalesTotal)) * 100}%` }} />
                            <div className="bg-purple-400 h-full" style={{ width: `${(gongguSalesTotal / (selfSalesTotal + gongguSalesTotal)) * 100}%` }} />
                          </>
                        )}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-400">{(selfSalesTotal + gongguSalesTotal) > 0 ? `${((selfSalesTotal / (selfSalesTotal + gongguSalesTotal)) * 100).toFixed(0)}%` : ""}</span>
                        <span className="text-[10px] text-gray-400">{(selfSalesTotal + gongguSalesTotal) > 0 ? `${((gongguSalesTotal / (selfSalesTotal + gongguSalesTotal)) * 100).toFixed(0)}%` : ""}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle>공구별 매출</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {gongguSales.map((g, i) => {
                          const maxRev = gongguSales[0]?.revenue || 1;
                          const pct = (g.revenue / maxRev) * 100;
                          const target = gongguTargets.find(t => t.seller === g.seller);
                          const achievePct = target && target.target > 0 ? (g.revenue / target.target * 100) : null;
                          return (
                            <div key={g.seller}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-gray-700 dark:text-zinc-300">{g.seller}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">₩{formatCompact(g.revenue)}</span>
                                  <span className="text-[10px] text-gray-400">{g.orders}건</span>
                                  {achievePct !== null && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${achievePct >= 100 ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
                                      {achievePct.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-purple-400" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {gongguSales.length === 0 && <p className="text-sm text-gray-400">공동구매 데이터 없음</p>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-3">🏷️ 브랜드 & 상품</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>브랜드별 매출</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={fullBrandRevenue.map(b => ({
                          name: BRAND_LABELS[b.brand] || b.brand,
                          revenue: b.revenue,
                          brand: b.brand,
                        }))} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                          <YAxis type="category" dataKey="name" width={70} tick={{ fill: chartTheme.labelColor, fontSize: 12 }} />
                          <Tooltip contentStyle={chartTheme.tooltipStyle}
                            formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                          <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                            {fullBrandRevenue.map((b, i) => <Cell key={i} fill={BRAND_COLORS[b.brand] || "#888"} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {fullBrandRevenue.filter(b => b.revenue === 0).map(b => (
                      <p key={b.brand} className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
                        {BRAND_LABELS[b.brand]}: ₩0 — <span className="text-gray-300 dark:text-zinc-600 italic">데이터 없음</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>📈 브랜드별 매출 트렌드</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={brandRevenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} />
                          <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, ""]} />
                          <Legend />
                          {Object.keys(BRAND_LABELS).map(k => {
                            const label = BRAND_LABELS[k];
                            return <Line key={label} type="monotone" dataKey={label} name={label} stroke={BRAND_COLORS[k] || "#888"} dot={false} strokeWidth={2} connectNulls />;
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {topProducts.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>🏆 매출 TOP 5 제품</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {topProducts.map((p: any, i: number) => {
                          const maxRev = topProducts[0]?.revenue || 1;
                          const pct = (p.revenue / maxRev) * 100;
                          const barColor = BRAND_COLORS[p.brand] || PRODUCT_COLORS[i];
                          return (
                            <div key={p.product} className="flex items-center gap-3">
                              <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 w-5">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-gray-800 dark:text-zinc-200 truncate">{p.product}</span>
                                  <span className="text-xs font-medium text-gray-600 dark:text-zinc-300 ml-2 whitespace-nowrap">₩{formatCompact(p.revenue)}</span>
                                </div>
                                <div className="bg-gray-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {fullBrandRevenue.some(b => b.revenue > 0) && (
                <div className="mt-6">
                  <Card>
                    <CardHeader><CardTitle>🏷️ 브랜드별 매출 비중</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={fullBrandRevenue.filter(b => b.revenue > 0).map(b => ({ name: BRAND_LABELS[b.brand] || b.brand, value: b.revenue, brand: b.brand }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              innerRadius={40}
                              label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                              labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}
                            >
                              {fullBrandRevenue.filter(b => b.revenue > 0).map((b, i) => (
                                <Cell key={i} fill={BRAND_COLORS[b.brand] || PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]}
                              contentStyle={chartTheme.tooltipStyle}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-3">🔄 퍼널 & 광고 성과</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>전환 퍼널</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        {[
                          { label: "노출", value: funnelSummary.impressions, color: FUNNEL_COLORS[0] },
                          { label: "세션", value: funnelSummary.sessions, color: FUNNEL_COLORS[1] },
                          { label: "장바구니", value: funnelSummary.cartAdds, color: FUNNEL_COLORS[2] },
                          { label: "구매", value: funnelSummary.purchases, color: FUNNEL_COLORS[3] },
                          { label: "재구매", value: funnelSummary.repurchases, color: FUNNEL_COLORS[4] },
                        ].map((step) => {
                          const maxVal = funnelSummary.impressions || 1;
                          const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
                          return (
                            <div key={step.label} className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-zinc-400 w-14">{step.label}</span>
                              <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded h-6 relative overflow-hidden">
                                <div className="absolute inset-y-0 left-0 rounded transition-all flex items-center" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: step.color }}>
                                  <span className="text-[10px] font-medium text-white ml-2 whitespace-nowrap">{formatCompact(step.value)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-zinc-800">
                        <div className="text-center">
                          <p className="text-xl font-bold text-green-400">{funnelSummary.convRate.toFixed(2)}%</p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">전환율 (세션→구매)</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-orange-400">{funnelSummary.cartToOrderRate.toFixed(1)}%</p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">장바구니→구매율</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>광고 성과 요약</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-blue-400">₩{formatCompact(kpi.adSpend)}</p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">총 광고비</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${kpi.roas >= 3 ? "text-green-400" : kpi.roas >= 1.5 ? "text-yellow-400" : "text-red-400"}`}>
                            {kpi.roas.toFixed(2)}x
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">MER (ROAS)</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-orange-400">
                            ₩{kpi.orders > 0 ? formatCompact(Math.round(kpi.adSpend / kpi.orders)) : "0"}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">CAC</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 dark:text-zinc-400">채널별 광고비</p>
                        {channels.sort((a, b) => b.spend - a.spend).slice(0, 5).map((ch) => {
                          const maxSpend = channels[0]?.spend || 1;
                          const pct = (ch.spend / maxSpend) * 100;
                          const color = CHANNEL_COLORS[ch.channel] || "#6366f1";
                          return (
                            <div key={ch.channel} className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500 dark:text-zinc-400 w-20 truncate">{CH_LABELS[ch.channel] || ch.channel}</span>
                              <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-4 relative overflow-hidden">
                                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-[10px] text-gray-500 dark:text-zinc-400 w-16 text-right">₩{formatCompact(ch.spend)}</span>
                              <span className={`text-[10px] font-medium w-10 text-right ${ch.roas >= 2 ? "text-green-400" : ch.roas >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                                {ch.roas.toFixed(1)}x
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {gmTotalSpend > 0 && (
                <div className="mt-6">
                  <Card className="border-emerald-500/20">
                    <CardHeader><CardTitle>📊 Gross Margin ROAS</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <p className="text-sm text-gray-500 dark:text-zinc-400">GM-ROAS ({hasActualCogs ? "실제 원가 기준" : "매출원가 40% 가정"})</p>
                          <p className={`text-4xl font-bold ${grossMarginRoas >= 2.0 ? "text-green-400" : grossMarginRoas >= 1.0 ? "text-yellow-400" : "text-red-400"}`}>
                            {grossMarginRoas.toFixed(2)}x
                          </p>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-zinc-500 space-y-1">
                          <p>매출: ₩{formatCompact(gmTotalRevenue)}</p>
                          <p>COGS: ₩{formatCompact(gmCogs)} ({hasActualCogs ? "실제" : "40%"})</p>
                          <p>매출총이익: ₩{formatCompact(gmTotalRevenue - gmCogs)}</p>
                          <p>광고비: ₩{formatCompact(gmTotalSpend)}</p>
                        </div>
                        <div className="text-xs text-gray-300 dark:text-zinc-600 border-l border-gray-200 dark:border-zinc-800 pl-4">
                          <p>GM-ROAS = (매출 - 매출원가) ÷ 광고비</p>
                          <p>일반 ROAS보다 실질 수익성을 더 정확히 반영합니다.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </section>
          </>
        )}
        </div>
      </div>
    </main>
  );
}
