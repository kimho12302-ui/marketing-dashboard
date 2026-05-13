import os
# -*- coding: utf-8 -*-
"""DB → PPMI Data Hub 시트 동기화

탭별 구조:
  [N]Paid  : 너티 광고비 날짜별 집계
  [I]Paid  : 아이언펫 광고비 날짜별 집계
  [사입]Paid: 사입 광고비 날짜별 집계
  [Q]Paid  : 밸런스랩 광고비 날짜별 집계
  Sales    : 브랜드×채널별 매출 날짜별 집계
  Funnel   : 채널별 퍼널 날짜별 집계

사용법:
  python sync_db_to_datahub.py                         # 기본: 최근 90일
  python sync_db_to_datahub.py 2026-01-01 2026-04-06  # 날짜 범위 지정
  python sync_db_to_datahub.py full                    # 전체 히스토리 (2025-07-01~)
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta
from collections import defaultdict

# ── 설정 ────────────────────────────────────────────────────────────────────
SA_JSON       = os.path.expanduser("~/.naver-searchad/google-service-account.json")
DATA_HUB_ID   = "1qkTWrpPxUoNktmquXzjbVhMvZWUX1Mv2izJ06YKEzVM"
SUPABASE_URL  = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
HISTORY_START = "2025-07-01"

# ── 헬퍼 ────────────────────────────────────────────────────────────────────
def connect():
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return gc, sb


def fetch_all(sb, table, from_date, to_date, extra_filters=None):
    """1000행 제한 우회 — 페이지네이션으로 전체 조회"""
    rows, offset = [], 0
    while True:
        q = sb.table(table).select("*").gte("date", from_date).lte("date", to_date)
        if extra_filters:
            for k, v in extra_filters.items():
                q = q.eq(k, v)
        res = q.order("date").range(offset, offset + 999).execute()
        rows.extend(res.data or [])
        if len(res.data or []) < 1000:
            break
        offset += 1000
    return rows


def write_tab(ws, headers, rows_data):
    """시트 초기화 후 헤더+데이터 일괄 기록"""
    ws.clear()
    all_rows = [headers] + rows_data
    ws.update(all_rows, "A1", value_input_option="RAW")
    # 헤더 행 굵게
    ws.format("1:1", {"textFormat": {"bold": True}})
    print(f"  ✅ {len(rows_data)}행 기록")


# ── Paid 탭 ─────────────────────────────────────────────────────────────────
PAID_CONFIGS = {
    "[N]Paid":   {"brand": "nutty",       "channels": ["meta", "naver_search", "naver_shopping", "google_pmax", "coupang_ads", "gfa"]},
    "[I]Paid":   {"brand": "ironpet",     "channels": ["meta", "naver_search", "naver_shopping"]},
    "[사입]Paid": {"brand": "saip",        "channels": ["meta", "naver_search", "naver_shopping", "gfa"]},
    "[Q]Paid":   {"brand": "balancelab",  "channels": ["meta", "naver_search", "naver_shopping"]},
}

CHANNEL_LABELS = {
    "meta":           "메타",
    "naver_search":   "네이버SA",
    "naver_shopping": "네이버쇼핑",
    "google_pmax":    "구글",
    "coupang_ads":    "쿠팡광고",
    "gfa":            "GFA",
}


def build_paid_headers(channels):
    h = ["날짜", "총광고비"]
    for ch in channels:
        lbl = CHANNEL_LABELS.get(ch, ch)
        h += [f"{lbl}_비용", f"{lbl}_노출", f"{lbl}_클릭"]
    return h


def sync_paid(ws, sb, brand, channels, from_date, to_date):
    rows = fetch_all(sb, "daily_ad_spend", from_date, to_date, {"brand": brand})

    by_date = defaultdict(lambda: defaultdict(float))
    for r in rows:
        ch = r["channel"]
        if ch.startswith("ga4_"):          # ga4_* = google_pmax 중복, 제외
            continue
        d = r["date"]
        by_date[d]["total"]          += r["spend"] or 0
        by_date[d][f"{ch}_spend"]    += r["spend"] or 0
        by_date[d][f"{ch}_imp"]      += r["impressions"] or 0
        by_date[d][f"{ch}_click"]    += r["clicks"] or 0

    headers   = build_paid_headers(channels)
    rows_data = []
    for date in sorted(by_date, reverse=True):
        d = by_date[date]
        row = [date, round(d["total"])]
        for ch in channels:
            row += [round(d[f"{ch}_spend"]), int(d[f"{ch}_imp"]), int(d[f"{ch}_click"])]
        rows_data.append(row)

    write_tab(ws, headers, rows_data)


# ── Sales 탭 ─────────────────────────────────────────────────────────────────
SALES_HEADERS = [
    "날짜",
    "너티_합계", "너티_스마트스토어", "너티_카페24", "너티_쿠팡",
    "아이언펫_합계", "아이언펫_스마트스토어", "아이언펫_카페24",
    "사입_합계", "사입_스마트스토어",
    "밸런스랩_합계", "밸런스랩_스마트스토어", "밸런스랩_공구",
    "전체합계",
]

BRAND_CHANNEL_MAP = {
    ("nutty",      "smartstore"): "너티_스마트스토어",
    ("nutty",      "cafe24"):     "너티_카페24",
    ("nutty",      "coupang"):    "너티_쿠팡",
    ("ironpet",    "smartstore"): "아이언펫_스마트스토어",
    ("ironpet",    "cafe24"):     "아이언펫_카페24",
    ("saip",       "smartstore"): "사입_스마트스토어",
    ("balancelab", "smartstore"): "밸런스랩_스마트스토어",
}

BRAND_TOTALS = {
    "nutty":      "너티_합계",
    "ironpet":    "아이언펫_합계",
    "saip":       "사입_합계",
    "balancelab": "밸런스랩_합계",
}


def sync_sales(ws, sb, from_date, to_date):
    # daily_sales
    rows = fetch_all(sb, "daily_sales", from_date, to_date)

    by_date = defaultdict(lambda: defaultdict(float))
    for r in rows:
        brand, ch, rev = r["brand"], r["channel"], r["revenue"] or 0
        d = r["date"]
        key = BRAND_CHANNEL_MAP.get((brand, ch))
        if key:
            by_date[d][key]                        += rev
        tot_key = BRAND_TOTALS.get(brand)
        if tot_key:
            by_date[d][tot_key]                    += rev
        by_date[d]["전체합계"]                      += rev

    # 밸런스랩 공구 (product_sales, channel like '공구%')
    gonggu_rows = fetch_all(sb, "product_sales", from_date, to_date, {"brand": "balancelab"})
    for r in gonggu_rows:
        if str(r.get("channel", "")).startswith("공구"):
            d   = r["date"]
            rev = r["revenue"] or 0
            by_date[d]["밸런스랩_공구"]   += rev
            by_date[d]["밸런스랩_합계"]   += rev
            by_date[d]["전체합계"]         += rev

    col_order = SALES_HEADERS[1:]  # 날짜 제외
    rows_data = []
    for date in sorted(by_date, reverse=True):
        d = by_date[date]
        row = [date] + [round(d.get(c, 0)) for c in col_order]
        rows_data.append(row)

    write_tab(ws, SALES_HEADERS, rows_data)


# ── Funnel 탭 ────────────────────────────────────────────────────────────────
FUNNEL_HEADERS = [
    "날짜",
    "GA4_세션",
    "카페24_장바구니", "카페24_회원가입", "카페24_구매",
    "스마트스토어_세션", "스마트스토어_구매",
    "쿠팡_노출", "쿠팡_세션", "쿠팡_장바구니", "쿠팡_구매",
]


def sync_funnel(ws, sb, from_date, to_date):
    rows = fetch_all(sb, "daily_funnel", from_date, to_date)

    by_date = defaultdict(lambda: defaultdict(float))
    for r in rows:
        d   = r["date"]
        ch  = r.get("channel", "")
        brand = r.get("brand", "all")

        if ch == "cafe24":
            by_date[d]["GA4_세션"]         += r.get("sessions", 0) or 0
            by_date[d]["카페24_장바구니"]   += r.get("cart_adds", 0) or 0
            by_date[d]["카페24_회원가입"]   += r.get("signups", 0) or 0
            by_date[d]["카페24_구매"]       += r.get("purchases", 0) or 0
        elif ch == "smartstore":
            by_date[d]["스마트스토어_세션"] += r.get("sessions", 0) or 0
            by_date[d]["스마트스토어_구매"] += r.get("purchases", 0) or 0
        elif ch == "coupang":
            by_date[d]["쿠팡_노출"]         += r.get("impressions", 0) or 0
            by_date[d]["쿠팡_세션"]         += r.get("sessions", 0) or 0
            by_date[d]["쿠팡_장바구니"]     += r.get("cart_adds", 0) or 0
            by_date[d]["쿠팡_구매"]         += r.get("purchases", 0) or 0

    col_order = FUNNEL_HEADERS[1:]
    rows_data = []
    for date in sorted(by_date, reverse=True):
        d = by_date[date]
        row = [date] + [int(d.get(c, 0)) for c in col_order]
        rows_data.append(row)

    write_tab(ws, FUNNEL_HEADERS, rows_data)


# ── 메인 ────────────────────────────────────────────────────────────────────
def main():
    args = sys.argv[1:]

    if args and args[0] == "full":
        from_date = HISTORY_START
        to_date   = datetime.now().strftime("%Y-%m-%d")
    elif len(args) >= 2:
        from_date, to_date = args[0], args[1]
    else:
        to_date   = datetime.now().strftime("%Y-%m-%d")
        from_date = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

    print(f"📊 DB → Data Hub 동기화  [{from_date} ~ {to_date}]\n")

    gc, sb = connect()
    hub    = gc.open_by_key(DATA_HUB_ID)

    # Paid 탭
    for tab_name, cfg in PAID_CONFIGS.items():
        print(f"🔹 {tab_name}")
        try:
            ws = hub.worksheet(tab_name)
            sync_paid(ws, sb, cfg["brand"], cfg["channels"], from_date, to_date)
        except Exception as e:
            print(f"  ❌ {e}")

    # Sales 탭
    print("🔹 Sales")
    try:
        ws = hub.worksheet("Sales")
        sync_sales(ws, sb, from_date, to_date)
    except Exception as e:
        print(f"  ❌ {e}")

    # Funnel 탭
    print("🔹 Funnel")
    try:
        ws = hub.worksheet("Funnel")
        sync_funnel(ws, sb, from_date, to_date)
    except Exception as e:
        print(f"  ❌ {e}")

    print("\n✅ 완료")


if __name__ == "__main__":
    main()
