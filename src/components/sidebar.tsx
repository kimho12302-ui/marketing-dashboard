"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/settings", label: "설정", icon: Settings, emoji: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-56 bg-zinc-900 border-r border-zinc-800 flex-col hidden md:flex">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-zinc-800">
          <BarChart3 className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-sm font-bold">마케팅 대시보드</h1>
            <span className="text-[10px] text-zinc-500">PPMI</span>
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
                    ? "bg-indigo-600/20 text-indigo-400 font-medium"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                )}
              >
                <span className="text-base">{item.emoji}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <span className="text-[10px] text-zinc-600">v2.0 — PPMI</span>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-800 flex md:hidden">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                isActive
                  ? "text-indigo-400"
                  : "text-zinc-500"
              )}
            >
              <span className="text-sm">{item.emoji}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
