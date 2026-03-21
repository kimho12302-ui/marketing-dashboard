"use client";

import { useState, useEffect, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import Filters from "@/components/filters";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const COLORS = ["#6366f1", "#f97316", "#22c55e", "#eab308"];

interface ContentTypeData { content_type: string; posts: number; impressions: number; clicks: number; ctr: number; engagement: number; }
interface FollowerTrend { date: string; followers: number; }

export default function ContentPage() {
  const chart = useChartTheme();
  const { filters, setFilters } = useFilters();
  const [byType, setByType] = useState<ContentTypeData[]>([]);
  const [postsTrend, setPostsTrend] = useState<Record<string, any>[]>([]);
  const [followerTrend, setFollowerTrend] = useState<FollowerTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ brand: filters.brand, from: filters.from, to: filters.to });
      const res = await fetch(`/api/content-v2?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setByType(data.byType || []);
      setPostsTrend(data.postsTrend || []);
      setFollowerTrend(data.followerTrend || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="📝 Content" subtitle="콘텐츠 성과" />
        <Filters filters={filters} onChange={setFilters} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {/* Content Type Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {byType.map((ct) => (
                <Card key={ct.content_type}>
                  <CardHeader>
                    <CardTitle>{ct.content_type}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-zinc-400">발행수</span><span>{ct.posts}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-zinc-400">노출</span><span>{formatCompact(ct.impressions)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-zinc-400">클릭</span><span>{formatCompact(ct.clicks)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-zinc-400">CTR</span><span>{(ct.ctr * 100).toFixed(2)}%</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-zinc-400">참여율</span><span>{(ct.engagement * 100).toFixed(2)}%</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Posts Trend */}
            <Card>
              <CardHeader><CardTitle>발행 수 트렌드</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={postsTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.gridColor} />
                      <XAxis dataKey="date" tick={{ fill: chart.tickColor, fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chart.tickColor, fontSize: 12 }} />
                      <Tooltip contentStyle={chart.tooltipStyle} />
                      <Legend />
                      {byType.map((ct, i) => (
                        <Bar key={ct.content_type} dataKey={ct.content_type} stackId="a" fill={COLORS[i % COLORS.length]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Follower Trend */}
            <Card>
              <CardHeader><CardTitle>팔로워 추이</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={followerTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.gridColor} />
                      <XAxis dataKey="date" tick={{ fill: chart.tickColor, fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: chart.tickColor, fontSize: 12 }} />
                      <Tooltip contentStyle={chart.tooltipStyle} />
                      <Line type="monotone" dataKey="followers" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
