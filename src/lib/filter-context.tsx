"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { DashboardFilters } from "@/lib/types";

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const defaults = getDefaultDates();
const defaultFilters: DashboardFilters = {
  period: "daily", brand: "all", from: defaults.from, to: defaults.to,
};

const FilterContext = createContext<{
  filters: DashboardFilters;
  setFilters: (f: DashboardFilters) => void;
}>({ filters: defaultFilters, setFilters: () => {} });

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  return (
    <FilterContext.Provider value={{ filters, setFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  return useContext(FilterContext);
}
