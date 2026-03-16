"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact, formatPercent, calcChange } from "@/lib/utils";
import type { KPIData } from "@/lib/types";
import {
  TrendingUp, TrendingDown, DollarSign, Megaphone,
  BarChart3, ShoppingCart, Target, CreditCard,
} from "lucide-react";

interface KPICardsProps {
  data: KPIData;
  periodLabel?: string;
}

export default function KPICards({ data, periodLabel }: KPICardsProps) {
  const cac = data.orders > 0 ? data.adSpend / data.orders : 0;

  const cards = [
    { title: "매출", value: data.revenue, prev: data.revenuePrev, prefix: "₩", icon: DollarSign, invertColor: false },
    { title: "광고비", value: data.adSpend, prev: data.adSpendPrev, prefix: "₩", icon: Megaphone, invertColor: true },
    { title: "영업이익", value: data.profit || 0, prev: data.profitPrev || 0, prefix: "₩", icon: CreditCard, invertColor: false },
    { title: "ROAS", value: data.roas, prev: data.roasPrev, suffix: "x", icon: BarChart3, isRatio: true, invertColor: false },
    { title: "주문수", value: data.orders, prev: data.ordersPrev, suffix: "건", icon: ShoppingCart, invertColor: false },
    { title: "AOV", value: data.aov || 0, prev: data.aovPrev || 0, prefix: "₩", icon: Target, invertColor: false },
    { title: "CAC", value: cac, prev: 0, prefix: "₩", icon: Megaphone, invertColor: true },
  ];

  return (
    <div className="space-y-2">
      {periodLabel && (
        <p className="text-xs text-zinc-500">{periodLabel}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((card) => {
          const change = calcChange(card.value, card.prev);
          const isPositive = change >= 0;
          const Icon = card.icon;

          // 색상: 비용 계열은 반전
          const colorClass = card.invertColor
            ? (isPositive ? "text-red-400" : "text-green-400")
            : (isPositive ? "text-green-400" : "text-red-400");

          // 영업이익 색상
          const profitBorder = card.title === "영업이익"
            ? (data.profit || 0) >= 0
              ? "border-green-500/30"
              : "border-red-500/30"
            : "";

          return (
            <Card key={card.title} className={profitBorder}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs text-zinc-400">{card.title}</CardTitle>
                  <Icon className="h-3.5 w-3.5 text-zinc-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold tracking-tight">
                  {card.prefix || ""}
                  {card.isRatio ? card.value.toFixed(2) : formatCompact(card.value)}
                  {card.suffix || ""}
                </div>
                {card.prev !== 0 && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${colorClass}`}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatPercent(change)} vs 이전
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
