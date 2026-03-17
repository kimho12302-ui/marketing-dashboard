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

type QuickRange = "today" | "yesterday" | "7d" | "30d" | "thisMonth" | "lastMonth";
const QUICK_OPTIONS: { value: QuickRange; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "yesterday", label: "어제" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "thisMonth", label: "이번달" },
  { value: "lastMonth", label: "지난달" },
];

function getQuickRange(range: QuickRange) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (range) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case "7d": {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: fmt(today) };
    }
    case "30d": {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      return { from: fmt(d), to: fmt(today) };
    }
    case "thisMonth": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(first), to: fmt(today) };
    }
    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
  }
}

const BRAND_OPTIONS: { value: Brand; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "nutty", label: "너티" },
  { value: "ironpet", label: "아이언펫" },
  { value: "balancelab", label: "밸런스랩" },
  { value: "saip", label: "사입" },
];

function getDateRange(period: Period) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "daily") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: fmt(yesterday), to: fmt(yesterday) };
  } else if (period === "weekly") {
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return { from: fmt(monday), to: fmt(today) };
  } else {
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
      <div className="flex rounded-lg bg-gray-100 dark:bg-zinc-800 p-0.5">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handlePeriod(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filters.period === opt.value
                ? "bg-indigo-600 text-white"
                : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Brand Toggle */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-zinc-800 p-0.5">
        {BRAND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filters, brand: opt.value })}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filters.brand === opt.value
                ? "bg-indigo-600 text-white"
                : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Quick Range */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-zinc-800 p-0.5">
        {QUICK_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              const range = getQuickRange(opt.value);
              onChange({ ...filters, from: range.from, to: range.to });
            }}
            className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
              filters.from === getQuickRange(opt.value).from && filters.to === getQuickRange(opt.value).to
                ? "bg-emerald-600 text-white"
                : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"
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
          className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-gray-400 dark:text-zinc-500">~</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}
