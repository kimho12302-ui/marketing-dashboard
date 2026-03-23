"use client";

import { useState, useEffect } from "react";
import { useFilters } from "@/lib/filter-context";

export interface MarketingEvent {
  id: number;
  date: string;
  brand: string;
  title: string;
  description?: string;
  color: string;
}

export function useEvents() {
  const { filters } = useFilters();
  const [events, setEvents] = useState<MarketingEvent[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.brand && filters.brand !== "all") params.set("brand", filters.brand);
    fetch(`/api/events?${params}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, [filters.from, filters.to, filters.brand]);

  return events;
}

/** Recharts ReferenceLine configs for events */
export function eventReferenceLines(events: MarketingEvent[]) {
  return events.map((e) => ({
    x: e.date,
    stroke: e.color || "#6366f1",
    strokeDasharray: "4 4",
    strokeWidth: 1.5,
    label: {
      value: e.title,
      position: "top" as const,
      fill: e.color || "#6366f1",
      fontSize: 10,
      fontWeight: 600,
    },
  }));
}

/** Small event badge list for below charts */
export function EventBadges({ events }: { events: MarketingEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {events.map((e) => (
        <span
          key={e.id}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
          style={{ borderColor: e.color, color: e.color }}
          title={e.description || e.title}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.color }} />
          {e.date.slice(5)} {e.title}
        </span>
      ))}
    </div>
  );
}
