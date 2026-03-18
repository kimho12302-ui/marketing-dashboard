"use client";

import { useState } from "react";
import type { KPIData } from "@/lib/types";
import { AlertTriangle, X } from "lucide-react";

interface AnomalyBannerProps {
  data: KPIData;
}

interface Anomaly {
  type: "warning" | "danger";
  message: string;
  detail: string;
}

function detectAnomalies(data: KPIData): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const { revenue, revenuePrev, adSpend, adSpendPrev, roas, roasPrev, orders, ordersPrev } = data;

  // ROAS dropped 30%+
  if (roasPrev > 0 && roas < roasPrev * 0.7) {
    const drop = ((1 - roas / roasPrev) * 100).toFixed(0);
    anomalies.push({
      type: "danger",
      message: `ROAS ${drop}% 하락`,
      detail: `${roasPrev.toFixed(2)}x → ${roas.toFixed(2)}x. 광고 효율이 크게 떨어졌습니다.`,
    });
  }

  // Ad spend surged 50%+
  if (adSpendPrev > 0 && adSpend > adSpendPrev * 1.5) {
    const surge = ((adSpend / adSpendPrev - 1) * 100).toFixed(0);
    anomalies.push({
      type: "warning",
      message: `광고비 ${surge}% 급증`,
      detail: `₩${(adSpendPrev / 10000).toFixed(0)}만 → ₩${(adSpend / 10000).toFixed(0)}만. 예산 초과 여부를 확인하세요.`,
    });
  }

  // Revenue dropped 20%+
  if (revenuePrev > 0 && revenue < revenuePrev * 0.8) {
    const drop = ((1 - revenue / revenuePrev) * 100).toFixed(0);
    anomalies.push({
      type: "danger",
      message: `매출 ${drop}% 하락`,
      detail: `₩${(revenuePrev / 10000).toFixed(0)}만 → ₩${(revenue / 10000).toFixed(0)}만. 채널별 매출을 확인하세요.`,
    });
  }

  // CAC surged 40%+
  const cac = orders > 0 ? adSpend / orders : 0;
  const prevCac = ordersPrev > 0 ? adSpendPrev / ordersPrev : 0;
  if (prevCac > 0 && cac > prevCac * 1.4) {
    const surge = ((cac / prevCac - 1) * 100).toFixed(0);
    anomalies.push({
      type: "warning",
      message: `CAC ${surge}% 상승`,
      detail: `₩${Math.round(prevCac).toLocaleString()} → ₩${Math.round(cac).toLocaleString()}. 고객 획득 비용이 늘었습니다.`,
    });
  }

  // Orders dropped 25%+
  if (ordersPrev > 0 && orders < ordersPrev * 0.75) {
    const drop = ((1 - orders / ordersPrev) * 100).toFixed(0);
    anomalies.push({
      type: "warning",
      message: `주문수 ${drop}% 감소`,
      detail: `${ordersPrev}건 → ${orders}건. 트래픽이나 전환율을 확인하세요.`,
    });
  }

  return anomalies;
}

export default function AnomalyBanner({ data }: AnomalyBannerProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const anomalies = detectAnomalies(data);
  const visible = anomalies.filter((_, i) => !dismissed.has(i));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {anomalies.map((a, i) => {
        if (dismissed.has(i)) return null;
        const bgClass = a.type === "danger"
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800";
        const textClass = a.type === "danger"
          ? "text-red-700 dark:text-red-400"
          : "text-yellow-700 dark:text-yellow-400";
        const detailClass = a.type === "danger"
          ? "text-red-600 dark:text-red-300"
          : "text-yellow-600 dark:text-yellow-300";

        return (
          <div key={i} className={`rounded-lg border p-3 flex items-start gap-3 ${bgClass}`}>
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${textClass}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${textClass}`}>⚠️ {a.message}</p>
              <p className={`text-xs mt-0.5 ${detailClass}`}>{a.detail}</p>
            </div>
            <button
              onClick={() => setDismissed(prev => new Set([...prev, i]))}
              className={`flex-shrink-0 ${textClass} hover:opacity-70`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
