"""Google Ads API → daily_ad_spend 직접 수집.

기존 sync_all.py의 sync_google()은 "G_캠페인_성과" 시트 탭을 '읽기'만 하는데,
그 시트를 채우던 export가 2026-05-14에 죽어 그 이후가 비어 있음.
(실제 집행도 같은 날 0이 됐지만, 광고를 재개하면 시트가 안 살아나므로
 대시보드가 계속 "집행 0"이라고 조용히 거짓 보고하는 구조였음.)

이 스크립트는 Google Ads API에서 일별 캠페인 실적을 직접 끌어와 DB에 적재한다.
→ 시트 의존 제거, 광고 재개 시 자동 복구.

인증: GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET
      GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_ADS_DEV_TOKEN
계정: listAccessibleCustomers로 자동 발견, 매니저(MCC) 계정은 지표 조회 불가라 제외.
사용: python sync_google_ads_api.py [START] [END]   (기본 최근 30일 ~ 오늘)

하트비트 원칙: API 호출이 성공하면 수집행이 0이어도 ok=True("집행 0"),
API 호출 자체가 실패하면 ok=False("연결 끊김"). 메타와 달리 0행이 정상일 수 있다.
"""
import datetime
import os
import sys
from collections import defaultdict

import requests
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8")

API_VERSION = "v21"
ADS = f"https://googleads.googleapis.com/{API_VERSION}"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)

DRY_RUN = os.environ.get("DRY_RUN") == "1"


def env(name):
    return os.environ.get(name, "").strip()


def brand_from_campaign(campaign):
    """캠페인명 → 브랜드. sync_all.py sync_google()의 기존 분류 규칙과 동일하게 유지."""
    c = (campaign or "").lower()
    if "아이언펫" in c or "ironpet" in c:
        return "ironpet"
    if "사입" in c:
        return "saip"
    return "nutty"


def channel_from_campaign(campaign):
    c = (campaign or "").lower()
    if "search" in c and "p-max" not in c and "pmax" not in c:
        return "google_search"
    return "google_pmax"


def get_access_token():
    res = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": env("GOOGLE_ADS_CLIENT_ID"),
            "client_secret": env("GOOGLE_ADS_CLIENT_SECRET"),
            "refresh_token": env("GOOGLE_ADS_REFRESH_TOKEN"),
            "grant_type": "refresh_token",
        },
        timeout=40,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def headers(access_token, customer_id):
    return {
        "Authorization": f"Bearer {access_token}",
        "developer-token": env("GOOGLE_ADS_DEV_TOKEN"),
        "login-customer-id": customer_id,
        "Content-Type": "application/json",
    }


def search(access_token, customer_id, query):
    """googleAds:searchStream — 페이지네이션 없이 전체 결과를 한 번에 받는다."""
    res = requests.post(
        f"{ADS}/customers/{customer_id}/googleAds:searchStream",
        json={"query": query},
        headers=headers(access_token, customer_id),
        timeout=120,
    )
    if res.status_code != 200:
        raise RuntimeError(f"customer {customer_id}: HTTP {res.status_code} {res.text[:300]}")
    out = []
    for batch in res.json():
        out += batch.get("results", [])
    return out


def list_operating_customers(access_token):
    """접근 가능 계정 중 매니저(MCC)를 제외한 실제 광고 계정만 반환."""
    res = requests.get(
        f"{ADS}/customers:listAccessibleCustomers",
        headers={
            "Authorization": f"Bearer {access_token}",
            "developer-token": env("GOOGLE_ADS_DEV_TOKEN"),
        },
        timeout=40,
    )
    res.raise_for_status()
    ids = [r.split("/")[-1] for r in res.json().get("resourceNames", [])]

    operating = []
    for cid in ids:
        try:
            rows = search(access_token, cid,
                          "SELECT customer.id, customer.manager, customer.descriptive_name FROM customer")
        except Exception as e:
            print(f"  ⚠ {cid} 정보 조회 실패(건너뜀): {e}")
            continue
        if not rows:
            continue
        cust = rows[0].get("customer", {})
        name = cust.get("descriptiveName", "")
        if cust.get("manager"):
            print(f"  · {cid} {name} = 매니저(MCC) → 지표 조회 제외")
        else:
            print(f"  · {cid} {name} = 광고 계정")
            operating.append(cid)
    return operating


