"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";

interface ChannelData {
  channel: string;
  spend: number;
  roas: number;
}

interface ChannelChartProps {
  data: ChannelData[];
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: "메타",
  naver_search: "네이버검색",
  naver_shopping: "네이버쇼핑",
  google_search: "구글검색",
  gdn: "GDN",
  gfa: "GFA",
  coupang_ads: "쿠팡광고",
  influencer: "인플루언서",
};

const COLORS = [
  "#6366f1",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f43f5e",
];

export default function ChannelChart({ data }: ChannelChartProps) {
  const chartData = data
    .map((d) => ({
      ...d,
      label: CHANNEL_LABELS[d.channel] || d.channel,
    }))
    .sort((a, b) => b.spend - a.spend);

  return (
    <Card>
      <CardHeader>
        <CardTitle>채널별 광고비 & ROAS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                type="number"
                tick={{ fill: "#888", fontSize: 12 }}
                tickFormatter={(v) => formatCompact(v)}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={90}
                tick={{ fill: "#888", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#aaa" }}
                formatter={(value: any, name: any) => [
                  name === "광고비"
                    ? `₩${formatCompact(value)}`
                    : `${value.toFixed(2)}x`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ color: "#aaa", fontSize: 13, paddingTop: 8 }}
              />
              <Bar
                dataKey="spend"
                name="광고비"
                fill="#6366f1"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* ROAS tags */}
        <div className="flex flex-wrap gap-2 mt-4">
          {chartData.map((ch, i) => (
            <div
              key={ch.channel}
              className="flex items-center gap-2 rounded-full px-3 py-1 text-xs border border-zinc-700"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-zinc-300">{ch.label}</span>
              <span className="font-semibold text-zinc-100">
                ROAS {ch.roas.toFixed(2)}x
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
