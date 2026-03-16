"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, AdsChannelSummary } from "@/lib/types";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, Legend,
} from "recharts";

const COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899"];

// Creative Analytics — 실데이터 연결 전 더미
const CREATIVES = [
  { name: "[더미] 사운드 냠단호박 릴스", ctr: 2.1, cpc: 280, roas: 4.2, spend: 1_850_000, revenue: 7_770_000 },
  { name: "[더미] 바삭닭가슴살 ASMR", ctr: 1.8, cpc: 320, roas: 3.8, spend: 1_600_000, revenue: 6_080_000 },
  { name: "[더미] 하루루틴 캐러셀", ctr: 1.5, cpc: 450, roas: 2.9, spend: 2_100_000, revenue: 6_090_000 },
  { name: "[더미] 아이언펫 키트 소개", ctr: 0.9, cpc: 890, roas: 1.8, spend: 3_200_000, revenue: 5_760_000 },
  { name: "[더미] 반려묘 키트 리뷰", ctr: 0.7, cpc: 950, roas: 1.2, spend: 1_800_000, revenue: 2_160_000 },
  { name: "[더미] 너티 브랜드 스토리", ctr: 1.6, cpc: 380, roas: 3.2, spend: 1_200_000, revenue: 3_840_000 },
  { name: "[더미] 간식 비교 테스트", ctr: 2.4, cpc: 250, roas: 4.8, spend: 980_000, revenue: 4_704_000 },
  { name: "[더미] 영양제 번들 프로모", ctr: 1.1, cpc: 620, roas: 2.1, spend: 1_500_000, revenue: 3_150_000 },
];

function getPerformanceColor(value: number, thresholds: { good: number; mid: number }): string {
  if (value >= thresholds.good) return "text-green-400";
  if (value >= thresholds.mid) return "text-yellow-400";
  return "text-red-400";
}

