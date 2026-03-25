import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface DataSource {
  id: string;
  label: string;
  type: "auto" | "manual" | "mixed";
  latestDate: string | null;
  ok: boolean; // green if data is fresh (within threshold)
  detail?: string;
}

export async function GET() {
  try {
    const today = new Date();
    today.setHours(today.getHours() + 9); // KST
    const todayStr = today.toISOString().slice(0, 10);
    // Yesterday in KST
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const sources: DataSource[] = [];

    // 1. Meta 광고비 (auto - API)
    const { data: metaLatest } = await supabase
      .from("daily_ad_spend")
      .select("date")
      .eq("channel", "meta")
      .order("date", { ascending: false })
      .limit(1);
    const metaDate = metaLatest?.[0]?.date || null;
    sources.push({
      id: "meta_ads",
      label: "Meta 광고비",
      type: "auto",
      latestDate: metaDate,
      ok: metaDate >= yesterdayStr,
    });

    // 2. Google Ads 광고비 (auto - API)
    const { data: googleLatest } = await supabase
      .from("daily_ad_spend")
      .select("date")
      .eq("channel", "google_pmax")
      .order("date", { ascending: false })
      .limit(1);
    const googleDate = googleLatest?.[0]?.date || null;
    sources.push({
      id: "google_pmax",
      label: "Google P-Max 광고비",
      type: "auto",
      latestDate: googleDate,
      ok: googleDate >= yesterdayStr,
    });

    // 3. 네이버 검색광고 (auto - cron → sheet)
    const { data: naverLatest } = await supabase
      .from("daily_ad_spend")
      .select("date")
      .eq("channel", "naver_search")
      .order("date", { ascending: false })
      .limit(1);
    const naverDate = naverLatest?.[0]?.date || null;
    sources.push({
      id: "naver_sa",
      label: "네이버 검색광고",
      type: "auto",
      latestDate: naverDate,
      ok: naverDate >= yesterdayStr,
    });

    // 4. 쿠팡 광고비 (manual - file upload)
    const { data: coupangAdsLatest } = await supabase
      .from("daily_ad_spend")
      .select("date")
      .or("channel.eq.coupang,channel.eq.coupang_ads")
      .order("date", { ascending: false })
      .limit(1);
    const coupangAdsDate = coupangAdsLatest?.[0]?.date || null;
    sources.push({
      id: "coupang_ads",
      label: "쿠팡 광고비",
      type: "manual",
      latestDate: coupangAdsDate,
      ok: coupangAdsDate >= yesterdayStr,
    });

    // 5. GFA 광고비 (manual)
    const { data: gfaLatest } = await supabase
      .from("daily_ad_spend")
      .select("date")
      .eq("channel", "gfa")
      .order("date", { ascending: false })
      .limit(1);
    const gfaDate = gfaLatest?.[0]?.date || null;
    sources.push({
      id: "gfa",
      label: "GFA 광고비",
      type: "manual",
      latestDate: gfaDate,
      ok: gfaDate >= yesterdayStr,
    });

    // 6. 판매실적 (manual - excel upload)
    const { data: salesLatest } = await supabase
      .from("daily_sales")
      .select("date")
      .order("date", { ascending: false })
      .limit(1);
    const salesDate = salesLatest?.[0]?.date || null;
    sources.push({
      id: "sales",
      label: "판매실적",
      type: "manual",
      latestDate: salesDate,
      ok: salesDate >= yesterdayStr,
    });

    // 9. GA4 퍼널 (auto - API)
    const { data: funnelLatest } = await supabase
      .from("daily_funnel")
      .select("date")
      .order("date", { ascending: false })
      .limit(1);
    const funnelDate = funnelLatest?.[0]?.date || null;
    sources.push({
      id: "ga4_funnel",
      label: "GA4 퍼널",
      type: "auto",
      latestDate: funnelDate,
      ok: funnelDate >= yesterdayStr,
    });

    // 10. 쿠팡 퍼널 (manual - file upload)
    const { data: coupangFunnelLatest } = await supabase
      .from("daily_funnel")
      .select("date")
      .eq("brand", "coupang")
      .order("date", { ascending: false })
      .limit(1);
    const coupangFunnelDate = coupangFunnelLatest?.[0]?.date || null;
    sources.push({
      id: "coupang_funnel",
      label: "쿠팡 퍼널",
      type: "manual",
      latestDate: coupangFunnelDate,
      ok: coupangFunnelDate >= yesterdayStr,
    });

    // 건별비용은 매일 발생하지 않으므로 경고 대상에서 제외

    const okCount = sources.filter(s => s.ok).length;

    return NextResponse.json({
      sources,
      summary: { total: sources.length, ok: okCount, stale: sources.length - okCount },
      referenceDate: yesterdayStr,
    });
  } catch (error) {
    console.error("Data status error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
