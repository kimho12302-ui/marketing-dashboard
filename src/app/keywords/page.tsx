"use client";

import { useState, useEffect, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import type { KeywordSummary } from "@/lib/types";
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

export default function KeywordsPage() {
  const chartTheme = useChartTheme();
  const { filters, setFilters } = useFilters();
  const [keywords, setKeywords] = useState<KeywordSummary[]>([]);
  const [platformTab, setPlatformTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gscData, setGscData] = useState<{ query: string; device: string; clicks: number; impressions: number; ctr: number; position: number }[]>([]);
  const [gscSummary, setGscSummary] = useState<{ totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number }>({ totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 });
  const [naverCampaigns, setNaverCampaigns] = useState<any[]>([]);
  const [naverSummary, setNaverSummary] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const [kwRes, gscRes, ncRes] = await Promise.all([
        fetch(`/api/keywords-v2?${params}`),
        fetch(`/api/gsc?${params}`),
        fetch(`/api/naver-campaigns?${params}`),
      ]);
      if (kwRes.ok) { const d = await kwRes.json(); setKeywords(d.keywords || []); }
      if (gscRes.ok) { const d = await gscRes.json(); setGscData(d.queries || []); setGscSummary(d.summary || { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 }); }
      if (ncRes.ok) { const d = await ncRes.json(); setNaverCampaigns(d.campaigns || []); setNaverSummary(d.summary || null); }
    } catch { setError("키워드 데이터를 불러오는데 실패했습니다."); } finally { setLoading(false); }
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
          {[{ value: "all", label: "전체" }, ...Object.entries(PLATFORM_LABELS).map(([v, l]) => ({ value: v, label: l })), { value: "gsc", label: "🔎 서치콘솔" }].map(opt => (
            <button key={opt.value} onClick={() => setPlatformTab(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${platformTab === opt.value ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"}`}>
              {opt.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : platformTab === "naver_shopping" ? (
          <>
            {/* Naver Shopping Campaign KPIs */}
            {naverSummary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 노출</p>
                  <p className="text-xl font-bold">{naverSummary.totalImpressions.toLocaleString()}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 클릭</p>
                  <p className="text-xl font-bold">{naverSummary.totalClicks.toLocaleString()}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 비용</p>
                  <p className="text-xl font-bold">₩{formatCompact(naverSummary.totalCost)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">평균 CTR</p>
                  <p className="text-xl font-bold">{naverSummary.avgCtr.toFixed(2)}%</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">평균 CPC</p>
                  <p className="text-xl font-bold">₩{naverSummary.avgCpc.toLocaleString()}</p>
                </CardContent></Card>
              </div>
            )}

            {/* Campaign Performance Table */}
            <Card>
              <CardHeader><CardTitle>📊 네이버 쇼핑 캠페인별 성과</CardTitle></CardHeader>
              <CardContent>
                {naverCampaigns.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-500 text-center py-8">데이터가 없습니다</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">캠페인</th>
                          <th className="text-center py-2 px-2 text-gray-500 dark:text-zinc-400">유형</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">노출</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">클릭</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">CTR</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">CPC</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">비용</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">전환</th>
                        </tr>
                      </thead>
                      <tbody>
                        {naverCampaigns.map((c: any) => {
                          const typeColor: Record<string, string> = { "쇼핑검색": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", "파워링크": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", "벌크": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", "기타": "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400" };
                          return (
                            <tr key={c.campaignId} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                              <td className="py-2 px-2 font-medium text-gray-800 dark:text-zinc-200">{c.campaignName}</td>
                              <td className="py-2 px-2 text-center"><span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${typeColor[c.type] || typeColor["기타"]}`}>{c.type}</span></td>
                              <td className="py-2 px-2 text-right">{c.impressions.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{c.clicks.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{c.ctr.toFixed(2)}%</td>
                              <td className="py-2 px-2 text-right">₩{c.cpc.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-medium">₩{formatCompact(c.cost)}</td>
                              <td className="py-2 px-2 text-right">{c.conversions}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost Distribution Bar */}
            <Card>
              <CardHeader><CardTitle>💰 캠페인별 비용 비중</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {naverCampaigns.map((c: any) => {
                    const totalCost = naverCampaigns.reduce((s: number, x: any) => s + x.cost, 0);
                    const pct = totalCost > 0 ? (c.cost / totalCost) * 100 : 0;
                    return (
                      <div key={c.campaignId} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 dark:text-zinc-400 w-40 truncate">{c.campaignName}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-5 relative overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 3)}%` }}>
                            <span className="text-[10px] text-white font-medium">{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-zinc-500 w-16 text-right">₩{formatCompact(c.cost)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        ) : platformTab === "gsc" ? (
          <>
            {/* GSC Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500 dark:text-zinc-400">총 클릭</p>
                <p className="text-2xl font-bold text-indigo-400">{gscSummary.totalClicks.toLocaleString()}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500 dark:text-zinc-400">총 노출</p>
                <p className="text-2xl font-bold text-blue-400">{gscSummary.totalImpressions.toLocaleString()}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500 dark:text-zinc-400">평균 CTR</p>
                <p className="text-2xl font-bold text-green-400">{(gscSummary.avgCtr * 100).toFixed(2)}%</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500 dark:text-zinc-400">평균 순위</p>
                <p className="text-2xl font-bold text-orange-400">{gscSummary.avgPosition.toFixed(1)}</p>
              </CardContent></Card>
            </div>

            {/* GSC Bubble Chart — Looker Studio style */}
            <Card>
              <CardHeader><CardTitle>🔎 검색 실적 최적화 (서치콘솔)</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const DEVICE_COLORS: Record<string, string> = { MOBILE: "#3b82f6", DESKTOP: "#22c55e", TABLET: "#ec4899" };
                  // Aggregate by query for bubble chart
                  const qMap = new Map<string, { clicks: number; impressions: number; ctrSum: number; posSum: number; count: number; device: string }>();
                  for (const r of gscData) {
                    const key = `${r.query}|${r.device}`;
                    const ex = qMap.get(key) || { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0, device: r.device };
                    ex.clicks += r.clicks; ex.impressions += r.impressions; ex.ctrSum += r.ctr; ex.posSum += r.position; ex.count++; 
                    qMap.set(key, ex);
                  }
                  const bubbles = Array.from(qMap.entries()).map(([key, d]) => ({
                    query: key.split("|")[0],
                    device: d.device,
                    ctr: +(d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0).toFixed(2),
                    position: +(d.posSum / d.count).toFixed(1),
                    clicks: d.clicks,
                    impressions: d.impressions,
                  })).filter(b => b.clicks > 0);
                  
                  const gscAvgCtr = bubbles.length > 0 ? bubbles.reduce((s, b) => s + b.ctr, 0) / bubbles.length : 0;
                  const gscAvgPos = bubbles.length > 0 ? bubbles.reduce((s, b) => s + b.position, 0) / bubbles.length : 0;
                  const devices = [...new Set(bubbles.map(b => b.device))];

                  return (
                    <div className="h-[500px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ bottom: 30, left: 10, right: 20, top: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis type="number" dataKey="ctr" name="CTR" tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                            label={{ value: "CTR (%)", position: "bottom", fill: chartTheme.axisColor, fontSize: 11, dy: 15 }}
                            domain={[0, "auto"]} />
                          <YAxis type="number" dataKey="position" name="순위" tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                            label={{ value: "평균 순위", angle: -90, position: "insideLeft", fill: chartTheme.axisColor, fontSize: 11, dx: -5 }}
                            reversed domain={[0, "auto"]} />
                          <ZAxis type="number" dataKey="clicks" range={[30, 500]} name="클릭수" />
                          <ReferenceLine y={gscAvgPos} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: `평균 ${gscAvgPos.toFixed(1)}위`, fill: "#ef4444", fontSize: 10 }} />
                          <ReferenceLine x={gscAvgCtr} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: `평균 ${gscAvgCtr.toFixed(1)}%`, fill: "#ef4444", fontSize: 10 }} />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (!active || !payload?.[0]) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-3 shadow-lg text-sm">
                                  <p className="font-medium text-gray-900 dark:text-zinc-100 mb-1">{d.query}</p>
                                  <p className="text-gray-500 dark:text-zinc-400">📱 {d.device}</p>
                                  <p>CTR: <span className="font-medium text-green-500">{d.ctr}%</span></p>
                                  <p>순위: <span className="font-medium text-orange-400">{d.position}위</span></p>
                                  <p>클릭: <span className="font-medium text-blue-400">{d.clicks}</span> / 노출: {d.impressions.toLocaleString()}</p>
                                </div>
                              );
                            }}
                          />
                          {devices.map(dev => (
                            <Scatter key={dev} name={dev === "MOBILE" ? "📱 모바일" : dev === "DESKTOP" ? "🖥️ 데스크탑" : "📟 태블릿"}
                              data={bubbles.filter(b => b.device === dev)} fill={DEVICE_COLORS[dev] || "#888"} fillOpacity={0.7} />
                          ))}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* GSC Top Queries Table */}
            <Card>
              <CardHeader><CardTitle>🔍 검색어 상세 ({gscData.length}건)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                      <tr className="border-b border-gray-200 dark:border-zinc-700">
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">검색어</th>
                        <th className="text-center py-2 px-2 text-gray-500 dark:text-zinc-400">디바이스</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">클릭</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">노출</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">CTR</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">순위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscData.sort((a, b) => b.clicks - a.clicks).map((q, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                          <td className="py-2 px-2 text-gray-800 dark:text-zinc-200">{q.query}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${q.device === "MOBILE" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : q.device === "DESKTOP" ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"}`}>
                              {q.device === "MOBILE" ? "📱" : q.device === "DESKTOP" ? "🖥️" : "📟"} {q.device}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-blue-500">{q.clicks}</td>
                          <td className="py-2 px-2 text-right">{q.impressions.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-green-500">{(q.ctr * 100).toFixed(2)}%</td>
                          <td className="py-2 px-2 text-right text-orange-400">{q.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
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
                        scale={scatterData.length > 0 && scatterData.some(d => d.cpc > 0) ? "log" : "auto"}
                        domain={[Math.max(1, Math.min(...scatterData.map(d => d.cpc).filter(v => v > 0), 100)), "auto"]} allowDataOverflow />
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