def main():
    missing = [k for k in ("GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET",
                           "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_DEV_TOKEN") if not env(k)]
    if missing:
        print(f"❌ 환경변수 없음: {', '.join(missing)}")
        sys.exit(1)

    today = datetime.date.today()
    start = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else str(today - datetime.timedelta(days=30))
    end = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else str(today)

    print(f"📊 Google Ads API 수집 [{start} ~ {end}]")

    try:
        token = get_access_token()
        customers = list_operating_customers(token)
    except Exception as e:
        print(f"❌ 인증/계정조회 실패: {e}")
        _heartbeat(ok=False, rows=0, note=f"auth/list failed: {e}"[:400])
        sys.exit(1)

    if not customers:
        print("❌ 조회 가능한 광고 계정 없음")
        _heartbeat(ok=False, rows=0, note="no operating customers")
        sys.exit(1)

    gaql = (
        "SELECT segments.date, campaign.name, metrics.cost_micros, metrics.impressions, "
        "metrics.clicks, metrics.conversions, metrics.conversions_value "
        f"FROM campaign WHERE segments.date BETWEEN '{start}' AND '{end}' "
        "AND metrics.cost_micros > 0"
    )

    agg = defaultdict(lambda: {"spend": 0.0, "impressions": 0, "clicks": 0,
                               "conversions": 0.0, "conversion_value": 0.0})
    failures = []
    for cid in customers:
        try:
            rows = search(token, cid, gaql)
        except Exception as e:
            print(f"  ❌ {cid} 조회 실패: {e}")
            failures.append(cid)
            continue
        spent = 0.0
        for r in rows:
            date = r["segments"]["date"]
            campaign = r.get("campaign", {}).get("name", "")
            m = r.get("metrics", {})
            cost = int(m.get("costMicros", 0)) / 1_000_000
            key = (date, brand_from_campaign(campaign), channel_from_campaign(campaign))
            agg[key]["spend"] += cost
            agg[key]["impressions"] += int(m.get("impressions", 0))
            agg[key]["clicks"] += int(m.get("clicks", 0))
            agg[key]["conversions"] += float(m.get("conversions", 0))
            agg[key]["conversion_value"] += float(m.get("conversionsValue", 0))
            spent += cost
        print(f"  {cid}: {len(rows)}행, spend {spent:,.0f}원")

    # 계정 전부 조회 실패 = 연결 끊김. 일부만 실패해도 정직하게 실패 처리.
    if failures:
        _heartbeat(ok=False, rows=0, note=f"query failed for: {', '.join(failures)}")
        print(f"❌ {len(failures)}개 계정 조회 실패 → 하트비트 ok=False")
        sys.exit(1)

    out = []
    for (date, brand, channel), v in agg.items():
        out.append({
            "date": date, "brand": brand, "channel": channel,
            "spend": v["spend"], "impressions": v["impressions"], "clicks": v["clicks"],
            "conversions": int(v["conversions"]), "conversion_value": v["conversion_value"],
            "roas": v["conversion_value"] / v["spend"] if v["spend"] > 0 else 0,
            "ctr": v["clicks"] / v["impressions"] * 100 if v["impressions"] > 0 else 0,
            "cpc": v["spend"] / v["clicks"] if v["clicks"] > 0 else 0,
        })
    out.sort(key=lambda r: (r["date"], r["brand"], r["channel"]))

    print(f"\n총 {len(out)}행 집계")
    if DRY_RUN:
        for r in out[:10]:
            print("  ", {k: r[k] for k in ("date", "brand", "channel", "spend", "clicks", "conversions")})
        print("[DRY-RUN] DB 미반영")
        return

    if out:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        for i in range(0, len(out), 200):
            sb.table("daily_ad_spend").upsert(out[i:i + 200], on_conflict="date,brand,channel").execute()
        print(f"✅ daily_ad_spend google {len(out)}행 upsert 완료")
    else:
        # API는 정상 응답했는데 지출이 없음 = 집행 0. 실패가 아니다.
        print("ℹ️ 기간 내 집행 0원 (API 정상) → 하트비트 ok=True, rows=0")

    _heartbeat(ok=True, rows=len(out), latest_date=max((r["date"] for r in out), default=None))


def _heartbeat(ok, rows, latest_date=None, note=""):
    try:
        from heartbeat import record as hb
        hb("google_ads", ok=ok, rows=rows, latest_date=latest_date, note=note)
    except Exception:
        pass


if __name__ == "__main__":
    main()
