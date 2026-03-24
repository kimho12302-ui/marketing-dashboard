"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";

interface ChannelData {
  channel: string;
  spend: number;
  roas: number;
}

interface ChannelChartProps {
  data: ChannelData[];
  mode?: "spend" | "roas";
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: "Meta",
  naver_search: "네이버검색",
  naver_shopping: "네이버쇼핑",
  google_search: "구글검색",
  google_pmax: "P-Max",
  "ga4_Performance Max": "P-Max",
  "ga4_Search": "Google(GA4)",
  coupang: "쿠팡광고",
  gdn: "GDN",
  gfa: "GFA",
  coupang_ads: "쿠팡광고",
  influencer: "인플루언서",
  smartstore: "스마트스토어",
  cafe24: "카페24",
};

const CHANNEL_COLORS: Record<string, string> = {
  meta: "#8b5cf6",
  naver_search: "#22c55e",
  naver_shopping: "#10b981",
  google_search: "#eab308",
  google_ads: "#eab308",
  google_pmax: "#eab308",
  "ga4_Performance Max": "#eab308",
  "ga4_Search": "#eab308",
  coupang: "#ef4444",
  coupang_ads: "#f97316",
  gdn: "#f43f5e",
  gfa: "#14b8a6",
  influencer: "#ec4899",
  smartstore: "#22c55e",
  cafe24: "#3b82f6",
  ably: "#a78bfa",
};

const FALLBACK_COLORS = [
  "#6366f1", "#f97316", "#22c55e", "#eab308", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f43f5e",
];

function getChannelColor(channel: string, index: number): string {
  return CHANNEL_COLORS[channel] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export default function ChannelChart({ data, mode = "spend" }: ChannelChartProps) {
  const chartTheme = useChartTheme();
  const isSpend = mode === "spend";

  const chartData = data
    .map((d) => ({
      ...d,
      label: CHANNEL_LABELS[d.channel] || d.channel,
    }))
    .sort((a, b) => (isSpend ? b.spend - a.spend : b.roas - a.roas));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSpend ? "💰 채널별 광고비" : "📈 채널별 ROAS"}</CardTitle>
      </CardHeader>
      <CardContent>
        {isSpend ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                <XAxis
                  type="number"
                  tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={90}
                  tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltipStyle}
                  labelStyle={{ color: chartTheme.labelColor }}
                  formatter={(value: any) => [`₩${formatCompact(value)}`, "광고비"]}
                />
                <Bar dataKey="spend" name="광고비" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={d.channel} fill={getChannelColor(d.channel, i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                    tickFormatter={(v) => `${v.toFixed(1)}x`}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltipStyle}
                    formatter={(value: any) => [`${Number(value).toFixed(2)}x`, "ROAS"]}
                  />
                  <Bar dataKey="roas" name="ROAS" radius={[6, 6, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={d.channel}
                        fill={getChannelColor(d.channel, i)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {chartData.map((ch, i) => (
                <div
                  key={ch.channel}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700/50"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getChannelColor(ch.channel, i) }}
                  />
                  <div className="min-w-0">
                    <span className="text-xs text-gray-500 dark:text-zinc-400 block truncate">{ch.label}</span>
                    <span className={`text-lg font-bold ${ch.roas >= 3 ? "text-green-400" : ch.roas >= 1.5 ? "text-yellow-400" : "text-red-400"}`}>
                      {ch.roas.toFixed(2)}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
