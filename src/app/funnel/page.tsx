"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, FunnelStep } from "@/lib/types";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";

const GRADIENT_COLORS = ["#6366f1", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6"];

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function FunnelPage() {
  const dates = getDefaultDates();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [prevFunnel, setPrevFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const res = await fetch(`/api/funnel?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setFunnel(data.funnel || []);

      // Fetch previous period
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
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="🔄 Funnel" subtitle="전환 퍼널 분석" />
        <Filters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* Funnel Visualization */}
            <Card>
              <CardHeader><CardTitle>퍼널: 노출 → 유입 → 장바구니 → 결제시작 → 구매 → 재구매</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnel}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
                        formatter={(value: any) => [formatCompact(value), "수량"]} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {funnel.map((_, i) => <Cell key={i} fill={GRADIENT_COLORS[i % GRADIENT_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Conversion rates */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
                  {funnel.slice(1).map((step, i) => (
                    <div key={step.name} className="text-center rounded-lg bg-zinc-800/50 p-3">
                      <div className="text-[10px] text-zinc-500">{funnel[i].name} → {step.name}</div>
                      <div className="text-lg font-bold text-zinc-200 mt-1">
                        {step.rate !== undefined ? `${step.rate.toFixed(1)}%` : "-"}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        Drop: {step.rate !== undefined ? `${(100 - step.rate).toFixed(1)}%` : "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Cart Abandonment Rate */}
            {(() => {
              const cartStep = funnel.find(s => s.name === "장바구니");
              const purchaseStep = funnel.find(s => s.name === "구매");
              const prevCartStep = prevFunnel.find(s => s.name === "장바구니");
              const prevPurchaseStep = prevFunnel.find(s => s.name === "구매");

              const cartVal = cartStep?.value || 0;
              const purchaseVal = purchaseStep?.value || 0;
              const abandonRate = cartVal > 0 ? ((cartVal - purchaseVal) / cartVal) * 100 : 0;

              const prevCartVal = prevCartStep?.value || 0;
              const prevPurchaseVal = prevPurchaseStep?.value || 0;
              const prevAbandonRate = prevCartVal > 0 ? ((prevCartVal - prevPurchaseVal) / prevCartVal) * 100 : 0;

              const diff = abandonRate - prevAbandonRate;

              return (
                <Card className={abandonRate > 50 ? "border-red-500/30" : abandonRate > 35 ? "border-yellow-500/30" : "border-green-500/30"}>
                  <CardHeader><CardTitle>🛒 장바구니 이탈률</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className={`text-5xl font-bold ${abandonRate > 50 ? "text-red-400" : abandonRate > 35 ? "text-yellow-400" : "text-green-400"}`}>
                          {abandonRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          장바구니 {formatCompact(cartVal)} → 구매 {formatCompact(purchaseVal)}
                        </p>
                      </div>
                      {prevFunnel.length > 0 && (
                        <div className={`flex items-center gap-1 text-sm ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
                          <span className="text-xl">{diff > 0 ? "↑" : "↓"}</span>
                          <div>
                            <p className="font-medium">{Math.abs(diff).toFixed(1)}%p</p>
                            <p className="text-[10px] text-zinc-500">이전: {prevAbandonRate.toFixed(1)}%</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Period Comparison */}
            {prevFunnel.length > 0 && (
              <Card>
                <CardHeader><CardTitle>이전 기간 대비</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700">
                          <th className="text-left py-3 px-2 text-zinc-400">단계</th>
                          <th className="text-right py-3 px-2 text-zinc-400">현재</th>
                          <th className="text-right py-3 px-2 text-zinc-400">이전</th>
                          <th className="text-right py-3 px-2 text-zinc-400">변화</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funnel.map((step, i) => {
                          const prev = prevFunnel[i];
                          const change = prev && prev.value > 0 ? ((step.value - prev.value) / prev.value * 100) : 0;
                          return (
                            <tr key={step.name} className="border-b border-zinc-800">
                              <td className="py-2.5 px-2 text-zinc-200">{step.name}</td>
                              <td className="py-2.5 px-2 text-right">{formatCompact(step.value)}</td>
                              <td className="py-2.5 px-2 text-right text-zinc-400">{prev ? formatCompact(prev.value) : "-"}</td>
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
          </>
        )}
      </div>
    </main>
  );
}
