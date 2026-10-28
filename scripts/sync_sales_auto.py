import os
# -*- coding: utf-8 -*-
"""Sales 시트 → DB(product_sales) 자동 동기화 (최근 7일)

묶음 키 (2026-10-28 수정)
-------------------------
(date, brand, channel, product, lineup). DB 유니크 키·rebuild_sales_full.py·업로드 폼과 같다.

예전에는 (date, brand, channel, product) 로만 묶고 lineup 은 첫 줄 값을 썼다. 그래서 같은 날
같은 상품의 공구 주문(lineup=셀러)과 자체 주문(lineup 빈칸)이 한 행으로 합쳐져 공구 행이 되고,
자체 매출이 공구로 잡혔다(2026-07-08 아하맘 등 7건, 2026-01-19 뉴트리션 공구+자체 한 행).

lineup 정하는 규칙 (밸런스랩 공구/자체 구분):
- 시트 F열(라인업)에 값이 있으면 그 값.
- F열이 비고 E열(브랜드명)이 「공동구매」인 밸런스랩 줄은 공구 일정표(DB bl_gonggu_schedule)에서
  그날 걸린 셀러 이름. 겹치면 '·' 로 잇고, 일정에 없거나 표를 못 읽으면 '기타'.
- 그 외(자체판매 등)는 빈 문자열.
대시보드는 lineup 이 비어 있지 않으면 공구로 본다(ppmi-dashboard-v2 isGonggu).

사용
----
    python scripts/sync_sales_auto.py                                   # 최근 7일, DB 씀
    python scripts/sync_sales_auto.py --dry-run                         # 최근 7일, DB 대조만
    python scripts/sync_sales_auto.py --dry-run --from 2026-06-01 --to 2026-10-31
--from/--to 는 --dry-run 과만 쓴다(넓은 범위 쓰기는 rebuild_sales_full.py 몫이다).
"""
import sys
import argparse
import re
from collections import defaultdict
from datetime import datetime, timedelta

import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

WINDOW_DAYS = 7
GONGGU_LABEL = "공동구매"
UNKNOWN_SELLER = "기타"
SELLER_JOIN = "·"
SCHEDULE_TABLE = "bl_gonggu_schedule"
DB_PAGE = 1000


def parse_date(col_a, col_b):
    """연+월은 A열('26년7월')에서, 일은 B열('1일 (수)')에서 → '2026-07-01'.
    연도를 하드코딩하지 않으므로 12월/연말 데이터도 정확히 분류된다."""
    if not col_a or not col_b: return None
    ma = re.match(r"(\d{2})년\s*(\d{1,2})월", str(col_a).strip())
    if not ma: return None
    year = 2000 + int(ma.group(1)); month = int(ma.group(2))
    try:
        parts = str(col_b).split()
        day = int(parts[1].replace("일", ""))
    except:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"

def clean_revenue(rev_str):
    if not rev_str: return 0
    return int(str(rev_str).replace(",", "").replace("원", "").strip())

def map_brand(brand_str, category_str=None):
    """시트 카테고리·브랜드명 → DB brand. rebuild_sales_full.map_brand_full 과 같은 규칙.

    2026-10-28: '하루가꿈' 과 '그 외 브랜드는 사입' 갈래를 맞췄다. 없으면 새 사입 브랜드
    (오리젠·나우 등)가 brand='unknown' 으로 들어간다(6~10월 27행).
    """
    brand_lower = str(brand_str).lower()
    category_lower = str(category_str or '').lower()
    combined = f"{category_lower} {brand_lower}"
    if "너티" in combined or "nutty" in combined:
        return "nutty"
    elif "아이언펫" in combined or "ironpet" in combined:
        return "ironpet"
    elif "파미나" in combined or "닥터레이" in combined or "테라카니스" in combined or "고네이티브" in combined:
        return "saip"
    elif any(k in combined for k in ("밸런스랩", "자체판매", "공동구매", "큐모발", "하루가꿈")):
        return "balancelab"
    elif str(brand_str or "").strip():
        return "saip"
    return "unknown"

def map_channel(channel_str):
    ch = str(channel_str).lower()
    if "스마트" in ch:
        return "smartstore"
    elif "cafe24" in ch or "카페24" in ch:
        return "cafe24"
    elif "쿠팡" in ch:
        return "coupang"
    # 대시보드 채널 코드(ppmi-dashboard-v2 src/lib/types.ts CHANNEL_LABELS)로 맞춘다.
    # 시트의 한글 이름을 그대로 넣으면 채널 차트에서 별도 항목으로 갈라진다(2026-09-18 너티 재빌드 42행).
    minor = {"에이블리": "ably", "펫프렌즈": "petfriends", "피피": "pp", "페오펫": "other"}
    for kor, code in minor.items():
        if kor in ch:
            return code
    return ch


