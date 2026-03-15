"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KPIData, TrendDataPoint, FunnelStep } from "@/lib/types";
import Filters from "@/components/filters";
import KPICards from "@/components/kpi-cards";
import TrendChart from "@/components/trend-chart";
import ChannelChart from "@/components/channel-chart";
import BrandCompareChart from "@/components/brand-compare-chart";
import PageHeader from "@/components/page-header";

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const defaultKPI: KPIData = {
  revenue: 0, revenuePrev: 0, adSpend: 0, adSpendPrev: 0,
  roas: 0, roasPrev: 0, orders: 0, ordersPrev: 0,
  profit: 0, profitPrev: 0, mer: 0, merPrev: 0, aov: 0, aovPrev: 0,
};

interface ChannelData { channel: string; spend: number; roas: number; }

export default function OverviewPage() {
  const dates = getDefaultDates();
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "daily", brand: "all", from: dates.from, to: dates.to,
  });
  const [kpi, setKpi] = useState<KPIData>(defaultKPI);
  const [trend, setTrend] = useState<TrendDataPoint[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [brandRevenue, setBrandRevenue] = useState<{ brand: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period: filters.period, brand: filters.brand,
        from: filters.from, to: filters.to,
      });
      const res = await fetch(`/api/dashboard?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오는데 실패했습니다");
      const data = await res.json();
      setKpi(data.kpi || defaultKPI);
      setTrend(data.trend || []);
      setChannels(data.channels || []);
      setBrandRevenue(data.brandRevenue || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="📊 Overview" subtitle="Executive Summary" />
        <Filters filters={filters} onChange={setFilters} />

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            <KPICards data={kpi} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TrendChart data={trend} />
              <ChannelChart data={channels} />
            </div>
            {brandRevenue.length > 0 && <BrandCompareChart data={brandRevenue} />}
          </>
        )}
      </div>
    </main>
  );
}
