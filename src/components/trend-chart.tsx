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
  ReferenceLine,
  LabelList,
} from "recharts";
import { type MarketingEvent, EventBadges } from "@/components/event-markers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import type { TrendDataPoint } from "@/lib/types";

const BRAND_COLORS: Record<string, string> = {
  "너티": "#6366f1",
  "아이언펫": "#22c55e",
  "사입": "#f97316",
  "밸런스랩": "#ec4899",
};

const BRAND_KEYS = ["너티", "아이언펫", "사입", "밸런스랩"];

interface TrendChartProps {
  data: TrendDataPoint[];
  events?: MarketingEvent[];
}

function CustomTooltip({
  active,
  payload,
  label,
  chartTheme,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>;
  label?: string;
  chartTheme: ReturnType<typeof useChartTheme>;
}) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-lg">
      <p className="text-xs text-gray-400 dark:text-zinc-400 mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: ₩{formatCompact(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function TrendChart({ data, events = [] }: TrendChartProps) {
  const chartTheme = useChartTheme();

  const activeBrands = BRAND_KEYS.filter(b =>
    data.some(d => (d as any)[b] > 0)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>매출 vs 광고비 트렌드</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
              <XAxis
                dataKey="date"
                tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                tickFormatter={(v) => formatCompact(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: chartTheme.tickColor, fontSize: 12 }}
                tickFormatter={(v) => formatCompact(v)}
              />
              <Tooltip content={<CustomTooltip chartTheme={chartTheme} />} />
              <Legend
                wrapperStyle={{ color: chartTheme.legendColor, fontSize: 13, paddingTop: 8 }}
              />
              {activeBrands.map((brand, idx) => (
                <Bar
                  key={brand}
                  yAxisId="left"
                  dataKey={brand}
                  name={brand}
                  fill={BRAND_COLORS[brand] || "#888"}
                  stackId="revenue"
                  radius={idx === activeBrands.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  opacity={0.85}
                >
                  {idx === activeBrands.length - 1 && (
                    <LabelList
                      dataKey="revenue"
                      position="top"
                      formatter={(v: number) => v > 0 ? formatCompact(v) : ""}
                      style={{ fill: chartTheme.tickColor, fontSize: 10, fontWeight: 600 }}
                    />
                  )}
                </Bar>
              ))}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="adSpend"
                name="광고비"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="maRevenue"
                name="매출 7일 평균"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
              />
              {events.map((e) => (
                <ReferenceLine
                  key={e.id}
                  x={e.date}
                  yAxisId="left"
                  stroke={e.color || "#6366f1"}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `▼ ${e.title}`,
                    position: "insideBottomLeft",
                    fill: e.color || "#6366f1",
                    fontSize: 10,
                    fontWeight: 700,
                    offset: 5,
                  }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <EventBadges events={events} />
      </CardContent>
    </Card>
  );
}