function getPerformanceBg(roas: number): string {
  if (roas >= 3.5) return "border-green-500/30 bg-green-950/10";
  if (roas >= 2.0) return "border-yellow-500/30 bg-yellow-950/10";
  return "border-red-500/30 bg-red-950/10";
}
const CH_LABELS: Record<string, string> = {
  meta: "Meta", naver_search: "네이버검색", naver_shopping: "네이버쇼핑",
  google_search: "구글검색", gdn: "GDN",
};

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function AdsPage() {
  const dates = getDefaultDates();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [channels, setChannels] = useState<AdsChannelSummary[]>([]);
  const [spendTrend, setSpendTrend] = useState<Record<string, any>[]>([]);
  const [cac, setCac] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const res = await fetch(`/api/ads?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setChannels(data.channels || []);
      setSpendTrend(data.spendTrend || []);
      setCac(data.cac || 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="📢 Ads Performance" subtitle="광고 효율 분석" />
        <Filters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* CAC Card */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-zinc-400">CAC (Customer Acquisition Cost)</p>
                    <p className="text-2xl font-bold">₩{formatCompact(cac)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ROAS by Channel */}
            <Card>
              <CardHeader><CardTitle>채널별 ROAS 비교</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channels.map(c => ({ ...c, label: CH_LABELS[c.channel] || c.channel }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="label" tick={{ fill: "#888", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#888", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)}x`, "ROAS"]} />
                      <Bar dataKey="roas" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Channel Detail Table */}
            <Card>
              <CardHeader><CardTitle>채널별 상세 성과</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left py-3 px-2 text-zinc-400">채널</th>
                        <th className="text-right py-3 px-2 text-zinc-400">Spend</th>
                        <th className="text-right py-3 px-2 text-zinc-400">Impressions</th>
                        <th className="text-right py-3 px-2 text-zinc-400">Clicks</th>
                        <th className="text-right py-3 px-2 text-zinc-400">CTR</th>
                        <th className="text-right py-3 px-2 text-zinc-400">CPC</th>
                        <th className="text-right py-3 px-2 text-zinc-400">Conv.</th>
                        <th className="text-right py-3 px-2 text-zinc-400">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((ch) => (
                        <tr key={ch.channel} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                          <td className="py-2.5 px-2 text-zinc-200">{CH_LABELS[ch.channel] || ch.channel}</td>
                          <td className="py-2.5 px-2 text-right">₩{formatCompact(ch.spend)}</td>
                          <td className="py-2.5 px-2 text-right">{ch.impressions.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right">{ch.clicks.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right">{(ch.ctr * 100).toFixed(2)}%</td>
                          <td className="py-2.5 px-2 text-right">₩{formatCompact(ch.cpc)}</td>
                          <td className="py-2.5 px-2 text-right">{ch.conversions.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right font-medium">{ch.roas.toFixed(2)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Spend Trend - Stacked Area */}
            <Card>
              <CardHeader><CardTitle>광고비 트렌드 (채널별)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={spendTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: 8 }} />
                      <Legend />
                      {Object.keys(CH_LABELS).map((ch, i) => (
                        <Area key={ch} type="monotone" dataKey={ch} name={CH_LABELS[ch]} stackId="1" fill={COLORS[i % COLORS.length]} stroke={COLORS[i % COLORS.length]} fillOpacity={0.6} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gross Margin ROAS */}
            <Card>
              <CardHeader><CardTitle>📊 Gross Margin ROAS</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const totalRevenue = channels.reduce((s, c) => s + c.conversionValue, 0);
                  const totalSpend = channels.reduce((s, c) => s + c.spend, 0);
                  const cogs = totalRevenue * 0.4;
                  const grossMarginRoas = totalSpend > 0 ? (totalRevenue - cogs) / totalSpend : 0;
                  return (
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-sm text-zinc-400">GM-ROAS (매출원가 40% 가정)</p>
                        <p className={`text-3xl font-bold ${grossMarginRoas >= 2.0 ? "text-green-400" : grossMarginRoas >= 1.0 ? "text-yellow-400" : "text-red-400"}`}>
                          {grossMarginRoas.toFixed(2)}x
                        </p>
                      </div>
                      <div className="text-xs text-zinc-500 space-y-1">
                        <p>매출: ₩{formatCompact(totalRevenue)}</p>
                        <p>COGS: ₩{formatCompact(cogs)} (40%)</p>
                        <p>매출총이익: ₩{formatCompact(totalRevenue - cogs)}</p>
                        <p>광고비: ₩{formatCompact(totalSpend)}</p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Creative Analytics */}
            <Card>
              <CardHeader><CardTitle>🎨 크리에이티브 분석</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {CREATIVES.map((cr) => {
                    const gmRoas = cr.spend > 0 ? (cr.revenue - cr.revenue * 0.4) / cr.spend : 0;
                    return (
                      <div key={cr.name} className={`rounded-lg border p-4 space-y-2 ${getPerformanceBg(cr.roas)}`}>
                        <p className="text-sm font-medium text-zinc-200 truncate">{cr.name}</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <span className="text-zinc-500">CTR</span>
                          <span className={`text-right font-medium ${getPerformanceColor(cr.ctr, { good: 1.5, mid: 1.0 })}`}>{cr.ctr.toFixed(1)}%</span>
                          <span className="text-zinc-500">CPC</span>
                          <span className={`text-right font-medium ${getPerformanceColor(1000 - cr.cpc, { good: 600, mid: 300 })}`}>₩{cr.cpc.toLocaleString()}</span>
                          <span className="text-zinc-500">ROAS</span>
                          <span className={`text-right font-medium ${getPerformanceColor(cr.roas, { good: 3.0, mid: 2.0 })}`}>{cr.roas.toFixed(1)}x</span>
                          <span className="text-zinc-500">GM-ROAS</span>
                          <span className={`text-right font-medium ${getPerformanceColor(gmRoas, { good: 2.0, mid: 1.0 })}`}>{gmRoas.toFixed(1)}x</span>
                          <span className="text-zinc-500">지출</span>
                          <span className="text-right text-zinc-300">₩{formatCompact(cr.spend)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
