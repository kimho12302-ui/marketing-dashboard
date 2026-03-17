import { NextRequest, NextResponse } from "next/server";

const META_TOKEN = process.env.META_ADS_TOKEN || "";
const AD_ACCOUNTS: Record<string, string> = {
  nutty: process.env.META_NUTTY_AD_ACCOUNT || "act_1510647003433200",
  ironpet: process.env.META_IRONPET_AD_ACCOUNT || "act_8188388757843816",
};

interface Creative {
  id: string;
  name: string;
  status: string;
  brand: string;
  thumbnail_url: string;
  image_url: string;
  video_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  roas: number;
  revenue: number;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = sp.get("brand") || "all";
  const datePreset = sp.get("date_preset") || "last_30d";

  if (!META_TOKEN) {
    return NextResponse.json({ creatives: [], error: "META_ADS_TOKEN not configured" });
  }

  try {
    const accounts = brand === "all"
      ? Object.entries(AD_ACCOUNTS)
      : AD_ACCOUNTS[brand]
        ? [[brand, AD_ACCOUNTS[brand]]]
        : [];

    const allCreatives: Creative[] = [];

    for (const [brandName, accountId] of accounts) {
      // Fetch ads with creative info
      const adsUrl = `https://graph.facebook.com/v19.0/${accountId}/ads?` +
        new URLSearchParams({
          access_token: META_TOKEN,
          fields: "name,status,creative{title,body,thumbnail_url,image_url,video_id}",
          limit: "50",
        });

      const adsRes = await fetch(adsUrl);
      const adsData = await adsRes.json();
      if (!adsData.data) continue;

      // Fetch ad-level insights
      const insightsUrl = `https://graph.facebook.com/v19.0/${accountId}/insights?` +
        new URLSearchParams({
          access_token: META_TOKEN,
          fields: "ad_id,ad_name,impressions,clicks,spend,ctr,cpc,actions,action_values",
          level: "ad",
          date_preset: datePreset,
          limit: "100",
        });

      const insRes = await fetch(insightsUrl);
      const insData = await insRes.json();
      const insightsMap = new Map<string, any>();
      for (const row of insData.data || []) {
        insightsMap.set(row.ad_id, row);
      }

      for (const ad of adsData.data) {
        const cr = ad.creative || {};
        const ins = insightsMap.get(ad.id) || {};

        let purchases = 0;
        let revenue = 0;
        for (const a of ins.actions || []) {
          if (a.action_type === "purchase") purchases = Number(a.value || 0);
        }
        for (const a of ins.action_values || []) {
          if (a.action_type === "purchase") revenue = Number(a.value || 0);
        }

        const spend = Number(ins.spend || 0);

        allCreatives.push({
          id: ad.id,
          name: ad.name || "",
          status: ad.status || "UNKNOWN",
          brand: brandName,
          thumbnail_url: cr.thumbnail_url || "",
          image_url: cr.image_url || "",
          video_id: cr.video_id || "",
          spend,
          impressions: Number(ins.impressions || 0),
          clicks: Number(ins.clicks || 0),
          ctr: Number(ins.ctr || 0),
          cpc: Number(ins.cpc || 0),
          purchases,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
        });
      }
    }

    // Sort by spend descending
    allCreatives.sort((a, b) => b.spend - a.spend);

    return NextResponse.json({ creatives: allCreatives });
  } catch (error) {
    console.error("Creatives API error:", error);
    return NextResponse.json({ creatives: [], error: "Failed to fetch creatives" });
  }
}
