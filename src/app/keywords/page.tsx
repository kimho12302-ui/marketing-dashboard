"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KeywordSummary } from "@/lib/types";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis, ReferenceLine, Cell,
} from "recharts";

const PLATFORM_LABELS: Record<string, string> = {
  naver_search: "네이버검색", naver_shopping: "네이버쇼핑", google_search: "구글검색",
};

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function KeywordsPage() {
  const dates = getDefaultDates();
  const chartTheme = useChartTheme();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [keywords, setKeywords] = useState<KeywordSummary[]>([]);
  const [platformTab, setPlatformTab] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const res = await fetch(`/api/keywords-v2?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setKeywords(data.keywords || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = platformTab === "all" ? keywords : keywords.filter(k => k.platform === platformTab);
  const scatterData = filtered.map(k => ({
    keyword: k.keyword,
    platform: k.platform,
    ctr: +(k.ctr * 100).toFixed(2),
    cpc: k.cpc,
    cost: k.cost,
    clicks: k.clicks,
    impressions: k.impressions,
    conversions: k.conversions,
  }));

  const avgCtr = scatterData.length > 0 ? scatterData.reduce((s, d) => s + d.ctr, 0) / scatterData.length : 0;
  const avgCpc = scatterData.length > 0 ? scatterData.reduce((s, d) => s + d.cpc, 0) / scatterData.length : 0;

  // Quadrant classification
  const getQuadrant = (ctr: number, cpc: number) => {
    if (ctr >= avgCtr && cpc <= avgCpc) return "star";     // High CTR, Low CPC — 스타 키워드
    if (ctr >= avgCtr && cpc > avgCpc) return "expensive";  // High CTR, High CPC — 비용 최적화 필요
    if (ctr < avgCtr && cpc <= avgCpc) return "potential";  // Low CTR, Low CPC — 잠재력
    return "review";                                         // Low CTR, High CPC — 재검토
  };
  const QUAD_COLORS: Record<string, string> = {
    star: "#22c55e", expensive: "#f97316", potential: "#6366f1", review: "#ef4444",
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="🔍 Keywords" subtitle="검색어 분석" />
        <Filters filters={filters} onChange={setFilters} />

        <div className="flex rounded-lg bg-gray-100 dark:bg-zinc-800 p-0.5 w-fit">
          {[{ value: "all", label: "전체" }, ...Object.entries(PLATFORM_LABELS).map(([v, l]) => ({ value: v, label: l }))].map(opt => (
            <button key={opt.value} onClick={() => setPlatformTab(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${platformTab === opt.value ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"}`}>
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle>🔬 키워드 효율 매트릭스 (버블차트)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ bottom: 20, left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis type="number" dataKey="ctr" name="CTR" tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                        label={{ value: "CTR (%)", position: "bottom", fill: chartTheme.axisColor, fontSize: 11, dy: 10 }}
                        domain={[0, "auto"]} />
                      <YAxis type="number" dataKey="cpc" name="CPC" tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                        label={{ value: "CPC (₩)", angle: -90, position: "insideLeft", fill: chartTheme.axisColor, fontSize: 11, dx: -5 }}
                        scale="log" domain={[100, "auto"]} allowDataOverflow />
                      <ZAxis type="number" dataKey="clicks" range={[40, 400]} name="클릭수" />
                      <ReferenceLine y={avgCpc} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.6} />
                      <ReferenceLine x={avgCtr} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.6} />
                      <Tooltip
                        contentStyle={chartTheme.tooltipStyle}
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div style={chartTheme.tooltipStyle} className="rounded-lg shadow-lg p-3 min-w-[180px]">
                              <p className="font-bold text-sm mb-1" style={{ color: QUAD_COLORS[getQuadrant(d.ctr, d.cpc)] }}>{d.keyword}</p>
                              <p className="text-xs text-gray-400">{PLATFORM_LABELS[d.platform] || d.platform}</p>
                              <div className="mt-2 space-y-0.5 text-xs">
                                <p>CTR: <span className="font-medium">{d.ctr}%</span></p>
                                <p>CPC: <span className="font-medium">₩{formatCompact(d.cpc)}</span></p>
                                <p>클릭: <span className="font-medium">{d.clicks.toLocaleString()}</span></p>
                                <p>노출: <span className="font-medium">{d.impressions.toLocaleString()}</span></p>
                                <p>비용: <span className="font-medium">₩{formatCompact(d.cost)}</span></p>
                                <p>전환: <span className="font-medium">{d.conversions}</span></p>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={scatterData}>
                        {scatterData.map((d, i) => (
                          <Cell key={i} fill={QUAD_COLORS[getQuadrant(d.ctr, d.cpc)]} fillOpacity={0.7} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                  <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/10 rounded px-2 py-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-gray-600 dark:text-zinc-300">⭐ 스타 (높은CTR, 낮은CPC)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/10 rounded px-2 py-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <span className="text-gray-600 dark:text-zinc-300">💸 비용최적화 (높은CTR, 높은CPC)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/10 rounded px-2 py-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span className="text-gray-600 dark:text-zinc-300">💡 잠재력 (낮은CTR, 낮은CPC)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/10 rounded px-2 py-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-gray-600 dark:text-zinc-300">🚨 재검토 (낮은CTR, 높은CPC)</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-400 dark:text-zinc-500">
                  <span>평균 CTR: {avgCtr.toFixed(2)}%</span>
                  <span>평균 CPC: ₩{formatCompact(avgCpc)}</span>
                  <span>버블 크기 = 클릭수</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>키워드 상세</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-zinc-700">
                        <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">키워드</th>
                        <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">플랫폼</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">노출</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">클릭</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">CTR</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">CPC</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">비용</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">전환</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.sort((a, b) => b.cost - a.cost).slice(0, 30).map((kw, i) => {
                        const isHighlight = (kw.ctr * 100) > avgCtr && kw.cpc < avgCpc;
                        return (
                          <tr key={`${kw.keyword}-${kw.platform}-${i}`} className={`border-b border-gray-100 dark:border-zinc-800 ${isHighlight ? "bg-green-50 dark:bg-green-900/10" : "hover:bg-gray-50 dark:hover:bg-zinc-800/50"}`}>
                            <td className="py-2.5 px-2 text-gray-800 dark:text-zinc-200">
                              {isHighlight && <span className="mr-1">🌟</span>}{kw.keyword}
                            </td>
                            <td className="py-2.5 px-2 text-gray-500 dark:text-zinc-400">{PLATFORM_LABELS[kw.platform] || kw.platform}</td>
                            <td className="py-2.5 px-2 text-right">{kw.impressions.toLocaleString()}</td>
                            <td className="py-2.5 px-2 text-right">{kw.clicks.toLocaleString()}</td>
                            <td className="py-2.5 px-2 text-right">{(kw.ctr * 100).toFixed(2)}%</td>
                            <td className="py-2.5 px-2 text-right">₩{formatCompact(kw.cpc)}</td>
                            <td className="py-2.5 px-2 text-right">₩{formatCompact(kw.cost)}</td>
                            <td className="py-2.5 px-2 text-right">{kw.conversions.toLocaleString()}</td>
                          </tr>
                        );
                      })}
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
