"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/page-header";
import ExportReport from "@/components/export-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
  LineChart, Line, ComposedChart,
} from "recharts";

const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

interface MonthData {
  month: string;
  revenue: number;
  orders: number;
  adSpend: number;
  roas: number;
  aov: number;
  revGrowth?: number;
  orderGrowth?: number;
}

export default function MonthlyPage() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [brand, setBrand] = useState("all");
  const [data, setData] = useState<MonthData[]>([]);
  const [ytd, setYtd] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const chartTheme = useChartTheme();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/monthly-summary?year=${year}&brand=${brand}`)
      .then(r => r.json())
      .then(d => { setData(d.summary || []); setYtd(d.ytd || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, brand]);

  const chartData = data.map(m => ({
    ...m,
    name: MONTH_LABELS[parseInt(m.month.split("-")[1]) - 1] || m.month,
  }));

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6" id="monthly-content">
        <div className="flex items-center justify-between">
          <PageHeader title="📅 월별 요약" subtitle="Monthly Summary & YTD" />
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(e.target.value)}
              className="text-xs border border-gray-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-800">
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
            <select value={brand} onChange={e => setBrand(e.target.value)}
              className="text-xs border border-gray-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-800">
              <option value="all">전체</option>
              <option value="nutty">너티</option>
              <option value="ironpet">아이언펫</option>
              <option value="saip">사입</option>
              <option value="balancelab">밸런스랩</option>
            </select>
            <ExportReport targetId="monthly-content" filename="PPMI-Monthly" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* YTD Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "YTD 매출", value: `₩${formatCompact(ytd.revenue || 0)}`, color: "text-indigo-500" },
                { label: "YTD 주문", value: `${(ytd.orders || 0).toLocaleString()}건`, color: "text-green-500" },
                { label: "YTD 광고비", value: `₩${formatCompact(ytd.adSpend || 0)}`, color: "text-red-500" },
                { label: "YTD ROAS", value: `${(ytd.roas || 0).toFixed(2)}x`, color: ytd.roas >= 2 ? "text-green-500" : "text-yellow-500" },
                { label: "YTD AOV", value: `₩${formatCompact(ytd.aov || 0)}`, color: "text-blue-500" },
              ].map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="pt-4 text-center">
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500">{kpi.label}</p>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Monthly Revenue + Ad Spend Chart */}
            <Card>
              <CardHeader><CardTitle>월별 매출 vs 광고비</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis dataKey="name" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                      <YAxis yAxisId="rev" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
                      <YAxis yAxisId="roas" orientation="right" tick={{ fill: "#22c55e", fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle}
                        formatter={(v: any, name: any) => [name === "ROAS" ? `${Number(v).toFixed(2)}x` : `₩${formatCompact(v)}`, name]} />
                      <Legend />
                      <Bar yAxisId="rev" dataKey="revenue" name="매출" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="rev" dataKey="adSpend" name="광고비" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="roas" type="monotone" dataKey="roas" name="ROAS" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* MoM Growth */}
            <Card>
              <CardHeader><CardTitle>📈 MoM 성장률</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.filter(d => d.revGrowth !== undefined)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis dataKey="name" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle}
                        formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]} />
                      <Legend />
                      <Bar dataKey="revGrowth" name="매출 성장률">
                        {chartData.filter(d => d.revGrowth !== undefined).map((d, i) => (
                          <Cell key={i} fill={(d.revGrowth || 0) >= 0 ? "#22c55e" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Table */}
            <Card>
              <CardHeader><CardTitle>📊 월별 상세</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-zinc-700">
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">월</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">매출</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">주문수</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">광고비</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">ROAS</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">AOV</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">MoM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map(m => (
                        <tr key={m.month} className="border-b border-gray-100 dark:border-zinc-800">
                          <td className="py-2 px-2 font-medium">{MONTH_LABELS[parseInt(m.month.split("-")[1]) - 1]}</td>
                          <td className="py-2 px-2 text-right">₩{formatCompact(m.revenue)}</td>
                          <td className="py-2 px-2 text-right">{m.orders.toLocaleString()}건</td>
                          <td className="py-2 px-2 text-right">₩{formatCompact(m.adSpend)}</td>
                          <td className={`py-2 px-2 text-right font-medium ${m.roas >= 2 ? "text-green-500" : m.roas >= 1 ? "text-yellow-500" : "text-red-500"}`}>{m.roas.toFixed(2)}x</td>
                          <td className="py-2 px-2 text-right">₩{formatCompact(m.aov)}</td>
                          <td className={`py-2 px-2 text-right ${(m.revGrowth || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {m.revGrowth !== undefined ? `${m.revGrowth >= 0 ? "+" : ""}${m.revGrowth.toFixed(1)}%` : "-"}
                          </td>
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
