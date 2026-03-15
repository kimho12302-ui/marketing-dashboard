"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact, formatPercent, calcChange } from "@/lib/utils";
import type { KPIData } from "@/lib/types";
import {
  TrendingUp, TrendingDown, DollarSign, Megaphone,
  BarChart3, ShoppingCart, Target, Percent, CreditCard, Heart,
} from "lucide-react";

interface KPICardsProps { data: KPIData; }

// Benchmark targets
const BENCHMARKS: Record<string, { target: number; isRatio?: boolean }> = {
  "총매출": { target: 50_000_000 },
  "ROAS": { target: 3.0, isRatio: true },
  "MER": { target: 3.0, isRatio: true },
  "AOV": { target: 200_000 },
};

function getBenchmarkColor(title: string, value: number): string | null {
  const benchmark = BENCHMARKS[title];
  if (!benchmark) return null;
  const ratio = value / benchmark.target;
  if (ratio >= 1.0) return "border-green-500/50 bg-green-950/20";
  if (ratio >= 0.8) return "border-yellow-500/50 bg-yellow-950/20";
  return "border-red-500/50 bg-red-950/20";
}

function getBenchmarkBadge(title: string, value: number): React.ReactNode {
  const benchmark = BENCHMARKS[title];
  if (!benchmark) return null;
  const ratio = value / benchmark.target;
  const pct = (ratio * 100).toFixed(0);
  const targetLabel = benchmark.isRatio
    ? `${benchmark.target.toFixed(1)}x`
    : `₩${formatCompact(benchmark.target)}`;

  if (ratio >= 1.0) return <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">✅ {pct}% of {targetLabel}</span>;
  if (ratio >= 0.8) return <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400">⚠️ {pct}% of {targetLabel}</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">❌ {pct}% of {targetLabel}</span>;
}

export default function KPICards({ data }: KPICardsProps) {
  // Calculate LTV:CAC
  const ltv = (data.aov || 0) * 2.5; // Dummy LTV multiplier
  const cac = data.orders > 0 ? data.adSpend / data.orders : 0;
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;

  const cards = [
    { title: "총매출", value: data.revenue, prev: data.revenuePrev, prefix: "₩", icon: DollarSign },
    { title: "총비용", value: data.adSpend, prev: data.adSpendPrev, prefix: "₩", icon: Megaphone },
    { title: "영업이익", value: data.profit || 0, prev: data.profitPrev || 0, prefix: "₩", icon: CreditCard },
    { title: "ROAS", value: data.roas, prev: data.roasPrev, suffix: "x", icon: BarChart3, isRatio: true },
    { title: "MER", value: data.mer || 0, prev: data.merPrev || 0, suffix: "x", icon: Target, isRatio: true },
    { title: "AOV", value: data.aov || 0, prev: data.aovPrev || 0, prefix: "₩", icon: Percent },
    { title: "주문수", value: data.orders, prev: data.ordersPrev, suffix: "건", icon: ShoppingCart },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((card) => {
          const change = calcChange(card.value, card.prev);
          const isPositive = change >= 0;
          const Icon = card.icon;
          const benchmarkClass = getBenchmarkColor(card.title, card.value);
          return (
            <Card key={card.title} className={benchmarkClass || ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs">{card.title}</CardTitle>
                  <Icon className="h-3.5 w-3.5 text-zinc-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">
                  {card.prefix || ""}{card.isRatio ? card.value.toFixed(2) : formatCompact(card.value)}{card.suffix || ""}
                </div>
                <div className={`flex items-center gap-1 text-xs mt-1 ${
                  card.title === "총비용"
                    ? (isPositive ? "text-red-400" : "text-green-400")
                    : (isPositive ? "text-green-400" : "text-red-400")
                }`}>
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatPercent(change)}
                </div>
                {getBenchmarkBadge(card.title, card.value) && (
                  <div className="mt-1.5">{getBenchmarkBadge(card.title, card.value)}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* LTV:CAC Ratio Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className={ltvCacRatio >= 3.0 ? "border-green-500/50 bg-green-950/20" : ltvCacRatio >= 2.0 ? "border-yellow-500/50 bg-yellow-950/20" : "border-red-500/50 bg-red-950/20"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">LTV:CAC Ratio</CardTitle>
              <Heart className="h-3.5 w-3.5 text-zinc-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ltvCacRatio.toFixed(2)}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-zinc-400">LTV ₩{formatCompact(ltv)}</span>
              <span className="text-[10px] text-zinc-600">|</span>
              <span className="text-[10px] text-zinc-400">CAC ₩{formatCompact(cac)}</span>
            </div>
            <div className="mt-1.5">
              {ltvCacRatio >= 3.0
                ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">✅ 건강 (목표 3.0 이상)</span>
                : ltvCacRatio >= 2.0
                  ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400">⚠️ 주의 (목표 3.0 미달)</span>
                  : <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">❌ 위험 (LTV:CAC 너무 낮음)</span>
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">고객 LTV (추정)</CardTitle>
              <DollarSign className="h-3.5 w-3.5 text-zinc-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₩{formatCompact(ltv)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">= AOV × 2.5 (더미 계수)</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">고객 획득 비용 (CAC)</CardTitle>
              <Megaphone className="h-3.5 w-3.5 text-zinc-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₩{formatCompact(cac)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">= 총광고비 / 주문수</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
