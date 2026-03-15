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
import type { FunnelStep } from "@/lib/types";

interface FunnelChartProps {
  data: FunnelStep[];
}

const GRADIENT_COLORS = [
  "#6366f1",
  "#818cf8",
  "#a78bfa",
  "#c084fc",
  "#e879f9",
  "#f472b6",
];

export default function FunnelChart({ data }: FunnelChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>퍼널 분석</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#888", fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: "#888", fontSize: 12 }}
                tickFormatter={(v) => formatCompact(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#aaa" }}
                formatter={(value: any) => [
                  formatCompact(value),
                  "수량",
                ]}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={GRADIENT_COLORS[index % GRADIENT_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Conversion rates */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {data.slice(1).map((step, i) => (
            <div
              key={step.name}
              className="text-center rounded-lg bg-zinc-800/50 p-2"
            >
              <div className="text-[10px] text-zinc-500">
                {data[i].name} → {step.name}
              </div>
              <div className="text-sm font-bold text-zinc-200 mt-0.5">
                {step.rate !== undefined ? `${step.rate.toFixed(1)}%` : "-"}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
