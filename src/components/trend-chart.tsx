"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import type { TrendDataPoint } from "@/lib/types";

interface TrendChartProps {
  data: TrendDataPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-lg">
      <p className="text-xs text-zinc-400 mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: ₩{formatCompact(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function TrendChart({ data }: TrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>매출 vs 광고비 트렌드</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#888", fontSize: 12 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: "#888", fontSize: 12 }}
                tickFormatter={(v) => formatCompact(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#888", fontSize: 12 }}
                tickFormatter={(v) => formatCompact(v)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ color: "#aaa", fontSize: 13, paddingTop: 8 }}
              />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                name="매출"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                opacity={0.8}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="adSpend"
                name="광고비"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
