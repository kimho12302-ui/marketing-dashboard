"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { DashboardFilters } from "@/lib/types";
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

const CHANNEL_COLORS: Record<string, string> = {
  카페24: "#8b5cf6", 스마트스토어: "#14b8a6", 쿠팡: "#f97316",
  에이블리: "#ec4899", 펫프렌즈: "#22c55e", 피피: "#6366f1",
};
const BRAND_COLORS: Record<string, string> = { "너티": "#6366f1", "아이언펫": "#22c55e", "사입": "#f97316", "밸런스랩": "#ec4899" };
const FALLBACK_COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#14b8a6", "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981"];
const TREND_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ec4899", "#eab308", "#8b5cf6", "#14b8a6", "#ef4444", "#6366f1", "#10b981"];

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface ProductRow { product: string; revenue: number; quantity: number; buyers: number; }

type QuadrantFilter = "all" | "product" | "channel" | "campaign";

const SCATTER_DATA = [
  { name: "사운드 냠단호박", cacIndex: 25, roasIndex: 85, spend: 4200000, type: "product", channel: "meta", campaign: "Spring_Sale" },
  { name: "사운드 바삭닭가슴살", cacIndex: 30, roasIndex: 78, spend: 3800000, type: "product", channel: "meta", campaign: "Spring_Sale" },
  { name: "하루루틴", cacIndex: 45, roasIndex: 62, spend: 2500000, type: "product", channel: "naver_search", campaign: "Brand_KW" },
  { name: "영양분석 키트(반려견)", cacIndex: 72, roasIndex: 55, spend: 5200000, type: "product", channel: "naver_shopping", campaign: "Shopping_Main" },
  { name: "영양분석 키트(반려묘)", cacIndex: 80, roasIndex: 35, spend: 3100000, type: "product", channel: "naver_shopping", campaign: "Shopping_Cat" },
  { name: "메타 광고", cacIndex: 35, roasIndex: 72, spend: 8500000, type: "channel", channel: "meta", campaign: "All_Meta" },
  { name: "네이버 검색", cacIndex: 42, roasIndex: 68, spend: 6200000, type: "channel", channel: "naver_search", campaign: "All_Naver" },
  { name: "네이버 쇼핑", cacIndex: 65, roasIndex: 45, spend: 4800000, type: "channel", channel: "naver_shopping", campaign: "All_Shopping" },
  { name: "구글 검색", cacIndex: 38, roasIndex: 58, spend: 2800000, type: "channel", channel: "google_search", campaign: "All_Google" },
  { name: "GDN", cacIndex: 85, roasIndex: 22, spend: 1500000, type: "channel", channel: "gdn", campaign: "All_GDN" },
  { name: "Spring_Sale", cacIndex: 28, roasIndex: 82, spend: 7000000, type: "campaign", channel: "meta", campaign: "Spring_Sale" },
  { name: "Brand_KW", cacIndex: 40, roasIndex: 65, spend: 4500000, type: "campaign", channel: "naver_search", campaign: "Brand_KW" },
  { name: "Shopping_Main", cacIndex: 58, roasIndex: 48, spend: 3200000, type: "campaign", channel: "naver_shopping", campaign: "Shopping_Main" },
  { name: "Retarget_Meta", cacIndex: 20, roasIndex: 90, spend: 2200000, type: "campaign", channel: "meta", campaign: "Retarget_Meta" },
  { name: "GDN_Display", cacIndex: 88, roasIndex: 18, spend: 1200000, type: "campaign", channel: "gdn", campaign: "GDN_Display" },
];

function getQuadrantColor(cacIndex: number, roasIndex: number): string {
  if (cacIndex <= 50 && roasIndex > 50) return "#22c55e";
  if (cacIndex > 50 && roasIndex > 50) return "#eab308";
  if (cacIndex <= 50 && roasIndex <= 50) return "#3b82f6";
  return "#ef4444";
}

export default function SalesPage() {
  const dates = getDefaultDates();
  const chartTheme = useChartTheme();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [channelPie, setChannelPie] = useState<{ name: string; value: number }[]>([]);
  const [brandPie, setBrandPie] = useState<{ name: string; value: number }[]>([]);
  const [categoryPie, setCategoryPie] = useState<{ name: string; value: number }[]>([]);
  const [channelTrend, setChannelTrend] = useState<Record<string, any>[]>([]);
  const [brandTrend, setBrandTrend] = useState<Record<string, any>[]>([]);
  const [productTrend, setProductTrend] = useState<Record<string, any>[]>([]);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quadrantFilter, setQuadrantFilter] = useState<QuadrantFilter>("all");

  const filteredScatter = SCATTER_DATA.filter(d => quadrantFilter === "all" || d.type === quadrantFilter);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const res = await fetch(`/api/product-sales?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setChannelPie(data.channelPie || []);
      setBrandPie(data.brandPie || []);
      setCategoryPie(data.categoryPie || []);
      setChannelTrend(data.channelTrend || []);
      setBrandTrend(data.brandTrend || []);
      setProductTrend(data.productTrend || []);
      setTopProducts(data.topProducts || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={channelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                          {channelPie.map((entry, i) => <Cell key={i} fill={CHANNEL_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
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
                          <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} />
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
                <CardHeader><CardTitle>📋 카테고리별 매출</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={85} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                          {categoryPie.map((_, i) => <Cell key={i} fill={["#f97316", "#8b5cf6", "#22c55e", "#ec4899", "#eab308", "#14b8a6"][i % 6]} />)}
                        </Pie>
                        <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={chartTheme.tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {categoryPie.length === 0 && <p className="text-xs text-gray-400 dark:text-zinc-500 text-center">카테고리 데이터 없음</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>채널별 매출 트렌드</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={channelTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle} />
                      <Legend />
                      {trendChannels.map((ch, i) => (
                        <Line key={ch} type="monotone" dataKey={ch} name={ch} stroke={CHANNEL_COLORS[ch] || TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
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
                        <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, ""]} />
                        <Legend />
                        {trendBrands.map((b, i) => (
                          <Line key={b} type="monotone" dataKey={b} name={b} stroke={BRAND_COLORS[b] || TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>📦 제품별 매출 트렌드 (TOP 5)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={productTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                        <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, ""]} />
                        <Legend formatter={(value: string) => value.length > 12 ? value.slice(0, 12) + "…" : value} />
                        {trendProducts.map((p, i) => (
                          <Line key={p} type="monotone" dataKey={p} name={p} stroke={TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
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
                  <div className="flex gap-1">
                    {(["all", "product", "channel", "campaign"] as QuadrantFilter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setQuadrantFilter(f)}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          quadrantFilter === f
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {f === "all" ? "전체" : f === "product" ? "상품" : f === "channel" ? "채널" : "캠페인"}
                      </button>
                    ))}
                  </div>
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
                        contentStyle={chartTheme.tooltipStyle}
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
                          contentStyle={chartTheme.tooltipStyle}
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
