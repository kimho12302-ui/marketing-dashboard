import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const META_TOKEN = process.env.META_ADS_TOKEN || "";

const META_ACCOUNTS: Record<string, string> = {
  nutty: process.env.META_NUTTY_AD_ACCOUNT || "act_1510647003433200",
  ironpet: process.env.META_IRONPET_AD_ACCOUNT || "act_8188388757843816",
};

async function syncMetaAds(supabase: any, dateStr: string) {
  if (!META_TOKEN) return { meta: 0, error: "no token" };

  const rows: any[] = [];
  for (const [brand, accountId] of Object.entries(META_ACCOUNTS)) {
    try {
      const url = `https://graph.facebook.com/v19.0/${accountId}/insights?` +
        new URLSearchParams({
          access_token: META_TOKEN,
          fields: "spend,impressions,clicks,actions,action_values",
          time_range: JSON.stringify({ since: dateStr, until: dateStr }),
          time_increment: "1",
          level: "account",
        });
      const resp = await globalThis.fetch(url);
      const body = await resp.json();
      
      for (const row of body.data || []) {
        const spend = Number(row.spend || 0);
        const impressions = Number(row.impressions || 0);
        const clicks = Number(row.clicks || 0);
        
        let conversions = 0, conversionValue = 0;
        for (const a of row.actions || []) {
          if (a.action_type === "purchase") conversions = Number(a.value || 0);
        }
        for (const a of row.action_values || []) {
          if (a.action_type === "purchase") conversionValue = Number(a.value || 0);
        }

        rows.push({
          date: row.date_start || dateStr,
          channel: "meta",
          brand,
          spend, impressions, clicks, conversions,
          conversion_value: conversionValue,
          roas: spend > 0 ? conversionValue / spend : 0,
        });
      }
    } catch (e) {
      console.error(`Meta ${brand} error:`, e);
    }
  }

  // No "all" aggregation — brand-level rows only

  if (rows.length > 0) {
    const { error } = await supabase.from("daily_ad_spend").upsert(rows, { onConflict: "date,channel,brand" });
    if (error) return { meta: 0, error: error.message };
  }
  return { meta: rows.length };
}

