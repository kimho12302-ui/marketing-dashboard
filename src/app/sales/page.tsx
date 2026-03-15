"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters } from "@/lib/types";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  ScatterChart, Scatter, ZAxis, Legend, ReferenceLine,
} from "recharts";

const COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#14b8a6", "#f43f5e", "#8b5cf6"];
const CHANNEL_LABELS: Record<string, string> = {
  cafe24: "카페24", smartstore: "스마트스토어", coupang: "쿠팡", ably: "에이블리",
};
const CATEGORY_LABELS: Record<string, string> = {
  간식: "간식 (너티)", 사료: "사료", 영양제: "영양제", 검사키트: "아이언펫",
};

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface ProductRow { product: string; revenue: number; quantity: number; buyers: number; }

// Northbeam-style 4-quadrant scatter data
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
  if (cacIndex <= 50 && roasIndex > 50) return "#22c55e"; // TopLeft: low CAC, high ROAS = 🟢
  if (cacIndex > 50 && roasIndex > 50) return "#eab308";  // TopRight: high CAC, high ROAS = 🟡
  if (cacIndex <= 50 && roasIndex <= 50) return "#3b82f6"; // BottomLeft: low CAC, low ROAS = 🔵
  return "#ef4444"; // BottomRight: high CAC, low ROAS = 🔴
}

export default function SalesPage() {
  const dates = getDefaultDates();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [channelPie, setChannelPie] = useState<{ name: string; value: number }[]>([]);
  const [categoryPie, setCategoryPie] = useState<{ name: string; value: number }[]>([]);
  const [channelTrend, setChannelTrend] = useState<Record<string, any>[]>([]);
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
      setCategoryPie(data.categoryPie || []);
      setChannelTrend(data.channelTrend || []);
      setTopProducts(data.topProducts || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="💰 Sales" subtitle="매출 분석" />
        <Filters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* Pie Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>채널별 매출</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={channelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {channelPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>카테고리별 매출</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryPie}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 12 }} />
                        <YAxis tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                        <Tooltip formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]} contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }} />
                        <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]}>
                          {categoryPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Channel Trend */}
            <Card>
              <CardHeader><CardTitle>채널별 매출 트렌드</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={channelTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }} />
                      {Object.keys(CHANNEL_LABELS).map((ch, i) => (
                        <Line key={ch} type="monotone" dataKey={ch} name={CHANNEL_LABELS[ch]} stroke={COLORS[i]} dot={false} strokeWidth={2} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Northbeam-style 4-Quadrant Scatter */}
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
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis type="number" dataKey="cacIndex" name="CAC Index" domain={[0, 100]}
                        tick={{ fill: "#888", fontSize: 12 }}
                        label={{ value: "CAC Index →", position: "bottom", fill: "#666", fontSize: 11 }} />
                      <YAxis type="number" dataKey="roasIndex" name="ROAS Index" domain={[0, 100]}
                        tick={{ fill: "#888", fontSize: 12 }}
                        label={{ value: "ROAS Index →", angle: -90, position: "left", fill: "#666", fontSize: 11 }} />
                      <ZAxis type="number" dataKey="spend" range={[100, 1000]} name="광고비" />
                      <ReferenceLine x={50} stroke="#555" strokeDasharray="5 5" />
                      <ReferenceLine y={50} stroke="#555" strokeDasharray="5 5" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
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
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Low CAC + High ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> High CAC + High ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Low CAC + Low ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> High CAC + Low ROAS</span>
                </div>
              </CardContent>
            </Card>

            {/* Top 10 Products */}
            <Card>
              <CardHeader><CardTitle>Top 10 상품</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-3 px-2 text-zinc-400">#</th>
                        <th className="text-left py-3 px-2 text-zinc-400">상품명</th>
                        <th className="text-right py-3 px-2 text-zinc-400">매출</th>
                        <th className="text-right py-3 px-2 text-zinc-400">판매량</th>
                        <th className="text-right py-3 px-2 text-zinc-400">구매자수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((row, i) => (
                        <tr key={row.product} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                          <td className="py-2.5 px-2 text-zinc-500">{i + 1}</td>
                          <td className="py-2.5 px-2 text-zinc-200">{row.product}</td>
                          <td className="py-2.5 px-2 text-right text-zinc-100 font-medium">₩{formatCompact(row.revenue)}</td>
                          <td className="py-2.5 px-2 text-right text-zinc-300">{row.quantity.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right text-zinc-300">{row.buyers.toLocaleString()}</td>
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
