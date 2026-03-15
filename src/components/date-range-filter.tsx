"use client";

import type { Period } from "@/lib/types";

interface DateRangeFilterProps {
  period: Period;
  from: string;
  to: string;
  onPeriodChange: (period: Period) => void;
  onFromChange: (from: string) => void;
  onToChange: (to: string) => void;
  showPeriod?: boolean;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "일별" },
  { value: "weekly", label: "주별" },
  { value: "monthly", label: "월별" },
];

export default function DateRangeFilter({
  period,
  from,
  to,
  onPeriodChange,
  onFromChange,
  onToChange,
  showPeriod = true,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {showPeriod && (
        <div className="flex rounded-lg bg-zinc-800 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPeriodChange(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                period === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-zinc-500">~</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}