async function syncGoogleAds(supabase: any, dateStr: string) {
  // Google Ads via Supabase — already synced by cron to sheets
  // For now, use the Google Ads API reporting
  try {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || "";
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || "";
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || "9960719325";
    const devToken = process.env.GOOGLE_ADS_DEV_TOKEN || "";
    if (!refreshToken || !clientId) return { google: 0, error: "Google Ads env vars not set" };

    // Get access token
    const tokenResp = await globalThis.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return { google: 0, error: `no access token: ${JSON.stringify(tokenData).slice(0, 200)}` };

    // Query Google Ads
    const query = `SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date = '${dateStr}'`;
    const gaResp = await globalThis.fetch(
      `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );
    const gaText = await gaResp.text();
    let gaData;
    try { gaData = JSON.parse(gaText); } catch { return { google: 0, error: `Parse error (${gaResp.status}): ${gaText.slice(0, 300)}` }; }
    if (gaData?.error) return { google: 0, error: `API error: ${JSON.stringify(gaData.error).slice(0, 300)}` };

    let totalSpend = 0, totalImp = 0, totalClicks = 0, totalConv = 0, totalConvValue = 0;
    for (const result of gaData[0]?.results || []) {
      const m = result.metrics || {};
      totalSpend += Number(m.costMicros || 0) / 1e6;
      totalImp += Number(m.impressions || 0);
      totalClicks += Number(m.clicks || 0);
      totalConv += Number(m.conversions || 0);
      totalConvValue += Number(m.conversionsValue || 0);
    }

    if (totalSpend > 0) {
      const row = {
        date: dateStr, channel: "google_ads", brand: "nutty",
        spend: Math.round(totalSpend), impressions: totalImp, clicks: totalClicks,
        conversions: Math.round(totalConv), conversion_value: Math.round(totalConvValue),
        roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
      };
      const { error } = await supabase.from("daily_ad_spend").upsert([row], { onConflict: "date,channel,brand" });
      if (error) return { google: 0, error: error.message };
      return { google: 1, spend: Math.round(totalSpend) };
    }
    return { google: 0 };
  } catch (e) {
    console.error("Google Ads error:", e);
    return { google: 0, error: String(e) };
  }
}

async function syncGA4Funnel(supabase: any, dateStr: string) {
  try {
    const saKey = process.env.GOOGLE_SA_KEY;
    if (!saKey) return { funnel: 0, error: "no SA key" };
    const creds = JSON.parse(saKey);

    // Get access token from service account
    const now = Math.floor(Date.now() / 1000);
    const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify({
      iss: creds.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }));

    // Use importKey for RSA signing
    const pemKey = creds.private_key.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\n/g, "");
    const keyData = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signInput = new TextEncoder().encode(`${header}.${payload}`);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signInput);
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const jwt = `${header}.${payload}.${sigB64}`;

    const tokenResp = await globalThis.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) return { funnel: 0, error: `GA4 token failed: ${JSON.stringify(tokenData).slice(0, 200)}` };

    // Query GA4 Data API for funnel events
    const propertyId = "433673281";
    const gaResp = await globalThis.fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateStr, endDate: dateStr }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "sessions" },
            { name: "screenPageViews" },
            { name: "addToCarts" },
            { name: "checkouts" },
            { name: "purchases" },
            { name: "totalRevenue" },
          ],
        }),
      }
    );
    const gaData = await gaResp.json();

    const rows = gaData.rows || [];
    if (rows.length === 0) return { funnel: 0 };

    const r = rows[0];
    const metrics = r.metricValues || [];
    const funnelRow = {
      date: dateStr,
      brand: "cafe24",  // GA4 funnel = cafe24 자사몰 기준
      impressions: Number(metrics[1]?.value || 0), // pageViews as impressions proxy
      sessions: Number(metrics[0]?.value || 0),
      cart_adds: Number(metrics[2]?.value || 0),
      purchases: Number(metrics[4]?.value || 0),
      repurchases: 0,
    };

    const { error } = await supabase.from("daily_funnel").upsert([funnelRow], { onConflict: "date,brand" });
    if (error) return { funnel: 0, error: error.message };
    return { funnel: 1, sessions: funnelRow.sessions, purchases: funnelRow.purchases };
  } catch (e) {
    console.error("GA4 funnel error:", e);
    return { funnel: 0, error: String(e) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Sync last 3 days to catch delayed data
    const dates: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    let totalMeta = 0, totalGoogle = 0, totalFunnel = 0;
    let lastMetaErr: string | undefined, lastGoogleErr: string | undefined, lastFunnelErr: string | undefined;

    for (const dateStr of dates) {
      const [metaResult, googleResult, funnelResult] = await Promise.allSettled([
        syncMetaAds(supabase, dateStr),
        syncGoogleAds(supabase, dateStr),
        syncGA4Funnel(supabase, dateStr),
      ]);
      const mr = metaResult.status === "fulfilled" ? metaResult.value : { meta: 0, error: String(metaResult.reason) };
      const gr = googleResult.status === "fulfilled" ? googleResult.value : { google: 0, error: String(googleResult.reason) };
      const fr = funnelResult.status === "fulfilled" ? funnelResult.value : { funnel: 0, error: String(funnelResult.reason) };
      totalMeta += (mr as any).meta || 0;
      totalGoogle += (gr as any).google || 0;
      totalFunnel += (fr as any).funnel || 0;
      if ((mr as any).error) lastMetaErr = (mr as any).error;
      if ((gr as any).error) lastGoogleErr = (gr as any).error;
      if ((fr as any).error) lastFunnelErr = (fr as any).error;
    }

    return NextResponse.json({
      dates,
      meta: { total: totalMeta, ...(lastMetaErr ? { error: lastMetaErr } : {}) },
      google: { total: totalGoogle, ...(lastGoogleErr ? { error: lastGoogleErr } : {}) },
      funnel: { total: totalFunnel, ...(lastFunnelErr ? { error: lastFunnelErr } : {}) },
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
