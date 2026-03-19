"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function SyncButton({ onComplete }: { onComplete?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setResult(`❌ ${data.error}`);
      } else {
        const parts = [];
        if (data.sales?.sales) parts.push(`매출 ${data.sales.sales}건`);
        if (data.funnel?.funnel) parts.push(`퍼널 ${data.funnel.funnel}건`);
        if (data.productSales?.productSales) parts.push(`상품 ${data.productSales.productSales}건`);
        setResult(`✅ ${parts.join(", ") || "변경 없음"}`);
        onComplete?.();
      }
    } catch {
      setResult("❌ 싱크 실패");
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "싱크 중..." : "데이터 싱크"}
      </button>
      {result && (
        <div className="absolute top-full mt-1 right-0 whitespace-nowrap text-[10px] px-2 py-1 rounded bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-lg z-50">
          {result}
        </div>
      )}
    </div>
  );
}
