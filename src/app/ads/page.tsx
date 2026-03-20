"use client";

import { useState, useEffect, useCallback } from "react";
import type { AdsChannelSummary } from "@/lib/types";
import { useFilters } from "@/lib/filter-context";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import ExportReport from "@/components/export-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, Legend, Cell, LineChart, Line,
} from "recharts";

const CHANNEL_COLORS: Record<string, string> = {
  meta: "#3b82f6",
  naver_search: "#22c55e",
  naver_shopping: "#10b981",
  google_search: "#ef4444",
  "ga4_Performance Max": "#eab308",
  "ga4_Search": "#ef4444",
  coupang: "#f97316",
  gdn: "#f43f5e",
  gfa: "#14b8a6",
};
const FALLBACK_COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e"];

interface MetaCreative {
  id: string; name: string; status: string; brand: string;
  thumbnail_url: string; image_url: string; video_id: string;
  spend: number; impressions: number; clicks: number;
  ctr: number; cpc: number;
  landing_page_views: number; add_to_cart: number; initiate_checkout: number;
  purchases: number; roas: number; revenue: number;
  cac: number; cart_to_purchase_rate: number; click_to_cart_rate: number;
}

function getPerformanceColor(value: number, thresholds: { good: number; mid: number }): string {
  if (value >= thresholds.good) return "text-green-400";
  if (value >= thresholds.mid) return "text-yellow-400";
  return "text-red-400";
}

function getPerformanceBg(roas: number): string {
  if (roas >= 3.5) return "border-green-500/30 bg-green-50 dark:bg-green-950/10";
  if (roas >= 2.0) return "border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/10";
  return "border-red-500/30 bg-red-50 dark:bg-red-950/10";
}

const CH_LABELS: Record<string, string> = {
  meta: "Meta", naver_search: "네이버검색", naver_shopping: "네이버쇼핑",
  google_search: "구글검색", "ga4_Performance Max": "P-Max", "ga4_Search": "Google(GA4)",
  coupang: "쿠팡광고", gdn: "GDN",
};

