"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = !mounted || resolvedTheme === "dark";

  return {
    gridColor: isDark ? "#333" : "#e5e7eb",
    tickColor: isDark ? "#888" : "#6b7280",
    tooltipBg: isDark ? "#18181b" : "#ffffff",
    tooltipBorder: isDark ? "1px solid #333" : "1px solid #e5e7eb",
    labelColor: isDark ? "#aaa" : "#374151",
    legendColor: isDark ? "#aaa" : "#374151",
    axisColor: isDark ? "#888" : "#9ca3af",
    subtleGridColor: isDark ? "#27272a" : "#f3f4f6",
    cardBg: isDark ? "#18181b" : "#ffffff",
    referenceLine: isDark ? "#555" : "#d1d5db",
    tooltipStyle: {
      backgroundColor: isDark ? "#18181b" : "#ffffff",
      border: isDark ? "1px solid #333" : "1px solid #e5e7eb",
      borderRadius: 8,
      color: isDark ? "#e4e4e7" : "#1f2937",
    },
    isDark,
  };
}
