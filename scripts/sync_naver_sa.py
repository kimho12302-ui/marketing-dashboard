"""
Naver SA (검색광고 + 쇼핑) API 직접 동기화 + Google Ads 시트 동기화

v2 변경:
  - Naver SA 데이터를 시트 대신 API에서 직접 수집 → rvsAmt(전환매출) 포함
  - API 실패 시 캠페인_성과 시트 fallback (전환매출 없음)

스케줄 권장:
  14:00 KST  →  python sync_naver_sa.py          (기본: D-1 ~ D-3)
  수동 백필   →  python sync_naver_sa.py 2026-04-01 2026-04-08
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import json
import hmac
import hashlib
import base64
import time
import requests
from collections import defaultdict
from datetime import datetime, timedelta

import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

SA_JSON      = os.path.expanduser("~/.naver-searchad/google-service-account.json")
NAVER_CONFIG = os.path.expanduser("~/.naver-searchad/config.json")
SHEET_NAVER  = "1ky1rAsa8draGigQixBRSNMOPIEYH0ygsXiF_mYhDwgo"
SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"


def safe_num(v, d=0):
    if v is None or v == "" or v == "-": return d
    try: return float(str(v).replace(",", "").replace("₩", "").replace("원", "").replace(" ", ""))
    except: return d

def safe_int(v, d=0): return int(safe_num(v, d))

def parse_date(v):
    if not v: return None
    v = str(v).strip()
    for fmt in ["%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"]:
        try: return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def dedup_upsert(sb, table, rows, conflict):
    if not rows:
        print(f"  ⏭ {table}: 데이터 없음")
        return
    fields = [f.strip() for f in conflict.split(",")]
    seen = {}
    for r in rows:
        key = tuple(str(r.get(f, "")) for f in fields)
        seen[key] = r
    rows = list(seen.values())
    for i in range(0, len(rows), 200):
        try:
            sb.table(table).upsert(rows[i:i+200], on_conflict=conflict).execute()
        except Exception as e:
            print(f"  ❌ {table} batch {i}: {e}")
    print(f"  ✅ {table}: {len(rows)}건 upsert")

def brand_from_campaign(campaign: str) -> str:
    c = campaign.lower()
    if "아이언펫" in c: return "ironpet"
    if "너티" in c:     return "nutty"
    if "사입" in c:     return "saip"
    if "밸런스" in campaign or "큐모발" in campaign or "balancelab" in c:
        return "balancelab"
    return "nutty"  # fallback


# ─────────────────────────────────────────────────────────────
# 1. Naver SA API 직접 수집 (전환매출 포함)
# ─────────────────────────────────────────────────────────────
def sync_naver_sa_via_api(sb, start_date: str, end_date: str):
    with open(NAVER_CONFIG, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    API_KEY     = cfg["api_key"]
    API_SECRET  = cfg["api_secret"]
    CUSTOMER_ID = str(cfg["customer_id"])
    BASE_URL    = cfg.get("base_url", "https://api.searchad.naver.com")

    def generate_signature(timestamp, method, uri):
        message = f"{timestamp}.{method}.{uri}"
        sign = hmac.new(API_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
        return base64.b64encode(sign).decode("utf-8")

    def api_get(endpoint, params=None):
        timestamp = str(int(time.time() * 1000))
        signature = generate_signature(timestamp, "GET", endpoint)
        headers = {
            "X-API-KEY":    API_KEY,
            "X-Customer":   CUSTOMER_ID,
            "X-Timestamp":  timestamp,
            "X-Signature":  signature,
            "Content-Type": "application/json",
        }
        r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    campaigns = api_get("/ncc/campaigns")
    print(f"  캠페인 {len(campaigns)}개 조회됨")

    agg = defaultdict(lambda: {
        "spend": 0.0, "impressions": 0, "clicks": 0,
        "conversions": 0, "conversion_value": 0.0
    })

    # 날짜별 루프 (단일 날짜 쿼리만 데이터 반환됨)
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt   = datetime.strptime(end_date,   "%Y-%m-%d")
    days = (end_dt - start_dt).days + 1

    for day_offset in range(days):
        target_date = (start_dt + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        for campaign in campaigns:
            cmp_id   = campaign["nccCampaignId"]
            cmp_name = campaign.get("name", "")
            cmp_type = campaign.get("campaignTp", "")
            brand    = brand_from_campaign(cmp_name)
            channel  = "naver_shopping" if cmp_type == "SHOPPING" else "naver_search"
            try:
                stats_params = {
                    "ids":           [cmp_id],
                    "fields":        '["impCnt","clkCnt","salesAmt","ccnt","convAmt"]',
                    "timeRange":     json.dumps({"since": target_date, "until": target_date}),
                    "timeIncrement": "TIME_INCREMENT_DAILY",
                }
                stats     = api_get("/stats", params=stats_params)
                data_list = stats if isinstance(stats, list) else stats.get("data", [])
                for item in data_list:
                    k = (target_date, brand, channel)
                    agg[k]["spend"]            += float(item.get("salesAmt", 0))
                    agg[k]["impressions"]      += int(item.get("impCnt", 0))
                    agg[k]["clicks"]           += int(item.get("clkCnt", 0))
                    agg[k]["conversions"]      += int(item.get("ccnt", 0))
                    agg[k]["conversion_value"] += float(item.get("convAmt", 0))
            except Exception as e:
                print(f"  ⚠ [{cmp_name} {target_date}]: {e}")
                continue

    upsert_rows = []
    for (d, b, c), v in agg.items():
        upsert_rows.append({
            "date": d, "brand": b, "channel": c,
            "spend":            v["spend"],
            "impressions":      v["impressions"],
            "clicks":           v["clicks"],
            "conversions":      v["conversions"],
            "conversion_value": v["conversion_value"],
            "roas": v["conversion_value"] / v["spend"] if v["spend"] > 0 else 0,
            "ctr":  v["clicks"] / v["impressions"] * 100 if v["impressions"] > 0 else 0,
            "cpc":  v["spend"] / v["clicks"] if v["clicks"] > 0 else 0,
        })
    dedup_upsert(sb, "daily_ad_spend", upsert_rows, "date,brand,channel")


# ─────────────────────────────────────────────────────────────
# 1b. Fallback: 시트에서 Naver SA 읽기 (전환매출 없음)
# ─────────────────────────────────────────────────────────────
def sync_naver_sa_from_sheet(gc, sb, start_date: str, end_date: str):
    print("  (fallback) 캠페인_성과 시트 사용")
    sheet    = gc.open_by_key(SHEET_NAVER)
    ws       = sheet.worksheet("캠페인_성과")
    rows_raw = ws.get_all_values()[1:]

    raw_rows = []
    for row in rows_raw:
        if len(row) < 10: continue
        d = parse_date(row[4])
        if not d or d < start_date or d > end_date: continue
        spend         = safe_num(row[9])
        campaign_name = str(row[2])
        campaign_type = str(row[3])
        brand   = brand_from_campaign(campaign_name)
        channel = ("naver_shopping"
                   if campaign_type.upper() == "SHOPPING" or "쇼핑" in campaign_name
                   else "naver_search")
        raw_rows.append({
            "date": d, "brand": brand, "channel": channel,
            "spend":       spend,
            "impressions": safe_int(row[5]),
            "clicks":      safe_int(row[6]),
            "conversions": safe_int(row[10]),
        })

    agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions": 0})
    for r in raw_rows:
        k = (r["date"], r["brand"], r["channel"])
        for f in ["spend", "impressions", "clicks", "conversions"]:
            agg[k][f] += r[f]

    upsert_rows = []
    for (d, b, c), v in agg.items():
        upsert_rows.append({
            "date": d, "brand": b, "channel": c,
            "spend": v["spend"], "impressions": v["impressions"],
            "clicks": v["clicks"], "conversions": v["conversions"],
            "conversion_value": 0, "roas": 0,
            "ctr": v["clicks"] / v["impressions"] * 100 if v["impressions"] > 0 else 0,
            "cpc": v["spend"] / v["clicks"] if v["clicks"] > 0 else 0,
        })
    dedup_upsert(sb, "daily_ad_spend", upsert_rows, "date,brand,channel")


# ─────────────────────────────────────────────────────────────
# 2. Google Ads – 시트(G_캠페인_성과) 수집
# ─────────────────────────────────────────────────────────────
def sync_google_ads_from_sheet(gc, sb, start_date: str, end_date: str):
    sheet  = gc.open_by_key(SHEET_NAVER)
    ws_g   = sheet.worksheet("G_캠페인_성과")
    g_recs = ws_g.get_all_records()

    g_rows = []
    for r in g_recs:
        d = parse_date(str(r.get("date", "")))
        if not d or d < start_date or d > end_date: continue
        spend = safe_num(r.get("cost", 0))
        if spend == 0: continue
        campaign = str(r.get("campaign", "")).lower()
        if "아이언펫" in campaign or "ironpet" in campaign: brand = "ironpet"
        elif "사입" in campaign: brand = "saip"
        else: brand = "nutty"
        channel = ("google_search"
                   if "search" in campaign and "p-max" not in campaign and "pmax" not in campaign
                   else "google_pmax")
        g_rows.append({
            "date": d, "brand": brand, "channel": channel,
            "spend":            spend,
            "impressions":      safe_int(r.get("impressions", 0)),
            "clicks":           safe_int(r.get("clicks", 0)),
            "conversions":      safe_int(r.get("conversions", 0)),
            "conversion_value": safe_num(r.get("conversion_value", 0)),
        })

    g_agg = defaultdict(lambda: {
        "spend": 0, "impressions": 0, "clicks": 0,
        "conversions": 0, "conversion_value": 0
    })
    for r in g_rows:
        k = (r["date"], r["brand"], r["channel"])
        for f in ["spend", "impressions", "clicks", "conversions", "conversion_value"]:
            g_agg[k][f] += r[f]

    g_upsert = []
    for (d, b, c), v in g_agg.items():
        g_upsert.append({
            "date": d, "brand": b, "channel": c,
            "spend": v["spend"], "impressions": v["impressions"],
            "clicks": v["clicks"], "conversions": v["conversions"],
            "conversion_value": v["conversion_value"],
            "roas": v["conversion_value"] / v["spend"] if v["spend"] > 0 else 0,
            "ctr":  v["clicks"] / v["impressions"] * 100 if v["impressions"] > 0 else 0,
            "cpc":  v["spend"] / v["clicks"] if v["clicks"] > 0 else 0,
        })
    dedup_upsert(sb, "daily_ad_spend", g_upsert, "date,brand,channel")


# ─────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) >= 3:
        start_date, end_date = sys.argv[1], sys.argv[2]
    else:
        yesterday  = datetime.now() - timedelta(days=1)
        end_date   = yesterday.strftime("%Y-%m-%d")
        start_date = (yesterday - timedelta(days=3)).strftime("%Y-%m-%d")

    print(f"📊 Naver SA 싱크  [{start_date} ~ {end_date}]\n")

    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Naver SA
    print("🔹 네이버 SA (API 직접 수집 – 전환매출 포함)")
    try:
        sync_naver_sa_via_api(sb, start_date, end_date)
    except Exception as e:
        print(f"  ❌ API 실패: {e}")
        sync_naver_sa_from_sheet(gc, sb, start_date, end_date)

    # 2. Google Ads
    print("\n🔹 Google Ads G_캠페인_성과")
    try:
        sync_google_ads_from_sheet(gc, sb, start_date, end_date)
    except Exception as e:
        print(f"  ❌ Google Ads: {e}")

    print("\n✅ Naver SA 싱크 완료")


if __name__ == "__main__":
    main()
