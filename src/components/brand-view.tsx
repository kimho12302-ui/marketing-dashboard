"use client";

import { useState, useEffect, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact, formatPercent, calcChange } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
  PieChart, Pie, LineChart, Line, ComposedChart,
} from "recharts";
import { TrendingUp, TrendingDown, HelpCircle } from "lucide-react";

const BRAND_COLORS: Record<string, string> = {
  nutty: "#ef4444", ironpet: "#f97316", balancelab: "#3b82f6", saip: "#38bdf8",
};
const BRAND_LABELS: Record<string, string> = {
  nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩",
};
const CH_LABELS: Record<string, string> = {
  meta: "Meta", naver_search: "네이버검색", naver_shopping: "네이버쇼핑",
  google_pmax: "P-Max", "ga4_Performance Max": "P-Max", coupang: "쿠팡", coupang_ads: "쿠팡광고",
  smartstore: "스마트스토어", cafe24: "카페24", ably: "에이블리",
  petfriends: "펫프렌즈", pp: "PP", peepee: "피피",
};
const CHANNEL_COLORS: Record<string, string> = {
  meta: "#8b5cf6", naver_search: "#22c55e", naver_shopping: "#10b981",
  google_ads: "#eab308", google_pmax: "#eab308", "ga4_Performance Max": "#eab308", "ga4_Search": "#eab308",
  coupang: "#ef4444", coupang_ads: "#f97316",
  smartstore: "#22c55e", cafe24: "#3b82f6", ably: "#a78bfa",
  petfriends: "#f43f5e", pp: "#6366f1", peepee: "#a855f7",
  gfa: "#14b8a6",
};
const LINEUP_COLORS: Record<string, string> = {
  "하루루틴": "#ef4444", "사운드": "#6366f1", "기타": "#9ca3af",
};
const SUB_BRAND_COLORS: Record<string, string> = {
  "파미나": "#6366f1", "닥터레이": "#22c55e", "고네이티브": "#f97316", "테라카니스": "#ec4899", "기타": "#888",
};
const PALETTE = ["#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e", "#3b82f6", "#a855f7"];

interface KPI {
  revenue: number; revenuePrev: number;
  adSpend: number; adSpendPrev: number;
  roas: number; roasPrev: number;
  orders: number; ordersPrev: number;
  aov: number; aovPrev: number;
}

interface BrandViewData {
  kpi: KPI;
  salesByChannel: { channel: string; revenue: number }[];
  adByChannel: { channel: string; spend: number; roas: number }[];
  trend: { date: string; revenue: number; adSpend: number }[];
  topProducts: { product: string; revenue: number; quantity: number }[];
  targets: Record<string, number>;
  // nutty
  lineupBreakdown?: { lineup: string; revenue: number; quantity: number }[];
  // balancelab
  selfRevenue?: number;
  gongguRevenue?: number;
  gongguSales?: { seller: string; revenue: number; orders: number; quantity: number }[];
  selfGongguTrend?: { date: string; 자체판매: number; 공동구매: number }[];
  optionBreakdown?: { option: string; count: number; revenue: number }[];
  // saip
  subBrandRevenue?: { subBrand: string; revenue: number }[];
  subBrandTrend?: Record<string, unknown>[];
}

