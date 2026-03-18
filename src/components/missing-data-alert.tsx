"use client";

import { useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

interface MissingDataAlertProps {
  className?: string;
}

export default function MissingDataAlert({ className = "" }: MissingDataAlertProps) {
  const [issues, setIssues] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/data-status");
        if (!res.ok) return;
        const data = await res.json();
        const alerts: string[] = [];

        for (const t of data.tables || []) {
          if (t.isStale) {
            const tableName: Record<string, string> = {
              daily_sales: "매출", daily_ad_spend: "광고비", daily_funnel: "퍼널",
              product_sales: "상품매출", keyword_performance: "키워드",
            };
            alerts.push(`${tableName[t.table] || t.table} 데이터가 2일 이상 미갱신`);
          }
        }

        // Check if today's ad spend data is missing (yesterday should exist)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().slice(0, 10);
        const adTable = (data.tables || []).find((t: any) => t.table === "daily_ad_spend");
        if (adTable && adTable.latestDate < yStr) {
          alerts.push(`어제(${yStr}) 광고비 데이터 미입력 — 쿠팡/GFA 확인 필요`);
        }

        if (data.productCosts === 0) {
          alerts.push("제품 원가 미등록 — 영업이익 계산 불가");
        }

        setIssues(alerts);
      } catch {}
    }
    check();
  }, []);

  if (issues.length === 0 || dismissed) return null;

  return (
    <div className={`rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400">📋 데이터 입력 확인</p>
          <ul className="mt-1 space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i} className="text-xs text-blue-600 dark:text-blue-300">• {issue}</li>
            ))}
          </ul>
          <a href="/settings" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
            Settings에서 확인 →
          </a>
        </div>
        <button onClick={() => setDismissed(true)} className="text-blue-400 hover:text-blue-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
