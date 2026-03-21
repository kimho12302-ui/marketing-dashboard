"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";

interface BrandCompareChartProps {
  data: { brand: string; revenue: number }[];
}

const BRAND_LABELS: Record<string, string> = {
  nutty: "너티",
  ironpet: "아이언펫",
  balancelab: "밸런스랩",
  saip: "사입",
};

export default function BrandCompareChart({ data }: BrandCompareChartProps) {
  const chartTheme = useChartTheme();

  const chartData = data.map((d) => ({
    ...d,
    label: BRAND_LABELS[d.brand] || d.brand,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>브랜드별 매출 비교</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridColor} />
              <XAxis dataKey="label" tick={{ fill: chartTheme.tickColor, fontSize: 12 }} />
              <YAxis tick={{ fill: chartTheme.tickColor, fontSize: 12 }} tickFormatter={(v: any) => formatCompact(v)} />
              <Tooltip
                contentStyle={chartTheme.tooltipStyle}
                formatter={(value: any) => [`₩${formatCompact(value)}`, "매출"]}
              />
              <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
