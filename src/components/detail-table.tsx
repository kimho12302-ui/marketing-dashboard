"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

interface DetailRow {
  date: string;
  channel: string;
  revenue: number;
  orders: number;
  adSpend: number;
  roas: number;
}

interface DetailTableProps {
  data: DetailRow[];
}

type SortKey = keyof DetailRow;

const CHANNEL_LABELS: Record<string, string> = {
  cafe24: "카페24",
  coupang: "쿠팡",
  smartstore: "스마트스토어",
  manual: "수동입력",
  meta: "메타",
  naver_search: "네이버검색",
  naver_shopping: "네이버쇼핑",
  google_search: "구글검색",
  gdn: "GDN",
  gfa: "GFA",
  coupang_ads: "쿠팡광고",
  influencer: "인플루언서",
};

export default function DetailTable({ data }: DetailTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortAsc ? av - bv : bv - av;
    }
    return sortAsc
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const headers: { key: SortKey; label: string }[] = [
    { key: "date", label: "날짜" },
    { key: "channel", label: "채널" },
    { key: "revenue", label: "매출" },
    { key: "orders", label: "주문수" },
    { key: "adSpend", label: "광고비" },
    { key: "roas", label: "ROAS" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>상세 데이터</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                {headers.map((h) => (
                  <th
                    key={h.key}
                    className="text-left py-3 px-2 text-zinc-400 font-medium cursor-pointer hover:text-zinc-200 select-none"
                    onClick={() => toggleSort(h.key)}
                  >
                    <div className="flex items-center gap-1">
                      {h.label}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="py-2.5 px-2 text-zinc-300">{row.date}</td>
                  <td className="py-2.5 px-2 text-zinc-300">
                    {CHANNEL_LABELS[row.channel] || row.channel}
                  </td>
                  <td className="py-2.5 px-2 text-zinc-100 font-medium">
                    {formatKRW(row.revenue)}
                  </td>
                  <td className="py-2.5 px-2 text-zinc-300">
                    {row.orders.toLocaleString()}건
                  </td>
                  <td className="py-2.5 px-2 text-zinc-300">
                    {formatKRW(row.adSpend)}
                  </td>
                  <td className="py-2.5 px-2 text-zinc-100 font-medium">
                    {row.roas.toFixed(2)}x
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length > 50 && (
            <p className="text-xs text-zinc-500 mt-2 text-center">
              상위 50개만 표시 (전체 {data.length}건)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