def _to_int(text):
    return int(text) if str(text).isdigit() else 0


# ── 공구 셀러 이름 ─────────────────────────────────────────────

def load_gonggu_schedule(sb):
    """DB 공구 일정표 → [{seller, start_on, end_on}]. 표가 없거나 못 읽으면 빈 목록(→ '기타')."""
    try:
        data = sb.table(SCHEDULE_TABLE).select("seller,start_on,end_on").execute().data or []
    except Exception as e:  # 표 생성 전(PGRST205) 등
        print(f"⚠️ 공구 일정표({SCHEDULE_TABLE})를 못 읽음, 셀러 이름이 빈 공동구매 줄은 '{UNKNOWN_SELLER}': {str(e)[:160]}")
        return []
    return sorted(
        ({"seller": r["seller"], "start_on": str(r["start_on"])[:10], "end_on": str(r["end_on"])[:10]} for r in data),
        key=lambda w: (w["start_on"], w["seller"]),
    )


def seller_for(date, schedule):
    """그날 걸린 공구 셀러. 여럿이면 '·' 로 잇고, 없으면 '기타'."""
    hits = [w["seller"] for w in schedule if w["start_on"] <= date <= w["end_on"]]
    return SELLER_JOIN.join(hits) if hits else UNKNOWN_SELLER


def resolve_lineup(date, brand, brand_label, lineup_cell, schedule):
    """DB lineup 값. 공구면 셀러 이름(비지 않음), 자체면 빈 문자열."""
    lineup = str(lineup_cell or "").strip()
    if lineup:
        return lineup
    if brand == "balancelab" and str(brand_label or "").strip() == GONGGU_LABEL:
        return seller_for(date, schedule)
    return ""


# ── 시트 → DB 행 ───────────────────────────────────────────────

def build_rows(sales_rows, dates, schedule):
    """시트 원본 줄 → product_sales 행 목록. dates 는 대상 날짜 집합('YYYY-MM-DD')."""
    grouped = {}
    for row in sales_rows:
        if len(row) < 11: continue

        date = parse_date(row[0], row[1])  # A열(연+월) + B열(일)
        if not date or date not in dates: continue

        revenue = clean_revenue(row[9])
        if revenue == 0: continue

        category = row[3]
        brand = map_brand(row[4], category)
        channel = map_channel(row[2])
        product = row[6]
        lineup = resolve_lineup(date, brand, row[4], row[5], schedule)

        key = (date, brand, channel, product, lineup)
        cur = grouped.get(key) or {"revenue": 0, "quantity": 0, "buyers": 0, "category": category}
        grouped[key] = {
            "revenue": cur["revenue"] + revenue,
            "quantity": cur["quantity"] + _to_int(row[7]),
            "buyers": cur["buyers"] + _to_int(row[8]),
            "category": cur["category"] or category,
        }

    rows = []
    for (date, brand, channel, product, lineup), d in grouped.items():
        rows.append({
            "date": date,
            "brand": brand,
            "product": product,
            "revenue": d["revenue"],
            "channel": channel,
            "lineup": lineup,
            "quantity": d["quantity"],
            "category": d["category"],
            "buyers": d["buyers"],
            "avg_price": d["revenue"] // d["buyers"] if d["buyers"] > 0 else d["revenue"],
        })
    return rows


def is_gonggu(row):
    """대시보드 isGonggu 와 같은 규칙: lineup 이 있거나 판매처가 '공구' 로 시작."""
    return bool(row.get("lineup")) or str(row.get("channel") or "").startswith("공구")


def row_key(row):
    return (str(row["date"])[:10], row["brand"], row["channel"], row["product"] or "", row.get("lineup") or "")


# ── 실행 ───────────────────────────────────────────────────────

def date_range(start, end):
    d0, d1 = datetime.strptime(start, "%Y-%m-%d"), datetime.strptime(end, "%Y-%m-%d")
    return [(d0 + timedelta(days=i)).strftime("%Y-%m-%d") for i in range((d1 - d0).days + 1)]


def read_sheet_rows():
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets.readonly'
    ])
    gc = gspread.authorize(creds)
    return gc.open_by_key(SHEET_ID).worksheet("Sales").get_all_values()[2:]  # 행3부터


def read_db_rows(sb, start, end):
    out, off = [], 0
    while True:
        page = (sb.table("product_sales").select("id,date,brand,channel,product,lineup,revenue,quantity,buyers")
                .gte("date", start).lte("date", end).order("id").range(off, off + DB_PAGE - 1).execute().data)
        out.extend(page)
        if len(page) < DB_PAGE:
            return out
        off += DB_PAGE


def _sum(rows):
    return (len(rows), sum(int(r["revenue"]) for r in rows), sum(int(r["quantity"]) for r in rows),
            sum(int(r["buyers"]) for r in rows))


