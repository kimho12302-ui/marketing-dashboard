"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useFilters } from "@/lib/filter-context";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  ScatterChart, Scatter, ZAxis, Legend, ReferenceLine,
} from "recharts";
import { useEvents } from "@/components/event-markers";

const CHANNEL_COLORS: Record<string, string> = {
  카페24: "#8b5cf6", 스마트스토어: "#14b8a6", 쿠팡: "#f97316",
  에이블리: "#ec4899", 펫프렌즈: "#22c55e", 피피: "#6366f1",
};
const BRAND_COLORS: Record<string, string> = { "너티": "#6366f1", "아이언펫": "#22c55e", "사입": "#f97316", "밸런스랩": "#ec4899" };
const FALLBACK_COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#14b8a6", "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981"];
const TREND_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ec4899", "#eab308", "#8b5cf6", "#14b8a6", "#ef4444", "#6366f1", "#10b981"];

interface ProductRow { product: string; revenue: number; quantity: number; buyers: number; }

type QuadrantFilter = "all" | "channel";

// Scatter data will be built from channel ad data (dynamic)

function getQuadrantColor(cacIndex: number, roasIndex: number): string {
  if (cacIndex <= 50 && roasIndex > 50) return "#22c55e";
  if (cacIndex > 50 && roasIndex > 50) return "#eab308";
  if (cacIndex <= 50 && roasIndex <= 50) return "#3b82f6";
  return "#ef4444";
}

interface GongguSeller { seller: string; revenue: number; orders: number; }

