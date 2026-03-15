"""
Google Sheets → Supabase 동기화 스크립트
Usage: python sync_to_supabase.py [--days 30] [--full]
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Any

import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client, Client

# ── Config ──────────────────────────────────────────────────────────

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
SERVICE_ACCOUNT_JSON = r"C:\Users\김호\.naver-searchad\google-service-account.json"

# Google Sheets IDs
SHEET_SALES = "1YT3_RMO8XJYVxf3i7kzb50cVGPU5fMChhqGCRaa6NTw"
SHEET_META_ADS = "1JaKZBYsAhd7nsDzNZAYRC2bp66-K1Nd0noDr1JzOqBs"
SHEET_NAVER_SA = "1ky1rAsa8draGigQixBRSNMOPIEYH0ygsXiF_mYhDwgo"
SHEET_GA4 = "1iFhY2G9fm4wxDeG8D1mhSzEEmu428GQYcsCHbY2M66c"

# ── Init clients ────────────────────────────────────────────────────

def init_gspread() -> gspread.Client:
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_JSON, scopes=scopes)
    return gspread.authorize(creds)

def init_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Helpers ─────────────────────────────────────────────────────────

def safe_num(val: Any, default: float = 0) -> float:
    """Convert value to number safely."""
    if val is None or val == "" or val == "-":
        return default
    try:
        # Remove commas, currency symbols
        cleaned = str(val).replace(",", "").replace("₩", "").replace("원", "").strip()
        return float(cleaned)
    except (ValueError, TypeError):
        return default

def safe_int(val: Any, default: int = 0) -> int:
    return int(safe_num(val, default))

def parse_date(val: str) -> str | None:
    """Try to parse date string into YYYY-MM-DD format."""
    if not val or val.strip() == "":
        return None
    val = val.strip()
    for fmt in ["%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%m/%d/%Y", "%Y년 %m월 %d일"]:
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None

CONFLICT_KEYS = {
    "daily_sales": "date,brand,channel",
    "daily_ad_spend": "date,brand,channel",
    "daily_funnel": "date,brand",
    "daily_content": "date,brand",
    "manual_monthly": "month,brand,channel,category,metric",
}

def upsert_batch(supabase: Client, table: str, rows: list[dict], batch_size: int = 500):
    """Upsert rows in batches."""
    if not rows:
        print(f"  ⏭ {table}: 데이터 없음")
        return
    
    conflict = CONFLICT_KEYS.get(table, "")
    conflict_fields = [f.strip() for f in conflict.split(",") if f.strip()]
    
    # Deduplicate: keep last occurrence for each unique key
    if conflict_fields:
        seen = {}
        for row in rows:
            key = tuple(row.get(f, "") for f in conflict_fields)
            seen[key] = row
        rows = list(seen.values())
    
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            supabase.table(table).upsert(batch, on_conflict=conflict).execute()
            total += len(batch)
        except Exception as e:
            print(f"  ❌ {table} upsert 오류 (batch {i}): {e}")
    
    print(f"  ✅ {table}: {total}건 upsert 완료")


# ── Sync Functions ──────────────────────────────────────────────────

def sync_cafe24_sales(gc: gspread.Client, sb: Client, min_date: str | None):
    """카페24_일별매출 탭 → daily_sales"""
    print("\n📊 카페24 일별매출 동기화...")
    try:
        sheet = gc.open_by_key(SHEET_SALES)
        ws = sheet.worksheet("카페24_일별매출")
        records = ws.get_all_records()
    except Exception as e:
        print(f"  ❌ 시트 읽기 실패: {e}")
        return

    rows = []
    for rec in records:
        date = parse_date(str(rec.get("날짜", rec.get("date", ""))))
        if not date:
            continue
        if min_date and date < min_date:
            continue

        rows.append({
            "date": date,
            "brand": "nutty",
            "channel": "cafe24",
            "revenue": safe_num(rec.get("매출", rec.get("revenue", rec.get("매출액", 0)))),
            "orders": safe_int(rec.get("주문수", rec.get("orders", rec.get("주문건수", 0)))),
            "avg_order_value": safe_num(rec.get("객단가", rec.get("avg_order_value", 0))),
        })

    upsert_batch(sb, "daily_sales", rows)


def sync_meta_ads(gc: gspread.Client, sb: Client, min_date: str | None):
    """Meta Ads 캠페인 데이터 → daily_ad_spend"""
    print("\n📊 Meta Ads 동기화...")
    try:
        sheet = gc.open_by_key(SHEET_META_ADS)
    except Exception as e:
        print(f"  ❌ 시트 열기 실패: {e}")
        return

    brand_tabs = {
        "너티_campaign_v2": "nutty",
        "아이언펫_campaign_v2": "ironpet",
    }

    rows = []
    for tab_name, brand in brand_tabs.items():
        try:
            ws = sheet.worksheet(tab_name)
            records = ws.get_all_records()
        except Exception as e:
            print(f"  ⚠ {tab_name} 읽기 실패: {e}")
            continue

        for rec in records:
            date = parse_date(str(rec.get("날짜", rec.get("date", rec.get("Day", "")))))
            if not date:
                continue
            if min_date and date < min_date:
                continue

            spend = safe_num(rec.get("지출 금액", rec.get("spend", rec.get("비용", 0))))
            impressions = safe_int(rec.get("노출", rec.get("impressions", 0)))
            clicks = safe_int(rec.get("클릭", rec.get("clicks", rec.get("링크 클릭", 0))))
            conversions = safe_int(rec.get("전환", rec.get("conversions", rec.get("구매", 0))))
            conv_value = safe_num(rec.get("전환값", rec.get("conversion_value", rec.get("구매 전환 값", 0))))

            rows.append({
                "date": date,
                "brand": brand,
                "channel": "meta",
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "conversion_value": conv_value,
                "roas": conv_value / spend if spend > 0 else 0,
                "ctr": (clicks / impressions * 100) if impressions > 0 else 0,
                "cpc": spend / clicks if clicks > 0 else 0,
            })

    upsert_batch(sb, "daily_ad_spend", rows)


def sync_naver_sa(gc: gspread.Client, sb: Client, min_date: str | None):
    """네이버 검색광고 → daily_ad_spend"""
    print("\n📊 네이버 검색광고 동기화...")
    try:
        sheet = gc.open_by_key(SHEET_NAVER_SA)
        worksheets = sheet.worksheets()
    except Exception as e:
        print(f"  ❌ 시트 열기 실패: {e}")
        return

    rows = []
    for ws in worksheets:
        try:
            records = ws.get_all_records()
        except Exception:
            continue

        for rec in records:
            date = parse_date(str(rec.get("날짜", rec.get("date", rec.get("일자", "")))))
            if not date:
                continue
            if min_date and date < min_date:
                continue

            spend = safe_num(rec.get("비용", rec.get("spend", rec.get("광고비", 0))))
            if spend == 0:
                continue

            impressions = safe_int(rec.get("노출수", rec.get("impressions", 0)))
            clicks = safe_int(rec.get("클릭수", rec.get("clicks", 0)))
            conversions = safe_int(rec.get("전환수", rec.get("conversions", 0)))
            conv_value = safe_num(rec.get("전환매출", rec.get("conversion_value", 0)))

            # Determine brand from tab name or content
            brand = "nutty"
            tab_lower = ws.title.lower()
            if "아이언펫" in tab_lower or "ironpet" in tab_lower:
                brand = "ironpet"
            elif "밸런스" in tab_lower or "balance" in tab_lower:
                brand = "balancelab"

            rows.append({
                "date": date,
                "brand": brand,
                "channel": "naver_search",
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "conversion_value": conv_value,
                "roas": conv_value / spend if spend > 0 else 0,
                "ctr": (clicks / impressions * 100) if impressions > 0 else 0,
                "cpc": spend / clicks if clicks > 0 else 0,
            })

    upsert_batch(sb, "daily_ad_spend", rows)


def sync_ga4_funnel(gc: gspread.Client, sb: Client, min_date: str | None):
    """GA4 퍼널 데이터 → daily_funnel"""
    print("\n📊 GA4 퍼널 동기화...")
    try:
        sheet = gc.open_by_key(SHEET_GA4)
        worksheets = sheet.worksheets()
    except Exception as e:
        print(f"  ❌ 시트 열기 실패: {e}")
        return

    rows = []
    for ws in worksheets:
        try:
            records = ws.get_all_records()
        except Exception:
            continue

        for rec in records:
            date = parse_date(str(rec.get("날짜", rec.get("date", rec.get("Date", "")))))
            if not date:
                continue
            if min_date and date < min_date:
                continue

            # Determine brand
            brand = "nutty"
            tab_lower = ws.title.lower()
            if "아이언펫" in tab_lower or "ironpet" in tab_lower:
                brand = "ironpet"
            elif "밸런스" in tab_lower or "balance" in tab_lower:
                brand = "balancelab"

            rows.append({
                "date": date,
                "brand": brand,
                "impressions": safe_int(rec.get("노출", rec.get("impressions", rec.get("페이지뷰", 0)))),
                "sessions": safe_int(rec.get("세션", rec.get("sessions", rec.get("세션수", 0)))),
                "cart_adds": safe_int(rec.get("장바구니", rec.get("cart_adds", rec.get("add_to_cart", 0)))),
                "signups": safe_int(rec.get("가입", rec.get("signups", rec.get("sign_up", 0)))),
                "purchases": safe_int(rec.get("구매", rec.get("purchases", rec.get("purchase", 0)))),
                "repurchases": safe_int(rec.get("재구매", rec.get("repurchases", 0))),
            })

    upsert_batch(sb, "daily_funnel", rows)


# ── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Google Sheets → Supabase 동기화")
    parser.add_argument("--days", type=int, default=30, help="최근 N일 동기화 (기본: 30)")
    parser.add_argument("--full", action="store_true", help="전체 데이터 동기화")
    args = parser.parse_args()

    min_date = None
    if not args.full:
        min_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
        print(f"📅 동기화 범위: {min_date} ~ 오늘")
    else:
        print("📅 전체 데이터 동기화")

    print("🔌 클라이언트 초기화...")
    gc = init_gspread()
    sb = init_supabase()
    print("✅ 초기화 완료")

    # Run all syncs
    sync_cafe24_sales(gc, sb, min_date)
    sync_meta_ads(gc, sb, min_date)
    sync_naver_sa(gc, sb, min_date)
    sync_ga4_funnel(gc, sb, min_date)

    print("\n🎉 동기화 완료!")


if __name__ == "__main__":
    main()
