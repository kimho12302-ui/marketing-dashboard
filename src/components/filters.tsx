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

export default function Filters({ filters, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Period Toggle */}
      <div className="flex rounded-lg bg-zinc-800 p-0.5">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filters, period: opt.value })}
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