export default function AdsPage() {
  const chartTheme = useChartTheme();
  const { filters, setFilters } = useFilters();
  const [channels, setChannels] = useState<AdsChannelSummary[]>([]);
  const [spendTrend, setSpendTrend] = useState<Record<string, any>[]>([]);
  const [dailySpend, setDailySpend] = useState<Record<string, any>[]>([]);
  const [weeklySpend, setWeeklySpend] = useState<Record<string, any>[]>([]);
  const [monthlySpend, setMonthlySpend] = useState<Record<string, any>[]>([]);
  const [spendPeriod, setSpendPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [cac, setCac] = useState<number>(0);
  const [creatives, setCreatives] = useState<MetaCreative[]>([]);
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [creativeTrend, setCreativeTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [crLoading, setCrLoading] = useState(true);
  const [crPage, setCrPage] = useState(1);
  const [crFilter, setCrFilter] = useState<"all" | "active" | "paused">("all");
  const CR_PER_PAGE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setCrLoading(true);
    const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });

    // Parallel: ads data + creatives
    const adsPromise = fetch(`/api/ads?${params}`).then(r => r.ok ? r.json() : null).catch(() => null);
    const crPromise = fetch(`/api/creatives?${params}`).then(r => r.ok ? r.json() : null).catch(() => null);

    // Ads data first (fast)
    const data = await adsPromise;
    if (data) {
      setChannels(data.channels || []);
      setSpendTrend(data.spendTrend || []);
      setDailySpend(data.dailySpend || []);
      setWeeklySpend(data.weeklySpend || []);
      setMonthlySpend(data.monthlySpend || []);
      setCac(data.cac || 0);
    }
    setLoading(false);

    // Creatives (slow — Meta API)
    const crData = await crPromise;
    if (crData) setCreatives(crData.creatives || []);
    setCrLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreativeClick = async (adId: string) => {
    if (selectedCreative === adId) { setSelectedCreative(null); return; }
    setSelectedCreative(adId);
    try {
      const res = await fetch(`/api/creative-trend?ad_id=${adId}&from=${filters.from}&to=${filters.to}`);
      if (res.ok) {
        const data = await res.json();
        setCreativeTrend(data.trend || []);
      }
    } catch { setCreativeTrend([]); }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="📢 Ads Performance" subtitle="광고 효율 분석" />
          <ExportReport targetId="ads-content" filename="PPMI-Ads" />
        </div>
        <Filters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-zinc-400">CAC (Customer Acquisition Cost)</p>
                    <p className="text-2xl font-bold">₩{formatCompact(cac)}</p>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-zinc-500 border-l border-gray-200 dark:border-zinc-800 pl-4">
                    <p className="text-gray-500 dark:text-zinc-400 font-medium">CAC = 총 광고비 ÷ 총 구매수 (구매 기준)</p>
                    <p className="mt-1">전체 광고비를 구매 전환수로 나눈 고객 1인당 획득 비용입니다.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>채널별 ROAS 비교</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channels.map(c => ({ ...c, label: CH_LABELS[c.channel] || c.channel }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis dataKey="label" tick={{ fill: chartTheme.tickColor, fontSize: 12 }} />
                      <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 12 }} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle}
                        formatter={(value: any) => [`${Number(value).toFixed(2)}x`, "ROAS"]} />
                      <Bar dataKey="roas" radius={[6, 6, 0, 0]}>
                        {channels.map((c, i) => (
                          <Cell key={c.channel} fill={CHANNEL_COLORS[c.channel] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>채널별 상세 성과</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-zinc-700">
                        <th className="text-left py-3 px-2 text-gray-500 dark:text-zinc-400">채널</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">Spend</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">Impressions</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">Clicks</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">CTR</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">CPC</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">전환매출</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">Conv.</th>
                        <th className="text-right py-3 px-2 text-gray-500 dark:text-zinc-400">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((ch) => (
                        <tr key={ch.channel} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                          <td className="py-2.5 px-2 text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || "#888" }} />
                            {CH_LABELS[ch.channel] || ch.channel}
                          </td>
                          <td className="py-2.5 px-2 text-right">₩{formatCompact(ch.spend)}</td>
                          <td className="py-2.5 px-2 text-right">{ch.impressions.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right">{ch.clicks.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right">{(ch.ctr * 100).toFixed(2)}%</td>
                          <td className="py-2.5 px-2 text-right">₩{Math.round(ch.cpc).toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right">₩{formatCompact(ch.conversionValue || 0)}</td>
                          <td className="py-2.5 px-2 text-right">{ch.conversions.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-right font-medium">{ch.roas.toFixed(2)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>광고비 트렌드 (채널별)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={spendTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        {channels.map((ch, i) => {
                          const color = CHANNEL_COLORS[ch.channel] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                          return (
                            <linearGradient key={ch.channel} id={`grad-${ch.channel.replace(/\s/g, "_")}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                            </linearGradient>
                          );
                        })}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.subtleGridColor} />
                      <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip
                        contentStyle={chartTheme.tooltipStyle}
                        formatter={(value: any, name: any) => [`₩${formatCompact(value)}`, name]}
                      />
                      <Legend wrapperStyle={{ paddingTop: 8 }} />
                      {channels.map((ch, i) => {
                        const color = CHANNEL_COLORS[ch.channel] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                        return (
                          <Area
                            key={ch.channel}
                            type="monotone"
                            dataKey={ch.channel}
                            name={CH_LABELS[ch.channel] || ch.channel}
                            stackId="1"
                            fill={`url(#grad-${ch.channel.replace(/\s/g, "_")})`}
                            stroke={color}
                            strokeWidth={1.5}
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>📊 Gross Margin ROAS</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const totalRevenue = channels.reduce((s, c) => s + c.conversionValue, 0);
                  const totalSpend = channels.reduce((s, c) => s + c.spend, 0);
                  const cogs = totalRevenue * 0.4;
                  const grossMarginRoas = totalSpend > 0 ? (totalRevenue - cogs) / totalSpend : 0;
                  return (
                    <div className="flex flex-wrap items-center gap-6">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-zinc-400">GM-ROAS (매출원가 40% 가정)</p>
                        <p className={`text-3xl font-bold ${grossMarginRoas >= 2.0 ? "text-green-400" : grossMarginRoas >= 1.0 ? "text-yellow-400" : "text-red-400"}`}>
                          {grossMarginRoas.toFixed(2)}x
                        </p>
                      </div>
                      <div className="text-xs text-gray-400 dark:text-zinc-500 space-y-1">
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

            {/* 기간별 광고비 변화 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>📊 기간별 광고비 변화</CardTitle>
                  <div className="flex gap-1">
                    {(["daily", "weekly", "monthly"] as const).map(p => (
                      <button key={p} onClick={() => setSpendPeriod(p)}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          spendPeriod === p
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        }`}>
                        {p === "daily" ? "일별" : p === "weekly" ? "주별" : "월별"}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const periodData = spendPeriod === "daily" ? dailySpend : spendPeriod === "weekly" ? weeklySpend : monthlySpend;
                  const keys = periodData.length > 0
                    ? Object.keys(periodData[0]).filter(k => k !== "date" && k !== "total")
                    : [];
                  const BRAND_COLORS_MAP: Record<string, string> = { "너티": "#6366f1", "아이언펫": "#22c55e", "사입": "#f97316", "밸런스랩": "#ec4899" };
                  return (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                          <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                            tickFormatter={(v: string) => spendPeriod === "monthly" ? v.slice(2) : v.slice(5)} />
                          <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                          <Tooltip contentStyle={chartTheme.tooltipStyle}
                            formatter={(v: any, name: any) => [`₩${formatCompact(v)}`, name === "total" ? "합계" : name]}
                            labelFormatter={(v) => String(v)} />
                          <Legend />
                          {keys.map((key, i) => (
                            <Bar key={key} dataKey={key} stackId="a"
                              fill={BRAND_COLORS_MAP[key] || CHANNEL_COLORS[key] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                              radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">
                  {filters.brand === "all" ? "브랜드별 스택 막대" : "채널별 스택 막대"} · {spendPeriod === "daily" ? "일별" : spendPeriod === "weekly" ? "주별" : "월별"} 집계
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>🎨 Meta 크리에이티브 성과 (퍼널별)</CardTitle>
                  <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-zinc-500">총 {creatives.length}개 소재 (지출 {creatives.filter(cr => cr.spend > 0).length}개)</span>
                  <select value={crFilter} onChange={e => { setCrFilter(e.target.value as any); setCrPage(1); }}
                    className="text-[10px] border border-gray-200 dark:border-zinc-700 rounded px-1 py-0.5 bg-white dark:bg-zinc-800">
                    <option value="all">전체</option>
                    <option value="active">활성만</option>
                    <option value="paused">중지포함</option>
                  </select>
                </div>
                </div>
              </CardHeader>
              <CardContent>
                {crLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
                    <p className="text-sm text-gray-500 dark:text-zinc-500">Meta 크리에이티브 로딩 중... (최대 10초)</p>
                  </div>
              ) : creatives.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-500">Meta 크리에이티브 데이터가 없습니다.</p>
              ) : (
                  <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">소재</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">지출</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">노출</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">클릭</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">CTR</th>
                          <th className="text-right py-2 px-2 text-blue-500 dark:text-blue-400">🛒 장바구니</th>
                          <th className="text-right py-2 px-2 text-orange-500 dark:text-orange-400">💳 결제시작</th>
                          <th className="text-right py-2 px-2 text-green-500 dark:text-green-400">✅ 구매</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">매출</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">ROAS</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">CAC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filtered = creatives.filter(cr => {
                            if (crFilter === "active") return cr.status === "ACTIVE" && cr.spend > 0;
                            if (crFilter === "paused") return cr.spend > 0;
                            return cr.spend > 0;
                          });
                          const totalPages = Math.ceil(filtered.length / CR_PER_PAGE);
                          const paginated = filtered.slice((crPage - 1) * CR_PER_PAGE, crPage * CR_PER_PAGE);
                          return paginated;
                        })().map((cr) => (<>
                          <tr key={cr.id} onClick={() => handleCreativeClick(cr.id)} className={`border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer ${cr.status !== "ACTIVE" ? "opacity-50" : ""} ${selectedCreative === cr.id ? "bg-indigo-50 dark:bg-indigo-900/10" : ""}`}>
                            <td className="py-2 px-2 max-w-[200px]">
                              <div className="flex items-center gap-2">
                                {(cr.thumbnail_url || cr.image_url) && (
                                  <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-200 dark:bg-zinc-700">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={cr.thumbnail_url || cr.image_url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-800 dark:text-zinc-200 truncate">{cr.name}</p>
                                  <div className="flex gap-1">
                                    <span className={`text-[9px] px-1 rounded ${cr.status === "ACTIVE" ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-gray-100 dark:bg-zinc-700 text-gray-400"}`}>
                                      {cr.status === "ACTIVE" ? "활성" : "중지"}
                                    </span>
                                    <span className="text-[9px] text-gray-400">{({"nutty":"너티","ironpet":"아이언펫","balancelab":"밸런스랩","saip":"사입"} as Record<string,string>)[cr.brand] || cr.brand}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-medium">₩{formatCompact(cr.spend)}</td>
                            <td className="py-2 px-2 text-right">{cr.impressions.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right">{cr.clicks.toLocaleString()}</td>
                            <td className={`py-2 px-2 text-right ${getPerformanceColor(cr.ctr, { good: 1.5, mid: 1.0 })}`}>{cr.ctr.toFixed(2)}%</td>
                            <td className="py-2 px-2 text-right text-blue-600 dark:text-blue-400">{cr.add_to_cart || "-"}</td>
                            <td className="py-2 px-2 text-right text-orange-600 dark:text-orange-400">{cr.initiate_checkout || "-"}</td>
                            <td className="py-2 px-2 text-right text-green-600 dark:text-green-400 font-medium">{cr.purchases || "-"}</td>
                            <td className="py-2 px-2 text-right font-medium">₩{formatCompact(cr.revenue)}</td>
                            <td className={`py-2 px-2 text-right font-bold ${getPerformanceColor(cr.roas, { good: 3.0, mid: 2.0 })}`}>{cr.roas.toFixed(2)}x</td>
                            <td className="py-2 px-2 text-right">{cr.cac > 0 ? `₩${formatCompact(cr.cac)}` : "-"}</td>
                          </tr>
                          {selectedCreative === cr.id && creativeTrend.length > 0 && (
                            <tr key={`${cr.id}-trend`}>
                              <td colSpan={11} className="p-3 bg-gray-50 dark:bg-zinc-800/30">
                                <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">📈 일별 성과 추이</p>
                                <div className="h-40">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={creativeTrend}>
                                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                                      <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                      <YAxis yAxisId="spend" tick={{ fill: chartTheme.tickColor, fontSize: 10 }} tickFormatter={(v: number) => formatCompact(v)} />
                                      <YAxis yAxisId="roas" orientation="right" tick={{ fill: "#22c55e", fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                                      <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any, name: any) => [name === "ROAS" ? `${Number(v).toFixed(2)}x` : `₩${formatCompact(v)}`, name]} />
                                      <Area yAxisId="spend" type="monotone" dataKey="spend" name="지출" fill="#6366f1" fillOpacity={0.2} stroke="#6366f1" strokeWidth={1.5} />
                                      <Area yAxisId="spend" type="monotone" dataKey="revenue" name="매출" fill="#22c55e" fillOpacity={0.2} stroke="#22c55e" strokeWidth={1.5} />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
                                  <span>기간: {creativeTrend[0]?.date} ~ {creativeTrend[creativeTrend.length-1]?.date}</span>
                                  <span>총 지출: ₩{formatCompact(creativeTrend.reduce((s: number, t: any) => s + t.spend, 0))}</span>
                                  <span>총 구매: {creativeTrend.reduce((s: number, t: any) => s + t.purchases, 0)}건</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {(() => {
                    const filtered = creatives.filter(cr => {
                      if (crFilter === "active") return cr.status === "ACTIVE" && cr.spend > 0;
                      return cr.spend > 0;
                    });
                    const totalPages = Math.ceil(filtered.length / CR_PER_PAGE);
                    if (totalPages <= 1) return null;
                    return (
                      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                        <button onClick={() => setCrPage(p => Math.max(1, p - 1))} disabled={crPage === 1}
                          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-zinc-800">
                          ← 이전
                        </button>
                        <span className="text-xs text-gray-500 dark:text-zinc-400">{crPage} / {totalPages}</span>
                        <button onClick={() => setCrPage(p => Math.min(totalPages, p + 1))} disabled={crPage === totalPages}
                          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-zinc-800">
                          다음 →
                        </button>
                      </div>
                    );
                  })()}
                  </>
              )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
