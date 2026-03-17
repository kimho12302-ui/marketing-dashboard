"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KPIData, TrendDataPoint } from "@/lib/types";
import Filters from "@/components/filters";
import KPICards from "@/components/kpi-cards";
import TrendChart from "@/components/trend-chart";
import ChannelChart from "@/components/channel-chart";
import BrandCompareChart from "@/components/brand-compare-chart";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
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
  const dates = getDefaultDates();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [kpi, setKpi] = useState<KPIData>(defaultKPI);
  const [trend, setTrend] = useState<TrendDataPoint[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [channelRoasTrend, setChannelRoasTrend] = useState<Record<string, any>[]>([]);
  const [brandRevenue, setBrandRevenue] = useState<{ brand: string; revenue: number; orders: number }[]>([]);
  const [brandRevenueTrend, setBrandRevenueTrend] = useState<Record<string, any>[]>([]);
  const [funnelSummary, setFunnelSummary] = useState<FunnelSummary>({ impressions: 0, sessions: 0, cartAdds: 0, purchases: 0, repurchases: 0, convRate: 0, cartToOrderRate: 0 });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesByChannel, setSalesByChannel] = useState<SalesChannel[]>([]);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GM-ROAS state (from ads data)
  const [adsChannels, setAdsChannels] = useState<{ channel: string; spend: number; conversionValue: number }[]>([]);

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

      if (adsRes.ok) {
        const adsData = await adsRes.json();
        setAdsChannels((adsData.channels || []).map((c: any) => ({ channel: c.channel, spend: c.spend, conversionValue: c.conversionValue })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Ensure all 4 brands are present in brandRevenue (add placeholder for missing)
  const fullBrandRevenue = ALL_BRANDS.map(b => {
    const found = brandRevenue.find(br => br.brand === b);
    return found || { brand: b, revenue: 0, orders: 0 };
  });

  // Product pie for 너티
  const nuttyProducts = topProducts.slice(0, 8); // top products are mostly nutty

  // GM-ROAS calculation
  const gmTotalRevenue = adsChannels.reduce((s, c) => s + (c.conversionValue || 0), 0);
  const gmTotalSpend = adsChannels.reduce((s, c) => s + c.spend, 0);
  const gmCogs = gmTotalRevenue * 0.4;
  const grossMarginRoas = gmTotalSpend > 0 ? (gmTotalRevenue - gmCogs) / gmTotalSpend : 0;

  const renderDrilldown = () => {
    if (!selectedKpi) return null;

    if (selectedKpi === "revenue") {
      return (
        <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardHeader><CardTitle>💰 매출 분석</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Brand Revenue */}
              <div>
                <p className="text-xs text-zinc-400 mb-3">브랜드별 매출</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fullBrandRevenue.map(b => ({ name: BRAND_LABELS[b.brand] || b.brand, revenue: b.revenue, fill: BRAND_COLORS[b.brand] || "#888" }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis type="number" tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                      <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#aaa", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
                        formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                        {fullBrandRevenue.map((b, i) => <Cell key={i} fill={BRAND_COLORS[b.brand] || "#888"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Show 데이터 없음 for zero-revenue brands */}
                {fullBrandRevenue.filter(b => b.revenue === 0).map(b => (
                  <p key={b.brand} className="text-xs text-zinc-500 mt-1">
                    {BRAND_LABELS[b.brand]}: ₩0 — <span className="text-zinc-600">데이터 없음</span>
                  </p>
                ))}
              </div>
              {/* Channel Revenue */}
              <div>
                <p className="text-xs text-zinc-400 mb-3">채널별 매출</p>
                <div className="space-y-2">
                  {salesByChannel.map((ch, i) => {
                    const maxRev = salesByChannel[0]?.revenue || 1;
                    const pct = (ch.revenue / maxRev) * 100;
                    const color = CHANNEL_COLORS[ch.channel] || PRODUCT_COLORS[i % PRODUCT_COLORS.length];
                    return (
                      <div key={ch.channel} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-20 truncate">{CH_LABELS[ch.channel] || ch.channel}</span>
                        <div className="flex-1 bg-zinc-800 rounded-full h-5 relative overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                          <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-medium text-zinc-300">₩{formatCompact(ch.revenue)}</span>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis yAxisId="spend" tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                  <YAxis yAxisId="roas" orientation="right" tick={{ fill: "#22c55e", fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
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
      return (
        <Card className="border-indigo-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardHeader><CardTitle>🛒 브랜드별 주문수</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fullBrandRevenue.map(b => ({ name: BRAND_LABELS[b.brand] || b.brand, orders: b.orders, fill: BRAND_COLORS[b.brand] || "#888" }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" tick={{ fill: "#888", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#aaa", fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
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
    }

    if (selectedKpi === "profit") {
      return (
        <Card className="border-yellow-500/30 animate-in slide-in-from-top-2 duration-200">
          <CardContent className="pt-4">
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">현재: 영업이익 = 매출 - 광고비 (원가 미반영)</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">매출</p>
                  <p className="text-lg font-bold text-green-400">₩{formatCompact(kpi.revenue)}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">광고비</p>
                  <p className="text-lg font-bold text-red-400">₩{formatCompact(kpi.adSpend)}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">이익</p>
                  <p className={`text-lg font-bold ${(kpi.profit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>₩{formatCompact(kpi.profit || 0)}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-500">⚠️ 설정 탭에서 제품별 원가를 입력하면 제조원가, 배송비, 판관비를 반영한 정확한 영업이익을 계산합니다.</p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="📊 Overview" subtitle="Executive Summary" />
        <Filters filters={filters} onChange={setFilters} />

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* Section 1: KPI Cards with Drilldown */}
            <section>
              <KPICards data={kpi} periodLabel={`${filters.from} ~ ${filters.to}`}
                onCardClick={(key) => setSelectedKpi(selectedKpi === key ? null : key)}
                selectedCard={selectedKpi} />
              {renderDrilldown()}
            </section>

            {/* Section 2: Trend + Channel (SPLIT into 광고비 and ROAS) */}
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">📈 매출 vs 광고비 트렌드</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <TrendChart data={trend} />
                <ChannelChart data={channels} mode="spend" />
              </div>
              <Card>
                <CardHeader><CardTitle>📊 채널별 ROAS 추이</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={channelRoasTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
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
            </section>

            {/* Section 3: Brand Revenue + Top Products + Product Pie */}
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">🏷️ 브랜드 & 상품</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Brand Compare with 밸런스랩 placeholder */}
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                          <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#aaa", fontSize: 12 }} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
                            formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                          <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                            {fullBrandRevenue.map((b, i) => <Cell key={i} fill={BRAND_COLORS[b.brand] || "#888"} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {fullBrandRevenue.filter(b => b.revenue === 0).map(b => (
                      <p key={b.brand} className="text-xs text-zinc-500 mt-2">
                        {BRAND_LABELS[b.brand]}: ₩0 — <span className="text-zinc-600 italic">데이터 없음</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>

                {/* Brand Revenue Trend */}
                <Card>
                  <CardHeader><CardTitle>📈 브랜드별 매출 트렌드</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={brandRevenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v: number) => formatCompact(v)} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }} formatter={(v: any) => [`₩${formatCompact(v)}`, ""]} />
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
                {/* Top 5 Products */}
                {topProducts.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>🏆 매출 TOP 5 제품</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {topProducts.map((p, i) => {
                          const maxRev = topProducts[0]?.revenue || 1;
                          const pct = (p.revenue / maxRev) * 100;
                          return (
                            <div key={p.product} className="flex items-center gap-3">
                              <span className="text-xs font-bold text-zinc-500 w-5">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-zinc-200 truncate">{p.product}</span>
                                  <span className="text-xs font-medium text-zinc-300 ml-2 whitespace-nowrap">₩{formatCompact(p.revenue)}</span>
                                </div>
                                <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PRODUCT_COLORS[i] }} />
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

              {/* Brand Revenue Pie Chart */}
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
                            >
                              {fullBrandRevenue.filter(b => b.revenue > 0).map((b, i) => (
                                <Cell key={i} fill={BRAND_COLORS[b.brand] || PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]}
                              contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </section>

            {/* Section 4: Funnel + Ad Performance + GM-ROAS */}
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">🔄 퍼널 & 광고 성과</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Funnel Mini */}
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
                              <span className="text-xs text-zinc-400 w-14">{step.label}</span>
                              <div className="flex-1 bg-zinc-800 rounded h-6 relative overflow-hidden">
                                <div className="absolute inset-y-0 left-0 rounded transition-all flex items-center" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: step.color }}>
                                  <span className="text-[10px] font-medium text-white ml-2 whitespace-nowrap">{formatCompact(step.value)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
                        <div className="text-center">
                          <p className="text-xl font-bold text-green-400">{funnelSummary.convRate.toFixed(2)}%</p>
                          <p className="text-[10px] text-zinc-500">전환율 (세션→구매)</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-orange-400">{funnelSummary.cartToOrderRate.toFixed(1)}%</p>
                          <p className="text-[10px] text-zinc-500">장바구니→구매율</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Ad Performance Mini */}
                <Card>
                  <CardHeader><CardTitle>광고 성과 요약</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-blue-400">₩{formatCompact(kpi.adSpend)}</p>
                          <p className="text-[10px] text-zinc-500">총 광고비</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${kpi.roas >= 3 ? "text-green-400" : kpi.roas >= 1.5 ? "text-yellow-400" : "text-red-400"}`}>
                            {kpi.roas.toFixed(2)}x
                          </p>
                          <p className="text-[10px] text-zinc-500">MER (ROAS)</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-orange-400">
                            ₩{kpi.orders > 0 ? formatCompact(Math.round(kpi.adSpend / kpi.orders)) : "0"}
                          </p>
                          <p className="text-[10px] text-zinc-500">CAC</p>
                        </div>
                      </div>
                      {/* Top channels with channel-specific colors */}
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-400">채널별 광고비</p>
                        {channels.sort((a, b) => b.spend - a.spend).slice(0, 5).map((ch) => {
                          const maxSpend = channels[0]?.spend || 1;
                          const pct = (ch.spend / maxSpend) * 100;
                          const color = CHANNEL_COLORS[ch.channel] || "#6366f1";
                          return (
                            <div key={ch.channel} className="flex items-center gap-2">
                              <span className="text-[11px] text-zinc-400 w-20 truncate">{CH_LABELS[ch.channel] || ch.channel}</span>
                              <div className="flex-1 bg-zinc-800 rounded-full h-4 relative overflow-hidden">
                                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-[10px] text-zinc-400 w-16 text-right">₩{formatCompact(ch.spend)}</span>
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

              {/* GM-ROAS Summary Card (moved from Ads page) */}
              {gmTotalSpend > 0 && (
                <div className="mt-6">
                  <Card className="border-emerald-500/20">
                    <CardHeader><CardTitle>📊 Gross Margin ROAS</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <p className="text-sm text-zinc-400">GM-ROAS (매출원가 40% 가정)</p>
                          <p className={`text-4xl font-bold ${grossMarginRoas >= 2.0 ? "text-green-400" : grossMarginRoas >= 1.0 ? "text-yellow-400" : "text-red-400"}`}>
                            {grossMarginRoas.toFixed(2)}x
                          </p>
                        </div>
                        <div className="text-xs text-zinc-500 space-y-1">
                          <p>매출: ₩{formatCompact(gmTotalRevenue)}</p>
                          <p>COGS: ₩{formatCompact(gmCogs)} (40%)</p>
                          <p>매출총이익: ₩{formatCompact(gmTotalRevenue - gmCogs)}</p>
                          <p>광고비: ₩{formatCompact(gmTotalSpend)}</p>
                        </div>
                        <div className="text-xs text-zinc-600 border-l border-zinc-800 pl-4">
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
    </main>
  );
}
