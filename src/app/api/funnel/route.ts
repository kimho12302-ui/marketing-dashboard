import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const brand = (searchParams.get("brand") || "all") as Brand;
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  try {
    // Brand → ad channels mapping (for impressions from daily_ad_spend)
    const brandAdChannels: Record<string, string[] | null> = {
      nutty: null,    // null = filter by brand in ad_spend
      ironpet: null,
      saip: null,
      balancelab: null,
    };

    // Brand → funnel channels mapping (for sessions/cart from daily_funnel)
    const brandFunnelChannels: Record<string, string[]> = {
      nutty: ["cafe24", "smartstore", "coupang"],
      ironpet: ["cafe24", "smartstore"],
      saip: ["cafe24", "smartstore"],
      balancelab: [], // no GA4 funnel data — sessions come from manual input
    };

    // ── 1. Impressions from daily_ad_spend ──
    let adQuery = supabase
      .from("daily_ad_spend")
      .select("date, brand, channel, impressions, clicks")
      .gte("date", from)
      .lte("date", to);
    if (brand !== "all") {
      adQuery = adQuery.eq("brand", brand);
    }
    const { data: adData } = await adQuery;
    const adRows = adData || [];

    // ── 2. Sessions/cart from daily_funnel ──
    let funnelQuery = supabase
      .from("daily_funnel")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .neq("brand", "all")
      .order("date", { ascending: true });
    const { data: funnelData } = await funnelQuery;
    const allFunnelRows = funnelData || [];

    // Filter funnel rows by brand
    let funnelRows = allFunnelRows;
    if (brand !== "all" && brandFunnelChannels[brand]) {
      const channels = brandFunnelChannels[brand];
      if (channels.length > 0) {
        funnelRows = allFunnelRows.filter((r) => channels.includes(r.brand));
      } else {
        funnelRows = []; // balancelab: no GA4 funnel
      }
    }

    // ── 3. Purchases from daily_sales ──
    let salesQuery = supabase
      .from("daily_sales")
      .select("date, brand, channel, orders, revenue")
      .gte("date", from)
      .lte("date", to);
    if (brand !== "all") {
      salesQuery = salesQuery.eq("brand", brand);
    }
    const { data: salesData } = await salesQuery;
    const salesRows = salesData || [];

    // ── Aggregate by date ──
    const dateMap = new Map<string, {
      impressions: number; clicks: number; sessions: number;
      cart_adds: number; purchases: number; orders: number; repurchases: number;
      // channel breakdown
      imp_meta: number; imp_naver: number; imp_google: number; imp_coupang: number;
      sess_smartstore: number; sess_cafe24: number; sess_coupang: number;
      purch_smartstore: number; purch_cafe24: number; purch_coupang: number;
    }>();

    const getDay = (date: string) => {
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          impressions: 0, clicks: 0, sessions: 0, cart_adds: 0,
          purchases: 0, orders: 0, repurchases: 0,
          imp_meta: 0, imp_naver: 0, imp_google: 0, imp_coupang: 0,
          sess_smartstore: 0, sess_cafe24: 0, sess_coupang: 0,
          purch_smartstore: 0, purch_cafe24: 0, purch_coupang: 0,
        });
      }
      return dateMap.get(date)!;
    };

    // Impressions from ads
    for (const r of adRows) {
      const d = getDay(r.date);
      const imp = Number(r.impressions) || 0;
      d.impressions += imp;
      d.clicks += Number(r.clicks) || 0;
      if (r.channel === "meta") d.imp_meta += imp;
      else if (r.channel.startsWith("naver")) d.imp_naver += imp;
      else if (r.channel === "google_ads") d.imp_google += imp;
      else if (r.channel.startsWith("coupang")) d.imp_coupang += imp;
    }

    // Sessions/cart from funnel
    for (const r of funnelRows) {
      const d = getDay(r.date);
      const sess = Number(r.sessions) || 0;
      d.sessions += sess;
      d.cart_adds += Number(r.cart_adds) || 0;
      d.repurchases += Number(r.repurchases) || 0;
      // Channel breakdown
      if (r.brand === "smartstore") d.sess_smartstore += sess;
      else if (r.brand === "cafe24") d.sess_cafe24 += sess;
      else if (r.brand === "coupang") d.sess_coupang += sess;
    }

    // Purchases from sales (orders count)
    for (const r of salesRows) {
      const d = getDay(r.date);
      const orders = Number(r.orders) || 0;
      d.orders += orders;
      // Map sales channel to funnel channel
      const ch = r.channel || "";
      if (ch.includes("smartstore") || ch.includes("공구")) d.purch_smartstore += orders;
      else if (ch === "cafe24") d.purch_cafe24 += orders;
      else if (ch === "coupang") d.purch_coupang += orders;
      else d.purch_smartstore += orders; // default
    }

    // Use max(funnel purchases, sales orders) for purchase count
    // Because funnel may have its own purchase data
    const dates = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b));

    // Totals
    const totals = { impressions: 0, clicks: 0, sessions: 0, cart_adds: 0, purchases: 0, repurchases: 0 };
    for (const [, d] of dates) {
      totals.impressions += d.impressions;
      totals.clicks += d.clicks;
      totals.sessions += d.sessions;
      totals.cart_adds += d.cart_adds;
      // Use funnel purchases if available, otherwise sales orders
      const funnelPurch = d.purch_smartstore + d.purch_cafe24 + d.purch_coupang;
      totals.purchases += Math.max(funnelPurch, d.orders);
      totals.repurchases += d.repurchases;
    }

    // If no sessions from funnel but we have clicks, use clicks as proxy for sessions
    if (totals.sessions === 0 && totals.clicks > 0) {
      totals.sessions = totals.clicks;
      for (const [, d] of dates) {
        d.sessions = d.clicks;
      }
    }

    // 5-step funnel
    const funnel = [
      { name: "노출", value: totals.impressions },
      { name: "유입", value: totals.sessions,
        rate: totals.impressions > 0 ? (totals.sessions / totals.impressions) * 100 : 0 },
      { name: "장바구니", value: totals.cart_adds,
        rate: totals.sessions > 0 ? (totals.cart_adds / totals.sessions) * 100 : 0 },
      { name: "구매", value: totals.purchases,
        rate: totals.cart_adds > 0 ? (totals.purchases / totals.cart_adds) * 100 : 0 },
      { name: "재구매", value: totals.repurchases,
        rate: totals.purchases > 0 ? (totals.repurchases / totals.purchases) * 100 : 0 },
    ];

    // Daily trend with channel breakdown
    const trend = dates.map(([date, d]) => ({
      date,
      sessions: d.sessions,
      cart_adds: d.cart_adds,
      purchases: Math.max(d.purch_smartstore + d.purch_cafe24 + d.purch_coupang, d.orders),
      impressions: d.impressions,
      // Channel breakdowns
      sessions_smartstore: d.sess_smartstore,
      sessions_cafe24: d.sess_cafe24,
      sessions_coupang: d.sess_coupang,
      purchases_smartstore: d.purch_smartstore,
      purchases_cafe24: d.purch_cafe24,
      purchases_coupang: d.purch_coupang,
      imp_meta: d.imp_meta,
      imp_naver: d.imp_naver,
      imp_google: d.imp_google,
      imp_coupang: d.imp_coupang,
    }));

    // Channel-level funnel summaries (from original funnel data)
    const channelMap = new Map<string, { sessions: number; cart_adds: number; purchases: number; repurchases: number }>();
    for (const r of allFunnelRows) {
      const ch = r.brand;
      const existing = channelMap.get(ch) || { sessions: 0, cart_adds: 0, purchases: 0, repurchases: 0 };
      existing.sessions += Number(r.sessions);
      existing.cart_adds += Number(r.cart_adds);
      existing.purchases += Number(r.purchases);
      existing.repurchases += Number(r.repurchases);
      channelMap.set(ch, existing);
    }
    const channelLabels: Record<string, string> = { cafe24: "카페24", smartstore: "스마트스토어", coupang: "쿠팡" };
    const channelFunnel = Array.from(channelMap.entries()).map(([ch, d]) => ({
      channel: channelLabels[ch] || ch,
      sessions: d.sessions,
      cart_adds: d.cart_adds,
      purchases: d.purchases,
      repurchases: d.repurchases,
      convRate: d.sessions > 0 ? (d.purchases / d.sessions * 100) : 0,
    }));

    return NextResponse.json({ funnel, trend, channelFunnel });
  } catch (error) {
    console.error("Funnel API error:", error);
    return NextResponse.json({ error: "Failed to fetch funnel data" }, { status: 500 });
  }
}
