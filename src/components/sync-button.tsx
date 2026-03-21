"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function SyncButton({ onComplete }: { onComplete?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("last-sync-result");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const age = Date.now() - parsed.ts;
          if (age < 30 * 60 * 1000) return parsed.msg; // show for 30 min
        } catch {}
      }
    }
    return null;
  });

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      // Run sheet sync + ad sync in parallel
      const [sheetRes, adRes] = await Promise.all([
        fetch("/api/sync", { method: "POST" }).then(r => r.json()).catch(() => ({})),
        fetch("/api/sync-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(r => r.json()).catch(() => ({})),
      ]);

      const parts = [];
      const errors = [];
      if (sheetRes.sales?.sales) parts.push(`매출 ${sheetRes.sales.sales}건`);
      if (sheetRes.funnel?.funnel) parts.push(`퍼널 ${sheetRes.funnel.funnel}건`);
      if (sheetRes.productSales?.productSales) parts.push(`상품 ${sheetRes.productSales.productSales}건`);
      if (adRes.meta?.total) parts.push(`Meta ${adRes.meta.total}건`);
      else if (adRes.meta?.meta) parts.push(`Meta ${adRes.meta.meta}건`);
      if (adRes.google?.total) parts.push(`Google ${adRes.google.total}건`);
      else if (adRes.google?.google) parts.push(`Google ${adRes.google.google}건`);
      if (adRes.funnel?.total) parts.push(`GA4퍼널 ${adRes.funnel.total}건`);
      else if (adRes.funnel?.funnel) parts.push(`GA4퍼널 ${adRes.funnel.sessions || 0}세션`);

      // Collect individual errors
      if (sheetRes.error) errors.push(`시트: ${sheetRes.error}`);
      if (sheetRes.sales?.error) errors.push(`매출: ${sheetRes.sales.error}`);
      if (sheetRes.funnel?.error) errors.push(`퍼널: ${sheetRes.funnel.error}`);
      if (adRes.meta?.error) errors.push(`Meta: ${adRes.meta.error}`);
      if (adRes.google?.error) errors.push(`Google: ${adRes.google.error}`);
      if (adRes.funnel?.error) errors.push(`GA4: ${adRes.funnel.error}`);

      let msg: string;
      if (errors.length > 0) {
        msg = `⚠️ ${parts.join(", ") || "싱크 완료"} | 오류: ${errors.join(", ").slice(0, 100)}`;
      } else {
        msg = `✅ ${parts.join(", ") || "변경 없음"}`;
      }
      setResult(msg);
      try { localStorage.setItem("last-sync-result", JSON.stringify({ msg, ts: Date.now() })); } catch {}
      onComplete?.();
    } catch {
      setResult("❌ 싱크 실패");
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 15000);
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
