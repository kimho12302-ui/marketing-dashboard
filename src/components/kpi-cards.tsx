"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact, formatPercent, calcChange } from "@/lib/utils";
import type { KPIData } from "@/lib/types";
import {
  TrendingUp, TrendingDown, DollarSign, Megaphone,
  BarChart3, ShoppingCart, Target, CreditCard, HelpCircle,
} from "lucide-react";

interface Targets {
  revenue?: number;
  roas?: number;
  orders?: number;
  cac?: number;
  convRate?: number;
}

interface KPICardsProps {
  data: KPIData;
  periodLabel?: string;
  onCardClick?: (key: string) => void;
  selectedCard?: string | null;
  targets?: Targets;
}

const GLOSSARY: Record<string, string> = {
  revenue: "총 매출액. 모든 채널의 판매 금액 합계.",
  adSpend: "광고비 + 건별 마케팅비. Meta, 네이버, 쿠팡 등 모든 광고 채널 합산.",
  profit: "영업이익 = 매출 - 광고비 - 제품원가 - 배송비. 실제 남는 돈.",
  roas: "Return On Ad Spend. 광고비 1원당 매출액. 2.0x = 1원 쓰면 2원 번다.",
  orders: "총 주문 건수. 모든 판매 채널 합산.",
  aov: "Average Order Value. 주문 1건당 평균 금액 = 매출 ÷ 주문수.",
  cac: "Customer Acquisition Cost. 고객 1명 획득 비용 = 광고비 ÷ 주문수.",
};

export default function KPICards({ data, periodLabel, onCardClick, selectedCard, targets }: KPICardsProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const cac = data.orders > 0 ? data.adSpend / data.orders : 0;
  const prevCac = data.ordersPrev > 0 ? data.adSpendPrev / data.ordersPrev : 0;

  const cards = [
    { key: "revenue", title: "매출", value: data.revenue, prev: data.revenuePrev, prefix: "₩", icon: DollarSign, invertColor: false, target: targets?.revenue },
    { key: "adSpend", title: "광고비", value: data.adSpend, prev: data.adSpendPrev, prefix: "₩", icon: Megaphone, invertColor: true },
    { key: "profit", title: "영업이익", value: data.profit || 0, prev: data.profitPrev || 0, prefix: "₩", icon: CreditCard, invertColor: false, subtitle: data.revenue > 0 ? `${((data.profit || 0) / data.revenue * 100).toFixed(1)}%` : undefined },
    { key: "roas", title: "ROAS", value: data.roas, prev: data.roasPrev, suffix: "x", icon: BarChart3, isRatio: true, invertColor: false, target: targets?.roas },
    { key: "orders", title: "주문수", value: data.orders, prev: data.ordersPrev, suffix: "건", icon: ShoppingCart, invertColor: false, target: targets?.orders },
    { key: "aov", title: "AOV", value: data.aov || 0, prev: data.aovPrev || 0, prefix: "₩", icon: Target, invertColor: false },
    { key: "cac", title: "CAC", value: cac, prev: prevCac, prefix: "₩", icon: Megaphone, invertColor: true, target: targets?.cac, targetInvert: true },
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

          // Target progress
          const hasTarget = card.target && card.target > 0;
          let targetPct = 0;
          let targetColor = "";
          if (hasTarget) {
            if ((card as any).targetInvert) {
              // CAC: lower is better
              targetPct = card.value > 0 ? (card.target! / card.value) * 100 : 0;
            } else {
              targetPct = card.target! > 0 ? (card.value / card.target!) * 100 : 0;
            }
            targetColor = targetPct >= 100 ? "bg-green-500" : targetPct >= 80 ? "bg-yellow-500" : "bg-red-500";
          }

          return (
            <Card key={card.key} className={`${profitBorder} ${clickable} ${isSelected ? "border-indigo-500 ring-1 ring-indigo-500/30" : ""} relative`}
              onClick={() => onCardClick?.(card.key)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-xs text-gray-400 dark:text-zinc-400">{card.title}</CardTitle>
                    <button
                      className="text-gray-300 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setTooltip(tooltip === card.key ? null : card.key); }}
                    >
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </div>
                  <Icon className="h-3.5 w-3.5 text-gray-300 dark:text-zinc-600" />
                </div>
                {tooltip === card.key && GLOSSARY[card.key] && (
                  <div className="absolute top-12 left-2 right-2 z-50 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg p-2 text-xs text-gray-600 dark:text-zinc-300">
                    {GLOSSARY[card.key]}
                  </div>
                )}
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
        })}
      </div>
    </div>
  );
}
