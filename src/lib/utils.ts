import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKRW(value: number): string {
  return `₩${value.toLocaleString("ko-KR")}`;
}

export function formatCompact(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 1_000_000) return `${(value / 10_000).toFixed(0)}만`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}만`;
  return value.toLocaleString("ko-KR");
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
