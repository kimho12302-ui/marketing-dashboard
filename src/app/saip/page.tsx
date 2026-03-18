"use client";

import { useState, useEffect, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";

const COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#14b8a6", "#f43f5e", "#8b5cf6"];

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 90);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface LineupData { name: string; revenue: number; quantity: number; count: number; }
interface ProductData { product: string; revenue: number; quantity: number; lineup: string; }
interface ChannelData { name: string; value: number; }
interface TrendPoint { date: string; revenue: number; }

export default function SaipPage() {
  const chart = useChartTheme();
  const { filters } = useFilters();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [byLineup, setByLineup] = useState<LineupData[]>([]);
  const [byProduct, setByProduct] = useState<ProductData[]>([]);
  const [byChannel, setByChannel] = useState<ChannelData[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedLineup, setSelectedLineup] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/saip?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setByLineup(data.byLineup || []);
      setByProduct(data.byProduct || []);
      setByChannel(data.byChannel || []);
      setTrend(data.trend || []);
      setTotalRevenue(data.totalRevenue || 0);
      setTotalQuantity(data.totalQuantity || 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredProducts = selectedLineup
    ? byProduct.filter(p => p.lineup === selectedLineup)
    : byProduct;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="📦 사입 브랜드" subtitle="파미나 · 닥터레이 · 고네이티브 · 테라카니스" />
        
        {/* Date Range */}
        <div className="flex gap-2 items-center">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-200" />
          <span className="text-gray-400 dark:text-zinc-500">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-200" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* KPI Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 매출</p>
                  <p className="text-2xl font-bold text-orange-400">₩{formatCompact(totalRevenue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 판매량</p>
                  <p className="text-2xl font-bold">{totalQuantity.toLocaleString()}개</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">브랜드 수</p>
                  <p className="text-2xl font-bold">{byLineup.length}개</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">제품 수</p>
                  <p className="text-2xl font-bold">{byProduct.length}개</p>
                </CardContent>
              </Card>
            </div>

            {/* Brand (Lineup) Breakdown + Channel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>사입 브랜드별 매출</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byLineup.map(l => ({ name: l.name, value: l.revenue }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                          label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                          onClick={(_, index) => setSelectedLineup(selectedLineup === byLineup[index].name ? null : byLineup[index].name)}>
                          {byLineup.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} contentStyle={chart.tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {selectedLineup && (
                    <p className="text-xs text-indigo-400 text-center mt-2">🔍 {selectedLineup} 제품만 표시 중 (클릭해서 해제)</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>채널별 매출</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byChannel} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={chart.gridColor} />
                        <XAxis type="number" tick={{ fill: chart.tickColor, fontSize: 12 }} tickFormatter={(v) => formatCompact(v)} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fill: chart.tickColor, fontSize: 12 }} />
                        <Tooltip formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} contentStyle={chart.tooltipStyle} />
                        <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]}>
                          {byChannel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Trend */}
            <Card>
              <CardHeader><CardTitle>사입 매출 트렌드</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.gridColor} />
                      <XAxis dataKey="date" tick={{ fill: chart.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chart.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={chart.tooltipStyle}
                        formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                      <Area type="monotone" dataKey="revenue" fill="#f97316" fillOpacity={0.3} stroke="#f97316" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Product Table */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedLineup ? `${selectedLineup} 제품별 매출` : "전체 제품별 매출"}
                  <span className="text-xs text-gray-400 dark:text-zinc-500 ml-2">({filteredProducts.length}개)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-zinc-700">
                        <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">#</th>
                        <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">제품명</th>
                        <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">브랜드</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">매출</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">판매량</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.slice(0, 30).map((row, i) => (
                        <tr key={`${row.product}-${i}`} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                          <td className="py-2.5 px-2 text-gray-400 dark:text-zinc-500">{i + 1}</td>
                          <td className="py-2.5 px-2 text-gray-800 dark:text-zinc-200">{row.product}</td>
                          <td className="py-2.5 px-2 text-gray-500 dark:text-zinc-400">{row.lineup}</td>
                          <td className="py-2.5 px-2 text-right font-medium">₩{formatCompact(row.revenue)}</td>
                          <td className="py-2.5 px-2 text-right">{row.quantity.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right text-gray-500 dark:text-zinc-400">{totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
