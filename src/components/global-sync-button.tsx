"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function GlobalSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setDone(false);
    try {
      await Promise.all([
        fetch("/api/sync", { method: "POST" }),
        fetch("/api/sync-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      ]);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch {}
    setSyncing(false);
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-sm hover:shadow-md transition-all text-sm text-gray-700 dark:text-zinc-200 disabled:opacity-50"
      title="데이터 싱크"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "싱크 중..." : done ? "✅ 완료" : "싱크"}
    </button>
  );
}
