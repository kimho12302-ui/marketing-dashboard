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
  // Funnel metrics
  landing_page_views: number;
  add_to_cart: number;
  initiate_checkout: number;
  purchases: number;
  revenue: number;
  roas: number;
  // Calculated
  cac: number; // cost per purchase
  cart_to_purchase_rate: number;
  click_to_cart_rate: number;
}

async function fetchAllPages(initialUrl: string): Promise<any[]> {
  const all: any[] = [];
  let nextUrl: string | null = initialUrl;
  let iterations = 0;
  while (nextUrl && iterations < 10) {
    iterations++;
    const resp: Response = await globalThis.fetch(nextUrl);
    const body = await resp.json();
    if (body.data) all.push(...body.data);
    nextUrl = body.paging?.next || null;
    if (all.length > 500) break;
  }
  return all;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = sp.get("brand") || "all";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

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
      // Fetch ALL ads with creative info (paginated)
      const adsUrl = `https://graph.facebook.com/v19.0/${accountId}/ads?` +
        new URLSearchParams({
          access_token: META_TOKEN,
          fields: "name,status,creative{title,body,thumbnail_url,image_url,video_id,object_story_spec}",
          limit: "200",
        });
      const allAds = await fetchAllPages(adsUrl);

      // Fetch ad-level insights with funnel actions + custom date range
      const insParams: Record<string, string> = {
        access_token: META_TOKEN,
        fields: "ad_id,ad_name,impressions,clicks,spend,ctr,cpc,actions,action_values,cost_per_action_type",
        level: "ad",
        limit: "500",
      };
      if (from && to) {
        insParams.time_range = JSON.stringify({ since: from, until: to });
      } else {
        insParams.date_preset = "last_30d";
      }
      const insightsUrl = `https://graph.facebook.com/v19.0/${accountId}/insights?` +
        new URLSearchParams(insParams);
      const allInsights = await fetchAllPages(insightsUrl);
      
      const insightsMap = new Map<string, any>();
      for (const row of allInsights) {
        insightsMap.set(row.ad_id, row);
      }

      for (const ad of allAds) {
        const cr = ad.creative || {};
        const ins = insightsMap.get(ad.id) || {};
        const spend = Number(ins.spend || 0);

        // Extract funnel actions
        let purchases = 0, revenue = 0, addToCart = 0, initiateCheckout = 0, landingPageViews = 0;
        for (const a of ins.actions || []) {
          if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") purchases = Number(a.value || 0);
          if (a.action_type === "offsite_conversion.fb_pixel_add_to_cart" || a.action_type === "add_to_cart") addToCart = Number(a.value || 0);
          if (a.action_type === "offsite_conversion.fb_pixel_initiate_checkout" || a.action_type === "initiate_checkout") initiateCheckout = Number(a.value || 0);
          if (a.action_type === "landing_page_view") landingPageViews = Number(a.value || 0);
        }
        for (const a of ins.action_values || []) {
          if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") revenue = Number(a.value || 0);
        }

        const clicks = Number(ins.clicks || 0);

        allCreatives.push({
          id: ad.id,
          name: ad.name || "",
          status: ad.status || "UNKNOWN",
          brand: brandName,
          thumbnail_url: cr.thumbnail_url || "",
          image_url: cr.image_url || cr.object_story_spec?.link_data?.picture || "",
          video_id: cr.video_id || "",
          spend,
          impressions: Number(ins.impressions || 0),
          clicks,
          ctr: Number(ins.ctr || 0),
          cpc: Number(ins.cpc || 0),
          landing_page_views: landingPageViews,
          add_to_cart: addToCart,
          initiate_checkout: initiateCheckout,
          purchases,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
          cac: purchases > 0 ? spend / purchases : 0,
          cart_to_purchase_rate: addToCart > 0 ? (purchases / addToCart) * 100 : 0,
          click_to_cart_rate: clicks > 0 ? (addToCart / clicks) * 100 : 0,
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
