"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  BarChart3,
  DollarSign,
  Megaphone,
  Filter,
  Search,
  FileText,
  Lightbulb,
  Package,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: BarChart3, emoji: "📊" },
  { href: "/sales", label: "Sales", icon: DollarSign, emoji: "💰" },
  { href: "/ads", label: "Ads Performance", icon: Megaphone, emoji: "📢" },
  { href: "/funnel", label: "Funnel", icon: Filter, emoji: "🔄" },
  { href: "/keywords", label: "Keywords", icon: Search, emoji: "🔍" },
  { href: "/content", label: "Content", icon: FileText, emoji: "📝" },
  { href: "/insights", label: "Insights", icon: Lightbulb, emoji: "💡" },
  { href: "/monthly", label: "월별 요약", icon: BarChart3, emoji: "📅" },
  { href: "/settings", label: "설정", icon: Settings, emoji: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-56 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex-col hidden md:flex">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200 dark:border-zinc-800">
          <BarChart3 className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-sm font-bold text-gray-900 dark:text-zinc-100">마케팅 대시보드</h1>
            <span className="text-[10px] text-gray-400 dark:text-zinc-500">PPMI</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 font-medium"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800"
                )}
              >
                <span className="text-base">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer with Theme Toggle */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 dark:text-zinc-600">v2.0 — PPMI</span>
          {mounted && (
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-500 dark:text-zinc-400"
              title={theme === "dark" ? "라이트 모드" : "다크 모드"}
            >
              {theme === "dark" ? (
                <span className="text-lg">☀️</span>
              ) : (
                <span className="text-lg">🌙</span>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Nav — show top 4 + more */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 md:hidden">
        <div className="flex">
          {NAV_ITEMS.slice(0, 4).map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                  isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-zinc-500")}>
                <span className="text-base">{item.emoji}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          <div className="flex-1 relative group">
            <button className={cn("w-full flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
              NAV_ITEMS.slice(4).some(i => pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href)))
                ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-zinc-500")}>
              <span className="text-base">⋯</span>
              <span>더보기</span>
            </button>
            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block group-focus-within:block bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px]">
              {NAV_ITEMS.slice(4).map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}
                    className={cn("flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      isActive ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20" : "text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800")}>
                    <span>{item.emoji}</span> {item.label}
                  </Link>
                );
              })}
              {mounted && (
                <button onClick={toggleTheme}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <span>{theme === "dark" ? "☀️" : "🌙"}</span> 테마 변경
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
