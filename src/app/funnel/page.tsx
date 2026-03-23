"use client";

import { useState, useEffect, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import type { FunnelStep } from "@/lib/types";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, Legend, ReferenceLine,
} from "recharts";
import { useEvents } from "@/components/event-markers";

const FUNNEL_COLORS = ["#6366f1", "#818cf8", "#a78bfa", "#22c55e", "#14b8a6"];
const CHANNEL_COLORS: Record<string, string> = { smartstore: "#14b8a6", cafe24: "#8b5cf6", coupang: "#f97316" };
const CHANNEL_LABELS: Record<string, string> = { smartstore: "스마트스토어", cafe24: "카페24", coupang: "쿠팡" };
const IMP_COLORS: Record<string, string> = { meta: "#3b82f6", naver: "#22c55e", google: "#f59e0b", coupang: "#f97316" };
const IMP_LABELS: Record<string, string> = { meta: "Meta", naver: "네이버", google: "구글", coupang: "쿠팡" };

interface TrendPoint { date: string; sessions: number; cart_adds: number; purchases: number; [key: string]: string | number; }

export default function FunnelPage() {
  const chartTheme = useChartTheme();
  const events = useEvents();
  const { filters, setFilters } = useFilters();
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [prevFunnel, setPrevFunnel] = useState<FunnelStep[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [channelFunnel, setChannelFunnel] = useState<{ channel: string; sessions: number; cart_adds: number; purchases: number; repurchases: number; convRate: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const res = await fetch(`/api/funnel?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setFunnel(data.funnel || []);
      setTrend(data.trend || []);
      setChannelFunnel(data.channelFunnel || []);

      const fromDate = new Date(filters.from);
      const toDate = new Date(filters.to);
      const diff = toDate.getTime() - fromDate.getTime();
      const prevFrom = new Date(fromDate.getTime() - diff - 86400000).toISOString().slice(0, 10);
      const prevTo = new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10);
      const prevParams = new URLSearchParams({ brand: filters.brand, from: prevFrom, to: prevTo });
      const prevRes = await fetch(`/api/funnel?${prevParams}`);
      if (prevRes.ok) {
        const prevData = await prevRes.json();
        setPrevFunnel(prevData.funnel || []);
      }
    } catch (err) { setError("퍼널 데이터를 불러오는데 실패했습니다. 새로고침해 주세요."); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sessionsStep = funnel.find(s => s.name === "유입");
  const purchaseStep = funnel.find(s => s.name === "구매");
  const overallConvRate = sessionsStep && sessionsStep.value > 0 && purchaseStep
    ? ((purchaseStep.value / sessionsStep.value) * 100) : 0;

  const cartStep = funnel.find(s => s.name === "장바구니");
  const cartVal = cartStep?.value || 0;
  const purchaseVal = purchaseStep?.value || 0;
  const abandonRate = cartVal > 0 ? ((cartVal - purchaseVal) / cartVal) * 100 : 0;
  const prevCartStep = prevFunnel.find(s => s.name === "장바구니");
  const prevPurchaseStep = prevFunnel.find(s => s.name === "구매");
  const prevAbandonRate = (prevCartStep?.value || 0) > 0
    ? (((prevCartStep?.value || 0) - (prevPurchaseStep?.value || 0)) / (prevCartStep?.value || 1)) * 100 : 0;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="🔄 Funnel" subtitle="전환 퍼널 분석" />
        <Filters filters={filters} onChange={setFilters} />

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 세션</p>
                  <p className="text-2xl font-bold text-indigo-400">{formatCompact(sessionsStep?.value || 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">구매 전환율</p>
                  <p className={`text-2xl font-bold ${overallConvRate >= 2 ? "text-green-400" : overallConvRate >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                    {overallConvRate.toFixed(2)}%
                  </p>
                </CardContent>
              </Card>
              <Card className={abandonRate > 50 ? "border-red-500/30" : abandonRate > 35 ? "border-yellow-500/30" : "border-green-500/30"}>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">장바구니 이탈률</p>
                  <p className={`text-2xl font-bold ${abandonRate > 50 ? "text-red-400" : abandonRate > 35 ? "text-yellow-400" : "text-green-400"}`}>
                    {abandonRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">총 구매</p>
                  <p className="text-2xl font-bold text-green-400">{formatCompact(purchaseVal)}</p>
                </CardContent>
              </Card>
            </div>

            {/* 장바구니 이탈 분석 — 상단 이탈률 카드와 연결 */}
            <Card className={abandonRate > 50 ? "border-red-500/30" : ""}>
              <CardHeader><CardTitle>🛒 장바구니 이탈 분석</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 flex-wrap">
                  <div>
                    <p className={`text-4xl font-bold ${abandonRate > 50 ? "text-red-400" : abandonRate > 35 ? "text-yellow-400" : "text-green-400"}`}>
                      {abandonRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                      장바구니 {formatCompact(cartVal)} → 구매 {formatCompact(purchaseVal)}
                    </p>
                  </div>
                  {prevFunnel.length > 0 && (
                    <div className={`text-sm ${(abandonRate - prevAbandonRate) > 0 ? "text-red-400" : "text-green-400"}`}>
                      <span className="text-xl">{(abandonRate - prevAbandonRate) > 0 ? "↑" : "↓"}</span>
                      <span className="font-medium ml-1">{Math.abs(abandonRate - prevAbandonRate).toFixed(1)}%p</span>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500">이전: {prevAbandonRate.toFixed(1)}%</p>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-zinc-500 space-y-1 ml-auto">
                    <p>💡 이커머스 평균 이탈률: 65~75%</p>
                    <p>🎯 {abandonRate < 65 ? "업계 평균 이하 — 양호" : "업계 평균 수준 — 개선 여지 있음"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 노출은 별도 + 깔때기는 유입부터 */}
            <Card>
              <CardHeader><CardTitle>전환 퍼널</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const impressionStep = funnel.find(s => s.name === "노출");
                  const funnelWithoutImpressions = funnel.filter(s => s.name !== "노출");
                  const maxVal = funnelWithoutImpressions[0]?.value || 1;

                  return (
                    <div className="space-y-4">
                      {/* 노출 = 별도 배너 */}
                      {impressionStep && (
                        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg px-4 py-3">
                          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">👁️ 노출</span>
                          <span className="text-2xl font-bold text-indigo-500">{formatCompact(impressionStep.value)}</span>
                          {funnelWithoutImpressions[0] && (
                            <span className="text-xs text-gray-400 dark:text-zinc-500 ml-auto">
                              → 유입률 {impressionStep.value > 0 ? ((funnelWithoutImpressions[0].value / impressionStep.value) * 100).toFixed(2) : 0}%
                            </span>
                          )}
                        </div>
                      )}

                      {/* 깔때기: 유입 → 장바구니 → 구매 → 재구매 */}
                      <div className="space-y-0">
                        {funnelWithoutImpressions.map((step, i) => {
                          const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
                          const width = Math.max(pct, 12);
                          const prevStep = i > 0 ? funnelWithoutImpressions[i - 1] : null;
                          const stepConvRate = prevStep && prevStep.value > 0 ? (step.value / prevStep.value * 100) : 100;
                          const dropRate = 100 - stepConvRate;

                          return (
                            <div key={step.name}>
                              {/* 이탈률 표시 (단계 사이) */}
                              {i > 0 && (
                                <div className="flex items-center justify-center py-1">
                                  <span className="text-[10px] text-red-400">▼ 이탈 {dropRate.toFixed(1)}% ({formatCompact((prevStep?.value || 0) - step.value)}명)</span>
                                </div>
                              )}
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 dark:text-zinc-400 w-16 text-right shrink-0">{step.name}</span>
                                <div className="flex-1 flex justify-center">
                                  <div className="h-12 rounded-lg flex items-center justify-between px-4 transition-all shadow-sm"
                                    style={{ backgroundColor: FUNNEL_COLORS[i + 1] || FUNNEL_COLORS[i], opacity: 0.9, width: `${width}%` }}>
                                    <span className="text-sm font-bold text-white">{formatCompact(step.value)}</span>
                                    <span className="text-[11px] text-white/80 font-medium">{pct.toFixed(1)}%</span>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-400 dark:text-zinc-500 w-20 shrink-0">
                                  {i > 0 ? `전환 ${stepConvRate.toFixed(1)}%` : "기준"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* 전환율 상세 카드 */}
            <Card>
              <CardHeader><CardTitle>📊 단계별 전환율 상세</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(() => {
                    const impressionStep = funnel.find(s => s.name === "노출");
                    const steps = funnel.filter(s => s.name !== "노출");
                    const pairs = [
                      { from: "노출", to: "유입", fromVal: impressionStep?.value || 0, toVal: steps.find(s => s.name === "유입")?.value || 0 },
                      { from: "유입", to: "장바구니", fromVal: steps.find(s => s.name === "유입")?.value || 0, toVal: steps.find(s => s.name === "장바구니")?.value || 0 },
                      { from: "장바구니", to: "구매", fromVal: steps.find(s => s.name === "장바구니")?.value || 0, toVal: steps.find(s => s.name === "구매")?.value || 0 },
                      { from: "구매", to: "재구매", fromVal: steps.find(s => s.name === "구매")?.value || 0, toVal: steps.find(s => s.name === "재구매")?.value || 0 },
                    ];
                    return pairs.map((p) => {
                      const rate = p.fromVal > 0 ? (p.toVal / p.fromVal * 100) : 0;
                      return (
                        <div key={p.to} className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3">
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500">{p.from} → {p.to}</p>
                          <p className={`text-xl font-bold mt-1 ${rate >= 5 ? "text-green-400" : rate >= 2 ? "text-yellow-400" : "text-red-400"}`}>
                            {rate.toFixed(2)}%
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                            {formatCompact(p.fromVal)} → {formatCompact(p.toVal)}
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>

            {trend.length > 0 && (
              <>
                <Card>
                  <CardHeader><CardTitle>노출 일별 트렌드 (소스별)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                          <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                          <Legend />
                          {["meta", "naver", "google", "coupang"].map((src) => (
                            <Area key={src} type="monotone" dataKey={`imp_${src}`} name={IMP_LABELS[src]} stackId="imp"
                              stroke={IMP_COLORS[src]} fill={IMP_COLORS[src]} fillOpacity={0.6} />
                          ))}
                          {events.map((e) => (
                            <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                              label={{ value: `▼ ${e.title}`, position: "insideBottomLeft", fill: e.color || "#6366f1", fontSize: 10, fontWeight: 700, offset: 5 }} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>유입 일별 트렌드 (채널별)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                          <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                          <Legend />
                          {["smartstore", "cafe24", "coupang"].map((ch) => (
                            <Area key={ch} type="monotone" dataKey={`sessions_${ch}`} name={CHANNEL_LABELS[ch]} stackId="sessions"
                              stroke={CHANNEL_COLORS[ch]} fill={CHANNEL_COLORS[ch]} fillOpacity={0.6} />
                          ))}
                          {events.map((e) => (
                            <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                              label={{ value: `▼ ${e.title}`, position: "insideBottomLeft", fill: e.color || "#6366f1", fontSize: 10, fontWeight: 700, offset: 5 }} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>구매 일별 트렌드 (채널별)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                          <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle} />
                          <Legend />
                          {["smartstore", "cafe24", "coupang"].map((ch) => (
                            <Area key={ch} type="monotone" dataKey={`purchases_${ch}`} name={CHANNEL_LABELS[ch]} stackId="purchases"
                              stroke={CHANNEL_COLORS[ch]} fill={CHANNEL_COLORS[ch]} fillOpacity={0.6} />
                          ))}
                          {events.map((e) => (
                            <ReferenceLine key={e.id} x={e.date} stroke={e.color} strokeDasharray="4 4" strokeWidth={1.5}
                              label={{ value: `▼ ${e.title}`, position: "insideBottomLeft", fill: e.color || "#6366f1", fontSize: 10, fontWeight: 700, offset: 5 }} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {prevFunnel.length > 0 && (
              <Card>
                <CardHeader><CardTitle>이전 기간 대비</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">단계</th>
                          <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">현재</th>
                          <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">이전</th>
                          <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">변화</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funnel.map((step, i) => {
                          const prev = prevFunnel[i];
                          const change = prev && prev.value > 0 ? ((step.value - prev.value) / prev.value * 100) : 0;
                          return (
                            <tr key={step.name} className="border-b border-gray-100 dark:border-zinc-800">
                              <td className="py-2.5 px-2 text-gray-800 dark:text-zinc-200">{step.name}</td>
                              <td className="py-2.5 px-2 text-right">{formatCompact(step.value)}</td>
                              <td className="py-2.5 px-2 text-right text-gray-400 dark:text-zinc-400">{prev ? formatCompact(prev.value) : "-"}</td>
                              <td className={`py-2.5 px-2 text-right font-medium ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {channelFunnel.length > 0 && (
              <Card>
                <CardHeader><CardTitle>📊 채널별 퍼널 비교</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">채널별 구매 전환율</p>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelFunnel}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                            <XAxis dataKey="channel" tick={{ fill: chartTheme.labelColor, fontSize: 12 }} />
                            <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                            <Tooltip contentStyle={chartTheme.tooltipStyle} labelStyle={chartTheme.tooltipLabelStyle} itemStyle={chartTheme.tooltipItemStyle}
                              formatter={(v: any) => [`${Number(v).toFixed(2)}%`, "전환율"]} />
                            <Bar dataKey="convRate" name="전환율" radius={[4, 4, 0, 0]}>
                              {channelFunnel.map((_, i) => (
                                <Cell key={i} fill={["#8b5cf6", "#14b8a6", "#f97316"][i % 3]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">채널별 퍼널 상세</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-zinc-700">
                              <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">채널</th>
                              <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">유입</th>
                              <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">장바구니</th>
                              <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">구매</th>
                              <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">재구매</th>
                              <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">전환율</th>
                            </tr>
                          </thead>
                          <tbody>
                            {channelFunnel.map((ch) => (
                              <tr key={ch.channel} className="border-b border-gray-100 dark:border-zinc-800">
                                <td className="py-2 px-2 text-gray-800 dark:text-zinc-200 font-medium">{ch.channel}</td>
                                <td className="py-2 px-2 text-right">{formatCompact(ch.sessions)}</td>
                                <td className="py-2 px-2 text-right">{formatCompact(ch.cart_adds)}</td>
                                <td className="py-2 px-2 text-right text-green-400">{formatCompact(ch.purchases)}</td>
                                <td className="py-2 px-2 text-right">{formatCompact(ch.repurchases)}</td>
                                <td className={`py-2 px-2 text-right font-medium ${ch.convRate >= 5 ? "text-green-400" : ch.convRate >= 2 ? "text-yellow-400" : "text-red-400"}`}>
                                  {ch.convRate.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          </>
        )}
      </div>
    </main>
  );
}
