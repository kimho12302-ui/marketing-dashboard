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
  onCardClick?: (key: string) => void;
  selectedCard?: string | null;
}

export default function KPICards({ data, periodLabel, onCardClick, selectedCard }: KPICardsProps) {
  const cac = data.orders > 0 ? data.adSpend / data.orders : 0;

  const cards = [
    { key: "revenue", title: "매출", value: data.revenue, prev: data.revenuePrev, prefix: "₩", icon: DollarSign, invertColor: false },
    { key: "adSpend", title: "광고비", value: data.adSpend, prev: data.adSpendPrev, prefix: "₩", icon: Megaphone, invertColor: true },
    { key: "profit", title: "영업이익", value: data.profit || 0, prev: data.profitPrev || 0, prefix: "₩", icon: CreditCard, invertColor: false, subtitle: data.revenue > 0 ? `${((data.profit || 0) / data.revenue * 100).toFixed(1)}%` : undefined },
    { key: "roas", title: "ROAS", value: data.roas, prev: data.roasPrev, suffix: "x", icon: BarChart3, isRatio: true, invertColor: false },
    { key: "orders", title: "주문수", value: data.orders, prev: data.ordersPrev, suffix: "건", icon: ShoppingCart, invertColor: false },
    { key: "aov", title: "AOV", value: data.aov || 0, prev: data.aovPrev || 0, prefix: "₩", icon: Target, invertColor: false },
    { key: "cac", title: "CAC", value: cac, prev: 0, prefix: "₩", icon: Megaphone, invertColor: true },
  ];

  return (
    <div className="space-y-2">
      {periodLabel && (
        <p className="text-xs text-gray-400 dark:text-zinc-500">{periodLabel}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((card) => {
          const change = calcChange(card.value, card.prev);
          const isPositive = change >= 0;
          const Icon = card.icon;
          const colorClass = card.invertColor
            ? (isPositive ? "text-red-400" : "text-green-400")
            : (isPositive ? "text-green-400" : "text-red-400");
          const profitBorder = card.key === "profit"
            ? (data.profit || 0) >= 0 ? "border-green-500/30" : "border-red-500/30"
            : "";
          const isSelected = selectedCard === card.key;
          const clickable = onCardClick ? "cursor-pointer hover:border-indigo-500/50 transition-colors" : "";

          return (
            <Card key={card.key} className={`${profitBorder} ${clickable} ${isSelected ? "border-indigo-500 ring-1 ring-indigo-500/30" : ""}`}
              onClick={() => onCardClick?.(card.key)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs text-gray-400 dark:text-zinc-400">{card.title}</CardTitle>
                  <Icon className="h-3.5 w-3.5 text-gray-300 dark:text-zinc-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold tracking-tight text-gray-900 dark:text-zinc-100">
                  {card.prefix || ""}
                  {card.isRatio ? card.value.toFixed(2) : formatCompact(card.value)}
                  {card.suffix || ""}
                  {(card as any).subtitle && (
                    <span className="text-xs font-normal text-gray-400 dark:text-zinc-500 ml-1">({(card as any).subtitle})</span>
                  )}
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
