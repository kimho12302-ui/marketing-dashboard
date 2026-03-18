"use client";

import { useState, useEffect, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Zap, Info } from "lucide-react";

function getDefaultDates() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface Insight {
  type: "critical" | "warning" | "opportunity" | "info";
  text: string;
  detail?: string;
  actions?: string[];
}

const TYPE_CONFIG = {
  critical: { icon: AlertTriangle, label: "🚨 Critical", border: "border-red-500/30", bg: "bg-red-50 dark:bg-red-900/10", iconColor: "text-red-400", badge: "bg-red-500/20 text-red-400" },
  warning: { icon: AlertCircle, label: "⚠️ Warning", border: "border-yellow-500/30", bg: "bg-yellow-50 dark:bg-yellow-900/10", iconColor: "text-yellow-400", badge: "bg-yellow-500/20 text-yellow-400" },
  opportunity: { icon: Zap, label: "🟢 Opportunity", border: "border-green-500/30", bg: "bg-green-50 dark:bg-green-900/10", iconColor: "text-green-400", badge: "bg-green-500/20 text-green-400" },
  info: { icon: Info, label: "ℹ️ Info", border: "border-blue-500/30", bg: "bg-blue-50 dark:bg-blue-900/10", iconColor: "text-blue-400", badge: "bg-blue-500/20 text-blue-400" },
};

export default function InsightsPage() {
  const { filters } = useFilters();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/insights?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setInsights(data.insights || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filter === "all" ? insights : insights.filter(i => i.type === filter);
  const counts = { critical: 0, warning: 0, opportunity: 0, info: 0 };
  insights.forEach(i => counts[i.type]++);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="💡 Insights" subtitle="실데이터 기반 마케팅 인사이트" />

        {/* Date Range */}
        <div className="flex gap-2 items-center">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-200" />
          <span className="text-gray-400 dark:text-zinc-500">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-200" />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filter === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}>
            전체 ({insights.length})
          </button>
          {(["critical", "warning", "opportunity", "info"] as const).map(type => (
            <button key={type} onClick={() => setFilter(type)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${filter === type ? TYPE_CONFIG[type].badge : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}>
              {TYPE_CONFIG[type].label} ({counts[type]})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-gray-500 dark:text-zinc-500">
              해당 기간에 발견된 인사이트가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((insight, i) => {
              const config = TYPE_CONFIG[insight.type];
              const Icon = config.icon;
              return (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${config.border} ${config.bg}`}>
                  <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-800 dark:text-zinc-200 font-medium">{insight.text}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.badge} uppercase font-medium`}>{insight.type}</span>
                    </div>
                    {insight.detail && <p className="text-xs text-gray-500 dark:text-zinc-500">{insight.detail}</p>}
                    {insight.actions && insight.actions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase">추천 액션</p>
                        {insight.actions.map((action, j) => (
                          <div key={j} className="flex items-start gap-2 text-xs text-gray-600 dark:text-zinc-300">
                            <span className="text-indigo-400 mt-0.5">→</span>
                            <span>{action}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