def compare(new_rows, db_rows):
    """새 행과 DB 행을 키별로 대조. 차이 목록과 월별 요약을 돌려준다(DB 쓰지 않음)."""
    new_by = {row_key(r): r for r in new_rows}
    db_by = {}
    for r in db_rows:
        db_by.setdefault(row_key(r), []).append(r)
    vals = lambda r: (int(r["revenue"]), int(r["quantity"]), int(r["buyers"]))
    diffs = []
    for k in sorted(set(new_by) | set(db_by)):
        n, d = new_by.get(k), db_by.get(k)
        if d and len(d) > 1:
            diffs.append(("DB 중복", k, None, [vals(x) for x in d]))
        elif n is None:
            diffs.append(("DB 에만", k, None, vals(d[0])))
        elif d is None:
            diffs.append(("새 수집기에만", k, vals(n), None))
        elif vals(n) != vals(d[0]):
            diffs.append(("값 다름", k, vals(n), vals(d[0])))

    summary = defaultdict(lambda: {"new": [], "db": []})
    for side, rows in (("new", new_rows), ("db", db_rows)):
        for r in rows:
            kind = ("공구" if is_gonggu(r) else "자체") if r["brand"] == "balancelab" else "-"
            summary[(str(r["date"])[:7], r["brand"], kind)][side].append(r)
    return diffs, {k: (_sum(v["new"]), _sum(v["db"])) for k, v in summary.items()}


def run_dry(sb, dates):
    schedule = load_gonggu_schedule(sb)
    new_rows = build_rows(read_sheet_rows(), set(dates), schedule)
    db_rows = read_db_rows(sb, dates[0], dates[-1])
    diffs, summary = compare(new_rows, db_rows)
    print(f"행 수: 새 수집기 {len(new_rows)} / DB {len(db_rows)}\n")
    print("월 | 브랜드 | 구분 | 새 수집기(행·매출·수량·구매자) | DB | 일치")
    for k in sorted(summary):
        n, d = summary[k]
        print(f"{k[0]} | {k[1]} | {k[2]} | {n[0]}행 {n[1]:,} {n[2]} {n[3]} | {d[0]}행 {d[1]:,} {d[2]} {d[3]} | {'O' if n == d else 'X'}")
    print(f"\n키별 차이 {len(diffs)}건")
    for kind, k, n, d in diffs:
        print(f"  {kind} {k} 새={n} DB={d}")
    return diffs


def run_write(sb, dates):
    schedule = load_gonggu_schedule(sb)
    rows = build_rows(read_sheet_rows(), set(dates), schedule)
    if not rows:
        print("⏭️ 처리할 데이터 없음")
        return

    date_groups = defaultdict(list)
    for r in rows:
        date_groups[r["date"]].append(r)

    total_inserted = 0
    for date, rows_to_insert in date_groups.items():
        print(f"📅 {date}: {len(rows_to_insert)}건")

        # 기존 데이터 삭제
        try:
            sb.table('product_sales').delete().eq('date', date).execute()
        except Exception as e:
            print(f"   ⚠️ 삭제 에러: {e}")

        # 삽입
        try:
            result = sb.table('product_sales').insert(rows_to_insert).execute()
            print(f"   ✅ {len(result.data)}건 삽입")
            total_inserted += len(result.data)
        except Exception as e:
            print(f"   ❌ 삽입 에러: {e}")

    print(f"\n✅ 전체 {total_inserted}건 동기화 완료!")


def parse_args(argv):
    p = argparse.ArgumentParser(description="Sales 시트 → product_sales 동기화")
    p.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 DB 와 대조만")
    p.add_argument("--from", dest="date_from", help="YYYY-MM-DD (--dry-run 전용)")
    p.add_argument("--to", dest="date_to", help="YYYY-MM-DD (--dry-run 전용)")
    args = p.parse_args(argv)
    if (args.date_from or args.date_to) and not args.dry_run:
        p.error("--from/--to 는 --dry-run 과만 쓴다")
    if bool(args.date_from) != bool(args.date_to):
        p.error("--from 과 --to 는 같이 준다")
    return args


def main(argv=None):
    sys.stdout.reconfigure(encoding='utf-8')
    args = parse_args(argv)
    if args.date_from:
        dates = date_range(args.date_from, args.date_to)
    else:
        today = datetime.now()
        dates = sorted((today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(WINDOW_DAYS))
    mode = "대조만(dry-run)" if args.dry_run else "DB 씀"
    print(f"📊 Sales 시트 → DB 동기화 [{mode}] {dates[0]} ~ {dates[-1]}\n")

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    if args.dry_run:
        run_dry(sb, dates)
    else:
        run_write(sb, dates)


if __name__ == "__main__":
    main()