export default function SalesPage() {
  const chartTheme = useChartTheme();
  const events = useEvents();
  const { filters, setFilters } = useFilters();
  const [channelPie, setChannelPie] = useState<{ name: string; value: number }[]>([]);
  const [brandPie, setBrandPie] = useState<{ name: string; value: number }[]>([]);
  const [categoryPie, setCategoryPie] = useState<{ name: string; value: number }[]>([]);
  const [breakdownPie, setBreakdownPie] = useState<{ name: string; value: number }[]>([]);
  const [breakdownTitle, setBreakdownTitle] = useState("카테고리별 매출");
  const [ordersTrend, setOrdersTrend] = useState<Record<string, any>[]>([]);
  const [channelTrend, setChannelTrend] = useState<Record<string, any>[]>([]);
  const [brandTrend, setBrandTrend] = useState<Record<string, any>[]>([]);
  const [productTrend, setProductTrend] = useState<Record<string, any>[]>([]);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quadrantFilter, setQuadrantFilter] = useState<QuadrantFilter>("all");
  const [gongguSales, setGongguSales] = useState<GongguSeller[]>([]);
  const [gongguSalesTotal, setGongguSalesTotal] = useState(0);
  const [selfSalesTotal, setSelfSalesTotal] = useState(0);
  const [channelAds, setChannelAds] = useState<{ channel: string; spend: number; conversions: number; roas: number }[]>([]);
  const [gongguTargets, setGongguTargets] = useState<{ seller: string; target: number; note: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const [res, dashRes, adsRes] = await Promise.all([
        fetch(`/api/product-sales?${params}`),
        (filters.brand === "balancelab" || filters.brand === "all")
          ? fetch(`/api/dashboard?brand=${filters.brand}&from=${filters.from}&to=${filters.to}`)
          : Promise.resolve(null),
        fetch(`/api/ads?${params}`),
      ]);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setChannelPie(data.channelPie || []);
      setBrandPie(data.brandPie || []);
      setCategoryPie(data.categoryPie || []);
      setBreakdownPie(data.breakdownPie || data.categoryPie || []);
      setBreakdownTitle(data.breakdownTitle || "카테고리별 매출");
      setOrdersTrend(data.ordersTrend || []);
      setChannelTrend(data.channelTrend || []);
      setBrandTrend(data.brandTrend || []);
      setProductTrend(data.productTrend || []);
      setTopProducts(data.topProducts || []);

      if (dashRes && dashRes.ok) {
        const dashData = await dashRes.json();
        setGongguSales(dashData.gongguSales || []);
        setGongguSalesTotal(dashData.gongguSalesTotal || 0);
        setSelfSalesTotal(dashData.selfSalesTotal || 0);
        setGongguTargets(dashData.gongguTargets || []);
      } else {
        setGongguSales([]);
        setGongguSalesTotal(0);
        setSelfSalesTotal(0);
        setGongguTargets([]);
      }
      if (adsRes && adsRes.ok) {
        const adsData = await adsRes.json();
        setChannelAds((adsData.channels || []).map((c: any) => ({
          channel: c.channel,
          spend: c.spend,
          conversions: c.conversions,
          roas: c.roas,
        })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build scatter data from actual channel ads data
  const scatterData = useMemo(() => {
    if (channelAds.length === 0) return [];
    const CH_LABELS: Record<string, string> = {
      meta: "Meta", naver_search: "네이버검색", naver_shopping: "네이버쇼핑",
      google_search: "구글검색", "ga4_Performance Max": "P-Max", "ga4_Search": "Google검색(GA4)",
      coupang: "쿠팡광고", gfa: "GFA",
    };
    // Normalize: CAC index (0-100) and ROAS index (0-100)
    const withCac = channelAds.filter(c => c.spend > 0).map(c => ({
      channel: c.channel,
      name: CH_LABELS[c.channel] || c.channel,
      spend: c.spend,
      cac: c.conversions > 0 ? c.spend / c.conversions : c.spend,
      roas: c.roas,
      type: "channel" as const,
    }));
    if (withCac.length === 0) return [];
    const maxCac = Math.max(...withCac.map(c => c.cac));
    const maxRoas = Math.max(...withCac.map(c => c.roas));
    return withCac.map(c => ({
      ...c,
      cacIndex: maxCac > 0 ? Math.round((c.cac / maxCac) * 100) : 50,
      roasIndex: maxRoas > 0 ? Math.round((c.roas / maxRoas) * 100) : 50,
    }));
  }, [channelAds]);

  const filteredScatter = quadrantFilter === "all" ? scatterData : scatterData.filter(d => d.type === quadrantFilter);

  const trendChannels = useMemo(() => {
    if (channelTrend.length === 0) return [];
    const keys = new Set<string>();
    for (const row of channelTrend) {
      for (const key of Object.keys(row)) {
        if (key !== "date") keys.add(key);
      }
    }
    return Array.from(keys);
  }, [channelTrend]);

  const ordersBrands = useMemo(() => {
    if (ordersTrend.length === 0) return [];
    const keys = new Set<string>();
    for (const row of ordersTrend) {
      for (const key of Object.keys(row)) {
        if (key !== "date") keys.add(key);
      }
    }
    return Array.from(keys);
  }, [ordersTrend]);

  const trendBrands = useMemo(() => {
    if (brandTrend.length === 0) return [];
    const keys = new Set<string>();
    for (const row of brandTrend) {
      for (const key of Object.keys(row)) {
        if (key !== "date") keys.add(key);
      }
    }
    return Array.from(keys);
  }, [brandTrend]);

  const trendProducts = useMemo(() => {
    if (productTrend.length === 0) return [];
    const keys = new Set<string>();
    for (const row of productTrend) {
      for (const key of Object.keys(row)) {
        if (key !== "date") keys.add(key);
      }
    }
    return Array.from(keys);
  }, [productTrend]);

  const fullBrandPie = useMemo(() => {
    const allBrands = ["너티", "아이언펫", "사입", "밸런스랩"];
    return allBrands.map(name => {
      const found = brandPie.find(b => b.name === name);
      return found || { name, value: 0 };
    });
  }, [brandPie]);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="💰 Sales" subtitle="매출 분석" />
        <Filters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 ${filters.brand === "all" ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-6`}>
              <Card>
                <CardHeader><CardTitle>📦 채널별 매출</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    {channelPie.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={channelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                            {channelPie.map((entry, i) => <Cell key={i} fill={CHANNEL_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-gray-400">데이터 없음</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {filters.brand === "all" && (
                <Card>
                  <CardHeader><CardTitle>🏷️ 브랜드별 매출</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={fullBrandPie} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                          <YAxis type="category" dataKey="name" width={65} tick={{ fill: chartTheme.labelColor, fontSize: 11 }} />
                          <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                            {fullBrandPie.map((entry, i) => (
                              <Cell key={i} fill={BRAND_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {fullBrandPie.filter(b => b.value === 0).map(b => (
                      <p key={b.name} className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                        {b.name}: ₩0 — <span className="text-gray-300 dark:text-zinc-600 italic">데이터 없음</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle>📋 {breakdownTitle}</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={breakdownPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={85} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                          {breakdownPie.map((_, i) => <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {breakdownPie.length === 0 && <p className="text-xs text-gray-400 dark:text-zinc-500 text-center">데이터 없음</p>}
                </CardContent>
              </Card>
            </div>

            {/* 공구 브레이크다운: 밸런스랩 선택 시 또는 전체에서 공구 데이터 있을 때 */}
            {(filters.brand === "balancelab" || filters.brand === "all") && (gongguSalesTotal > 0 || selfSalesTotal > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>🏪 자체판매 vs 공동구매</CardTitle></CardHeader>
                  <CardContent>
                    {(() => {
                      const total = selfSalesTotal + gongguSalesTotal;
                      const selfPct = total > 0 ? (selfSalesTotal / total * 100).toFixed(1) : "0";
                      const gongguPct = total > 0 ? (gongguSalesTotal / total * 100).toFixed(1) : "0";
                      const pieData = [
                        { name: "자체판매", value: selfSalesTotal },
                        { name: "공동구매", value: gongguSalesTotal },
                      ];
                      const colors = ["#6366f1", "#ec4899"];
                      return (
                        <>
                          <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80}
                                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                  labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                                  {pieData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                                </Pie>
                                <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/30 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 dark:text-zinc-400">자체판매</p>
                              <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">₩{formatCompact(selfSalesTotal)}</p>
                              <p className="text-xs text-gray-400 dark:text-zinc-500">{selfPct}%</p>
                            </div>
                            <div className="bg-pink-50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-800/30 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 dark:text-zinc-400">공동구매</p>
                              <p className="text-lg font-bold text-pink-600 dark:text-pink-400">₩{formatCompact(gongguSalesTotal)}</p>
                              <p className="text-xs text-gray-400 dark:text-zinc-500">{gongguPct}%</p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>🤝 공구별 매출 상세</CardTitle></CardHeader>
                  <CardContent>
                    {gongguSales.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-zinc-700">
                              <th className="text-left py-2.5 px-2 text-gray-500 dark:text-zinc-400">셀러명</th>
                              <th className="text-right py-2.5 px-2 text-gray-500 dark:text-zinc-400">매출</th>
                              <th className="text-right py-2.5 px-2 text-gray-500 dark:text-zinc-400">주문수</th>
                              <th className="text-right py-2.5 px-2 text-gray-500 dark:text-zinc-400">비중(%)</th>
                              {gongguTargets.length > 0 && (
                                <th className="text-right py-2.5 px-2 text-gray-500 dark:text-zinc-400">목표 달성</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {gongguSales.map((row) => {
                              const pct = gongguSalesTotal > 0 ? (row.revenue / gongguSalesTotal * 100).toFixed(1) : "0";
                              const target = gongguTargets.find(t => t.seller === row.seller);
                              const targetPct = target && target.target > 0 ? (row.revenue / target.target * 100) : null;
                              return (
                                <tr key={row.seller} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                  <td className="py-2 px-2 text-gray-800 dark:text-zinc-200 font-medium">{row.seller}</td>
                                  <td className="py-2 px-2 text-right text-gray-900 dark:text-zinc-100">₩{formatCompact(row.revenue)}</td>
                                  <td className="py-2 px-2 text-right text-gray-600 dark:text-zinc-300">{row.orders.toLocaleString()}</td>
                                  <td className="py-2 px-2 text-right text-gray-500 dark:text-zinc-400">{pct}%</td>
                                  {gongguTargets.length > 0 && (
                                    <td className="py-2 px-2 text-right">
                                      {targetPct !== null ? (
                                        <div className="flex items-center justify-end gap-2">
                                          <div className="w-16 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${targetPct >= 100 ? "bg-green-500" : targetPct >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                                              style={{ width: `${Math.min(targetPct, 100)}%` }} />
                                          </div>
                                          <span className={`text-xs font-medium ${targetPct >= 100 ? "text-green-500" : targetPct >= 70 ? "text-yellow-500" : "text-red-500"}`}>
                                            {Math.round(targetPct)}%
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-gray-300 dark:text-zinc-600">-</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-300 dark:border-zinc-600 font-semibold">
                              <td className="py-2 px-2 text-gray-700 dark:text-zinc-300">합계</td>
                              <td className="py-2 px-2 text-right text-gray-900 dark:text-zinc-100">₩{formatCompact(gongguSalesTotal)}</td>
                              <td className="py-2 px-2 text-right text-gray-600 dark:text-zinc-300">{gongguSales.reduce((s, r) => s + r.orders, 0).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right text-gray-500 dark:text-zinc-400">100%</td>
                              {gongguTargets.length > 0 && <td />}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">공동구매 데이터가 없습니다</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle>채널별 매출 트렌드</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={channelTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                      <Legend />
                      {trendChannels.map((ch, i) => (
                        <Line key={ch} type="monotone" dataKey={ch} name={ch} stroke={CHANNEL_COLORS[ch] || TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
                      ))}
                      {events.map((e) => (
                        <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                          label={{ value: e.title, position: "top", fill: e.color, fontSize: 9 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>🏷️ 브랜드별 매출 트렌드</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={brandTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                        <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, ""]} />
                        <Legend />
                        {trendBrands.map((b, i) => (
                          <Line key={b} type="monotone" dataKey={b} name={b} stroke={BRAND_COLORS[b] || TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
                        ))}
                        {events.map((e) => (
                          <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                            label={{ value: e.title, position: "top", fill: e.color, fontSize: 9 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>🛒 브랜드별 주문수 트렌드</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ordersTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                        <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} formatter={(v: any) => [`${Number(v).toLocaleString()}건`, ""]} />
                        <Legend />
                        {ordersBrands.map((b, i) => (
                          <Line key={b} type="monotone" dataKey={b} name={b} stroke={BRAND_COLORS[b] || TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
                        ))}
                        {events.map((e) => (
                          <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                            label={{ value: e.title, position: "top", fill: e.color, fontSize: 9 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>📦 제품별 매출 트렌드 (TOP 5)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={productTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                        <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, ""]} />
                        <Legend formatter={(value: string) => value.length > 12 ? value.slice(0, 12) + "…" : value} />
                        {trendProducts.map((p, i) => (
                          <Line key={p} type="monotone" dataKey={p} name={p} stroke={TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
                        ))}
                        {events.map((e) => (
                          <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                            label={{ value: e.title, position: "top", fill: e.color, fontSize: 9 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>📊 CAC vs ROAS 4분면 분석</CardTitle>
                  {scatterData.length === 0 && (
                    <span className="text-xs text-gray-400 dark:text-zinc-500">광고 데이터가 있으면 채널별 CAC/ROAS가 표시됩니다</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis type="number" dataKey="cacIndex" name="CAC Index" domain={[0, 100]}
                        tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                        label={{ value: "CAC Index →", position: "bottom", fill: chartTheme.axisColor, fontSize: 11 }} />
                      <YAxis type="number" dataKey="roasIndex" name="ROAS Index" domain={[0, 100]}
                        tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                        label={{ value: "ROAS Index →", angle: -90, position: "left", fill: chartTheme.axisColor, fontSize: 11 }} />
                      <ZAxis type="number" dataKey="spend" range={[100, 1000]} name="광고비" />
                      <ReferenceLine x={50} stroke={chartTheme.referenceLine} strokeDasharray="5 5" />
                      <ReferenceLine y={50} stroke={chartTheme.referenceLine} strokeDasharray="5 5" />
                      <Tooltip
                        contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle}
                        formatter={(value: any, name: any) => {
                          if (name === "광고비") return [`₩${formatCompact(value as number)}`, name];
                          return [value, name];
                        }}
                        labelFormatter={(_, payload) => {
                          if (payload && payload[0]) return (payload[0].payload as any).name;
                          return "";
                        }}
                      />
                      <Scatter data={filteredScatter}>
                        {filteredScatter.map((entry, i) => (
                          <Cell key={i} fill={getQuadrantColor(entry.cacIndex, entry.roasIndex)} fillOpacity={0.8} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-400 dark:text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Low CAC + High ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> High CAC + High ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Low CAC + Low ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> High CAC + Low ROAS</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 rounded-lg p-3">
                    <p className="font-semibold text-green-600 dark:text-green-400 mb-1">🟢 좌상단: 최적 (Low CAC + High ROAS)</p>
                    <p className="text-gray-500 dark:text-zinc-400">고객 획득 비용이 낮고 수익률이 높은 최고 효율 영역. 예산 확대를 권장합니다.</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-3">
                    <p className="font-semibold text-yellow-600 dark:text-yellow-400 mb-1">🟡 우상단: 성장 (High CAC + High ROAS)</p>
                    <p className="text-gray-500 dark:text-zinc-400">수익률은 좋지만 획득 비용이 높습니다. CAC를 낮출 수 있는 최적화 여지가 있습니다.</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-3">
                    <p className="font-semibold text-blue-600 dark:text-blue-400 mb-1">🔵 좌하단: 관찰 (Low CAC + Low ROAS)</p>
                    <p className="text-gray-500 dark:text-zinc-400">비용은 낮지만 수익도 낮습니다. 전환율 개선이나 타겟 최적화가 필요합니다.</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-lg p-3">
                    <p className="font-semibold text-red-600 dark:text-red-400 mb-1">🔴 우하단: 위험 (High CAC + Low ROAS)</p>
                    <p className="text-gray-500 dark:text-zinc-400">비용 대비 효율이 가장 나쁜 영역. 예산 축소 또는 전략 재검토가 시급합니다.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top 10 상품</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">#</th>
                          <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">상품명</th>
                          <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">매출</th>
                          <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">판매량</th>
                          <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">구매자수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((row, i) => (
                          <tr key={row.product} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                            <td className="py-2.5 px-2 text-gray-400 dark:text-zinc-500">{i + 1}</td>
                            <td className="py-2.5 px-2 text-gray-800 dark:text-zinc-200 max-w-[200px] truncate">{row.product}</td>
                            <td className="py-2.5 px-2 text-right text-gray-900 dark:text-zinc-100 font-medium">₩{formatCompact(row.revenue)}</td>
                            <td className="py-2.5 px-2 text-right text-gray-600 dark:text-zinc-300">{row.quantity.toLocaleString()}</td>
                            <td className="py-2.5 px-2 text-right text-gray-600 dark:text-zinc-300">{row.buyers.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topProducts.map((p, i) => ({
                          name: p.product.length > 15 ? p.product.slice(0, 15) + "…" : p.product,
                          revenue: p.revenue,
                          idx: i,
                        }))}
                        layout="vertical"
                        margin={{ left: 10, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fill: chartTheme.labelColor, fontSize: 11 }} />
                        <Tooltip
                          formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]}
                          contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle}
                        />
                        <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                          {topProducts.map((_, i) => (
                            <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