function KPICard({ title, value, prev, prefix, suffix, isRatio, invertColor, target }: {
  title: string; value: number; prev: number; prefix?: string; suffix?: string;
  isRatio?: boolean; invertColor?: boolean; target?: number;
}) {
  const change = calcChange(value, prev);
  const isPositive = change >= 0;
  const colorClass = invertColor
    ? (isPositive ? "text-red-400" : "text-green-400")
    : (isPositive ? "text-green-400" : "text-red-400");
  const hasTarget = target && target > 0;
  const targetPct = hasTarget ? (value / target) * 100 : 0;
  const targetColor = targetPct >= 100 ? "bg-green-500" : targetPct >= 80 ? "bg-yellow-500" : "bg-red-500";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs text-gray-400 dark:text-zinc-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold tracking-tight text-gray-900 dark:text-zinc-100">
          {prefix || ""}{isRatio ? value.toFixed(2) : formatCompact(value)}{suffix || ""}
        </div>
        {prev !== 0 && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${colorClass}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatPercent(change)} vs 이전
          </div>
        )}
        {hasTarget && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-zinc-500 mb-0.5">
              <span>목표 대비</span>
              <span className={targetPct >= 100 ? "text-green-500" : targetPct >= 80 ? "text-yellow-500" : "text-red-500"}>
                {Math.round(targetPct)}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${targetColor}`} style={{ width: `${Math.min(targetPct, 100)}%` }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BrandView() {
  const chartTheme = useChartTheme();
  const { filters } = useFilters();
  const [data, setData] = useState<BrandViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const brand = filters.brand;

  const fetchData = useCallback(async () => {
    if (brand === "all") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        brand, from: filters.from, to: filters.to, period: filters.period,
      });
      const res = await fetch(`/api/brand-detail?${params}`);
      if (res.ok) setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [brand, filters.from, filters.to, filters.period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data || loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 animate-pulse">
              <div className="h-3 w-16 bg-gray-200 dark:bg-zinc-700 rounded mb-2" />
              <div className="h-6 w-24 bg-gray-200 dark:bg-zinc-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { kpi, salesByChannel, adByChannel, trend, topProducts, targets } = data;
  const brandColor = BRAND_COLORS[brand] || "#6366f1";
  const brandLabel = BRAND_LABELS[brand] || brand;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard title="매출" value={kpi.revenue} prev={kpi.revenuePrev} prefix="₩" target={targets?.revenue} />
          <KPICard title="광고비" value={kpi.adSpend} prev={kpi.adSpendPrev} prefix="₩" invertColor />
          <KPICard title="ROAS" value={kpi.roas} prev={kpi.roasPrev} suffix="x" isRatio target={targets?.roas} />
          <KPICard title="주문수" value={kpi.orders} prev={kpi.ordersPrev} suffix="건" target={targets?.orders} />
          <KPICard title="AOV" value={kpi.aov} prev={kpi.aovPrev} prefix="₩" />
        </div>
      </section>

      {/* Brand-specific sections */}
      {brand === "nutty" && <NuttySection data={data} chartTheme={chartTheme} />}
      {brand === "ironpet" && <IronpetSection data={data} chartTheme={chartTheme} />}
      {brand === "balancelab" && <BalancelabSection data={data} chartTheme={chartTheme} />}
      {brand === "saip" && <SaipSection data={data} chartTheme={chartTheme} />}

      {/* Common: Channel sales */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>📊 채널별 매출</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByChannel.map(c => ({ name: CH_LABELS[c.channel] || c.channel, revenue: c.revenue, channel: c.channel }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartTheme.labelColor, fontSize: 11 }} />
                  <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                  <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                    {salesByChannel.map((c, i) => <Cell key={i} fill={CHANNEL_COLORS[c.channel] || PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>📢 채널별 광고비</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adByChannel.map(c => ({ name: CH_LABELS[c.channel] || c.channel, spend: c.spend, channel: c.channel }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartTheme.labelColor, fontSize: 11 }} />
                  <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, "광고비"]} />
                  <Bar dataKey="spend" radius={[0, 6, 6, 0]}>
                    {adByChannel.map((c, i) => <Cell key={i} fill={CHANNEL_COLORS[c.channel] || PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader><CardTitle>🏆 상위 제품 TOP {Math.min(topProducts.length, 10)}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts.map(p => ({ name: p.product.length > 20 ? p.product.slice(0, 20) + "..." : p.product, fullName: p.product, revenue: p.revenue }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis type="number" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: chartTheme.labelColor, fontSize: 10 }} />
                  <Tooltip contentStyle={chartTheme.tooltipStyle}
                    formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]}
                    labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName || ""} />
                  <Bar dataKey="revenue" fill={brandColor} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue + Ad Spend + ROAS Trend */}
      <Card>
        <CardHeader><CardTitle>📈 매출 + 광고비 트렌드</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend.map(d => ({ ...d, roas: d.adSpend > 0 ? Math.round((d.revenue / d.adSpend) * 100) / 100 : 0 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                <YAxis yAxisId="left" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
                <YAxis yAxisId="roas" orientation="right" tick={{ fill: "#a78bfa", fontSize: 11 }} tickFormatter={v => `${v}x`} domain={[0, 'auto']} />
                <Tooltip contentStyle={chartTheme.tooltipStyle}
                  formatter={(v: any, name: any) => [name === "ROAS" ? `${Number(v).toFixed(2)}x` : `₩${formatCompact(v)}`, name]} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="매출" fill={brandColor} opacity={0.7} radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="adSpend" name="광고비" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line yAxisId="roas" type="monotone" dataKey="roas" name="ROAS" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 2, fill: "#a78bfa" }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Nutty Section ──────────────────────────────────────────
function NuttySection({ data, chartTheme }: { data: BrandViewData; chartTheme: ReturnType<typeof useChartTheme> }) {
  const lineup = data.lineupBreakdown || [];
  if (lineup.length === 0) return null;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>🎵 라인업별 매출</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={lineup.map(l => ({ name: l.lineup, value: l.revenue }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={35}
                  label={({ name, percent, x, y, textAnchor }: any) => <text x={x} y={y} textAnchor={textAnchor} fill={chartTheme.isDark ? "#e4e4e7" : "#374151"} fontSize={12}>{`${name} ${((percent || 0) * 100).toFixed(0)}%`}</text>}
                  labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                  {lineup.map((l, i) => <Cell key={i} fill={LINEUP_COLORS[l.lineup] || PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 mt-2">
            {lineup.map(l => (
              <div key={l.lineup} className="flex justify-between text-xs text-gray-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LINEUP_COLORS[l.lineup] || "#888" }} />
                  {l.lineup}
                </span>
                <span>₩{formatCompact(l.revenue)} ({l.quantity}개)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ── Ironpet Section ──────────────────────────────────────────
function IronpetSection({ data, chartTheme }: { data: BrandViewData; chartTheme: ReturnType<typeof useChartTheme> }) {
  // Ironpet is simple - the common sections (channel sales, ad spend, trend, products) are enough
  return null;
}

// ── Balancelab Section ──────────────────────────────────────
function BalancelabSection({ data, chartTheme }: { data: BrandViewData; chartTheme: ReturnType<typeof useChartTheme> }) {
  const selfRev = data.selfRevenue || 0;
  const gongguRev = data.gongguRevenue || 0;
  const total = selfRev + gongguRev;
  const gongguSales = data.gongguSales || [];
  const sgTrend = data.selfGongguTrend || [];
  const optionBreakdown = data.optionBreakdown || [];

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>🤝 자체판매 vs 공동구매</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-500 dark:text-zinc-400">자체판매</p>
                <p className="text-xl font-bold text-blue-400">₩{formatCompact(selfRev)}</p>
                <p className="text-[10px] text-gray-400">{total > 0 ? `${((selfRev / total) * 100).toFixed(0)}%` : ""}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-500 dark:text-zinc-400">공동구매</p>
                <p className="text-xl font-bold text-purple-400">₩{formatCompact(gongguRev)}</p>
                <p className="text-[10px] text-gray-400">{total > 0 ? `${((gongguRev / total) * 100).toFixed(0)}%` : ""}</p>
              </div>
            </div>
            <div className="h-3 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
              {total > 0 && (
                <>
                  <div className="bg-blue-400 h-full" style={{ width: `${(selfRev / total) * 100}%` }} />
                  <div className="bg-purple-400 h-full" style={{ width: `${(gongguRev / total) * 100}%` }} />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>📦 공구별 매출</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gongguSales.map((g, i) => {
                const maxRev = gongguSales[0]?.revenue || 1;
                const pct = (g.revenue / maxRev) * 100;
                return (
                  <div key={g.seller}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-zinc-300">{g.seller}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">₩{formatCompact(g.revenue)}</span>
                        <span className="text-[10px] text-gray-400">{g.orders}건 {g.quantity}개</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-purple-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {gongguSales.length === 0 && <p className="text-sm text-gray-400">공동구매 데이터 없음</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {optionBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle>🧪 제품/옵션별 판매 현황</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {optionBreakdown.map((opt, i) => {
                const maxCount = optionBreakdown[0]?.count || 1;
                const pct = (opt.count / maxCount) * 100;
                return (
                  <div key={opt.option}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-zinc-300">{opt.option}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{opt.count}건</span>
                        {opt.revenue > 0 && <span className="text-[10px] text-gray-400">₩{formatCompact(opt.revenue)}</span>}
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-pink-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {sgTrend.length > 0 && (
        <Card>
          <CardHeader><CardTitle>📈 자체판매 vs 공동구매 트렌드</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sgTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
                  <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any, name: any) => [`₩${formatCompact(v)}`, name]} />
                  <Legend />
                  <Line type="monotone" dataKey="자체판매" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="공동구매" stroke="#a855f7" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ── Saip Section ──────────────────────────────────────────
function SaipSection({ data, chartTheme }: { data: BrandViewData; chartTheme: ReturnType<typeof useChartTheme> }) {
  const subBrandRevenue = data.subBrandRevenue || [];
  const subBrandTrend = (data.subBrandTrend || []) as Record<string, unknown>[];
  const subBrands = subBrandRevenue.map(s => s.subBrand);

  return (
    <section className="space-y-6">
      {subBrandRevenue.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>🏷️ 하위 브랜드별 매출 비중</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={subBrandRevenue.map(s => ({ name: s.subBrand, value: s.revenue }))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={35}
                      label={({ name, percent, x, y, textAnchor }: any) => <text x={x} y={y} textAnchor={textAnchor} fill={chartTheme.isDark ? "#e4e4e7" : "#374151"} fontSize={12}>{`${name} ${((percent || 0) * 100).toFixed(0)}%`}</text>}
                      labelLine={{ stroke: chartTheme.isDark ? "#555" : "#9ca3af" }}>
                      {subBrandRevenue.map((s, i) => <Cell key={i} fill={SUB_BRAND_COLORS[s.subBrand] || PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any) => [`₩${formatCompact(v)}`, "매출"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-2">
                {subBrandRevenue.map((s, i) => (
                  <div key={s.subBrand} className="flex justify-between text-xs text-gray-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SUB_BRAND_COLORS[s.subBrand] || PALETTE[i % PALETTE.length] }} />
                      {s.subBrand}
                    </span>
                    <span>₩{formatCompact(s.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {subBrandTrend.length > 0 && (
            <Card>
              <CardHeader><CardTitle>📈 하위 브랜드별 매출 트렌드</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={subBrandTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                      <XAxis dataKey="date" tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 11 }} tickFormatter={(v: any) => formatCompact(v)} />
                      <Tooltip contentStyle={chartTheme.tooltipStyle} formatter={(v: any, name: any) => [`₩${formatCompact(v)}`, name]} />
                      <Legend />
                      {subBrands.map((sb, i) => (
                        <Line key={sb} type="monotone" dataKey={sb} name={sb}
                          stroke={SUB_BRAND_COLORS[sb] || PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
