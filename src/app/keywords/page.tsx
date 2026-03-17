"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KeywordSummary } from "@/lib/types";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis,
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
    ctr: +(k.ctr * 100).toFixed(2),
    cpc: k.cpc,
    cost: k.cost,
    clicks: k.clicks,
  }));

  const avgCtr = scatterData.length > 0 ? scatterData.reduce((s, d) => s + d.ctr, 0) / scatterData.length : 0;
  const avgCpc = scatterData.length > 0 ? scatterData.reduce((s, d) => s + d.cpc, 0) / scatterData.length : 0;

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
              <CardHeader><CardTitle>키워드 효율 매트릭스 (CTR vs CPC)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis type="number" dataKey="cpc" name="CPC" tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                        label={{ value: "CPC (₩)", position: "bottom", fill: chartTheme.axisColor, fontSize: 11 }} />
                      <YAxis type="number" dataKey="ctr" name="CTR" tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                        label={{ value: "CTR (%)", angle: -90, position: "insideLeft", fill: chartTheme.axisColor, fontSize: 11 }} />
                      <ZAxis type="number" dataKey="clicks" range={[30, 300]} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle}
                        formatter={(value: any, name: any) => {
                          if (name === "CPC") return [`₩${formatCompact(value)}`, name];
                          if (name === "CTR") return [`${value}%`, name];
                          return [value, name];
                        }}
                        labelFormatter={() => ""} />
                      <Scatter data={scatterData} fill="#6366f1" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-400 dark:text-zinc-500">
                  <span>평균 CTR: {avgCtr.toFixed(2)}%</span>
                  <span>평균 CPC: ₩{formatCompact(avgCpc)}</span>
                  <span className="text-green-400">💡 좌상단 = 집중해야 할 키워드 (높은 CTR, 낮은 CPC)</span>
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
