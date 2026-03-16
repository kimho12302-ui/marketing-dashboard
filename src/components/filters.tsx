"use client";

import type { Period, Brand, DashboardFilters } from "@/lib/types";

interface FiltersProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "일별" },
  { value: "weekly", label: "주별" },
  { value: "monthly", label: "월별" },
];

const BRAND_OPTIONS: { value: Brand; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "nutty", label: "너티" },
  { value: "ironpet", label: "아이언펫" },
  { value: "balancelab", label: "밸런스랩" },
];

function getDateRange(period: Period) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "daily") {
    // 어제 하루
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: fmt(yesterday), to: fmt(yesterday) };
  } else if (period === "weekly") {
    // 이번 주 (월요일 ~ 오늘)
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return { from: fmt(monday), to: fmt(today) };
  } else {
    // 이번 달
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(firstDay), to: fmt(today) };
  }
}

export default function Filters({ filters, onChange }: FiltersProps) {
  const handlePeriod = (period: Period) => {
    const range = getDateRange(period);
    onChange({ ...filters, period, from: range.from, to: range.to });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Period Toggle */}
      <div className="flex rounded-lg bg-zinc-800 p-0.5">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handlePeriod(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filters.period === opt.value
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Brand Toggle */}
      <div className="flex rounded-lg bg-zinc-800 p-0.5">
        {BRAND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filters, brand: opt.value })}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filters.brand === opt.value
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Date Range */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={filters.from}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-zinc-500">~</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}
