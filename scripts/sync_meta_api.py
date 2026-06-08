"""Meta(Facebook/Instagram) 광고 insights → daily_ad_spend 직접 수집.

기존 sync_all.py의 sync_meta()는 SHEET_META 시트를 '읽기'만 하는데, 그 시트를
채우던 OpenClaw 크론이 죽어 데이터가 끊김. 이 스크립트는 Meta Graph API에서
일별 insights를 직접 끌어와 DB에 적재 → 시트 의존 제거, 완전 자동.

토큰: 환경변수 META_ADS_TOKEN (System User 토큰 권장; 현재는 User 토큰)
계정: META_{NUTTY,IRONPET,BALANCELAB}_AD_ACCOUNT (없으면 알려진 기본값)
사용: python sync_meta_api.py [since YYYY-MM-DD]  (기본 최근 30일)
"""
import os
import sys
import datetime

import requests
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8")

GRAPH = "https://graph.facebook.com/v19.0"
TOKEN = os.environ.get("META_ADS_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)

ACCOUNTS = {
    "nutty": os.environ.get("META_NUTTY_AD_ACCOUNT", "act_1510647003433200"),
    "ironpet": os.environ.get("META_IRONPET_AD_ACCOUNT", "act_8188388757843816"),
    "balancelab": os.environ.get("META_BALANCELAB_AD_ACCOUNT", "act_276181463299827"),
}

DRY_RUN = os.environ.get("DRY_RUN") == "1"
PURCHASE_TYPES = {"purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"}


def num(v):
    try:
        return float(v)
    except Exception:
        return 0.0


def extract(actions, value=False):
    """actions/action_values 리스트에서 구매 전환 합산"""
    total = 0.0
    for a in actions or []:
        if a.get("action_type") in PURCHASE_TYPES:
            total += num(a.get("value"))
    return total


def fetch_insights(acct, since, until):
    rows, url = [], f"{GRAPH}/{acct}/insights"
    params = {
        "fields": "spend,impressions,clicks,actions,action_values",
        "time_increment": 1,
        "time_range": '{"since":"%s","until":"%s"}' % (since, until),
        "level": "account",
        "access_token": TOKEN,
        "limit": 500,
    }
    while url:
        j = requests.get(url, params=params, timeout=40).json()
        if "error" in j:
            print(f"  ❌ {acct}: {j['error'].get('message')}")
            break
        rows += j.get("data", [])
        url = j.get("paging", {}).get("next")
        params = None
    return rows


def main():
    if not TOKEN:
        print("❌ META_ADS_TOKEN 없음"); sys.exit(1)
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    since = sys.argv[1] if len(sys.argv) > 1 else (
        datetime.datetime.now() - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_rows = []
    for brand, acct in ACCOUNTS.items():
        data = fetch_insights(acct, since, today)
        n = 0
        for d in data:
            date = d.get("date_start")
            if not date:
                continue
            spend = num(d.get("spend"))
            impressions = int(num(d.get("impressions")))
            clicks = int(num(d.get("clicks")))
            conversions = int(extract(d.get("actions")))
            conv_value = extract(d.get("action_values"))
            all_rows.append({
                "date": date, "brand": brand, "channel": "meta",
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "conversions": conversions, "conversion_value": conv_value,
                "roas": conv_value / spend if spend > 0 else 0,
                "ctr": clicks / impressions * 100 if impressions > 0 else 0,
                "cpc": spend / clicks if clicks > 0 else 0,
            })
            n += 1
        print(f"  {brand} ({acct}): {n}일 수집 (총 spend {sum(num(x.get('spend')) for x in data):,.0f})")

    print(f"\n총 {len(all_rows)}행 [{since} ~ {today}]")
    if DRY_RUN:
        for r in all_rows[:6]:
            print("  ", {k: r[k] for k in ("date", "brand", "spend", "clicks", "conversions", "conversion_value")})
        return

    for i in range(0, len(all_rows), 200):
        sb.table("daily_ad_spend").upsert(all_rows[i:i + 200], on_conflict="date,brand,channel").execute()
    print(f"✅ daily_ad_spend meta {len(all_rows)}행 upsert 완료")


if __name__ == "__main__":
    main()
