import os
# -*- coding: utf-8 -*-
"""Sales 시트 전 기간 → product_sales / daily_sales 전체 재빌드.

왜 필요한가
-----------
`sync_sales_auto.py` 는 최근 7일 윈도우만 본다. 7일이 지난 뒤 시트에 late-edit 이
들어오면(공구 셀러 행 추가, 반품 정정 등) DB 에 영영 반영되지 않는다.
2026-07-02 조사에서 밸런스랩 1~5월 매출이 이중집계·누락으로 드리프트한 원인이 이것이었다.
이 스크립트는 그 백필을 재사용 가능한 형태로 고정한 것이고, daily-sync 워크플로가
매월 1일 09:00 런에서 1회 호출한다.

동결선 (SHEET_FREEZE_DATE) 준수
-------------------------------
방향이 시트 → DB 단방향이다. gspread 를 `spreadsheets.readonly` 스코프로만 열기 때문에
시트에 쓸 수 없다. 동결선은 DB → 시트 방향(`sync_db_to_sheet_all_brands.py`)의 보호선이고,
DB 는 시트가 원천이므로 재생성해도 된다는 것이 운영 규칙이다.

집계 규약
---------
대시보드 매출 업로드 폼(`ppmi-dashboard-v2/src/app/api/upload-sales/route.ts`) 과 **같은 규약**을
쓴다. 폼이 product_sales/daily_sales 의 1차 기록자이므로 규약이 어긋나면 재빌드가
멀쩡한 행을 바꿔 놓는다.

- product_sales 키: (date, brand, channel, product, lineup)  ← lineup 포함이 중요.
  공구 형식 A(channel=smartstore + lineup=셀러명)를 셀러별로 분리해 보존한다.
  lineup 을 키에서 빼면 셀러 breakdown 이 한 행으로 뭉개진다.
- product_sales.buyers = 그룹에 속한 원본 행 수 (폼의 `buyers += 1` 과 동일).
- daily_sales 키: (date, brand, channel), orders = quantity 합 (구매자 수 아님).

사용
----
    python scripts/rebuild_sales_full.py --dry-run          # 기본값, DB 미변경
    python scripts/rebuild_sales_full.py --apply
    python scripts/rebuild_sales_full.py --apply --brand balancelab,nutty
    python scripts/rebuild_sales_full.py --dry-run --since 2026-01-01
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

import argparse
import json
import re
from collections import defaultdict

import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# 파싱 규칙·접속 정보는 한 곳에만 둔다.
# 연도는 A열에서 파싱한다(하드코딩 금지, 2026-07-02 매출 어긋남의 근본원인).
import heartbeat  # noqa: E402
from sync_sales_auto import parse_date, clean_revenue, map_channel  # noqa: E402

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
SHEET_TAB = "Sales"
READONLY_SCOPE = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# 시트 열 인덱스 (헤더: 월 / 주문일시 / 판매처 / 카테고리 / 브랜드명 / 라인업 / 제품 / 수량 / 구매자 수 / 매출 / 객단가 / 주차)
COL_MONTH, COL_DAY, COL_CHANNEL, COL_CATEGORY = 0, 1, 2, 3
COL_BRAND, COL_LINEUP, COL_PRODUCT, COL_QTY = 4, 5, 6, 7
COL_BUYERS, COL_REVENUE = 8, 9
MIN_COLS = 11
DATA_START_ROW = 2  # 1행 공백 + 2행 헤더

INSERT_CHUNK = 500
ALL_BRANDS = {"balancelab", "nutty", "ironpet", "saip"}


def map_brand_full(brand_str, category_str=None):
    """시트 카테고리·브랜드명 → DB brand.

    `sync_sales_auto.map_brand` 와 같되 카테고리 '하루가꿈' 을 balancelab 으로 더 받는다.
    하루가꿈은 밸런스랩 라인이고 DB 에 이미 brand='balancelab' 로 5행 들어가 있다.
    이 갈래가 없으면 전체 재빌드가 그 행들을 unknown 으로 떨어뜨려 삭제한다.
    """
    combined = f"{str(category_str or '').lower()} {str(brand_str).lower()}"
    if "너티" in combined or "nutty" in combined:
        return "nutty"
    if "아이언펫" in combined or "ironpet" in combined:
        return "ironpet"
    if any(k in combined for k in ("파미나", "닥터레이", "테라카니스", "고네이티브")):
        return "saip"
    if any(k in combined for k in ("밸런스랩", "자체판매", "공동구매", "큐모발", "하루가꿈")):
        return "balancelab"
    return "unknown"


def safe_int(value):
    s = str(value or "").replace(",", "").strip()
    return int(s) if re.fullmatch(r"-?\d+", s) else 0


def read_sheet():
    creds = Credentials.from_service_account_file(SA_JSON, scopes=READONLY_SCOPE)
    gc = gspread.authorize(creds)
    ws = gc.open_by_key(SHEET_ID).worksheet(SHEET_TAB)
    return ws.get_all_values()[DATA_START_ROW:]


def parse_rows(sheet_rows, brands, since):
    """시트 원본 행 → 정규화된 행 목록 + 파싱 통계."""
    parsed, stats = [], defaultdict(int)
    for idx, raw in enumerate(sheet_rows, start=DATA_START_ROW + 1):
        if len(raw) < MIN_COLS:
            stats["short_row"] += 1
            continue
        date = parse_date(raw[COL_MONTH], raw[COL_DAY])
        if not date:
            stats["bad_date"] += 1
            continue
        if since and date < since:
            stats["before_since"] += 1
            continue
        brand = map_brand_full(raw[COL_BRAND], raw[COL_CATEGORY])
        if brand == "unknown":
            stats["unknown_brand"] += 1
            continue
        if brand not in brands:
            stats["other_brand"] += 1
            continue
        try:
            revenue = clean_revenue(raw[COL_REVENUE])
        except (ValueError, TypeError):
            stats["bad_revenue"] += 1
            continue
        if revenue == 0:
            stats["zero_revenue"] += 1
            continue
        parsed.append({
            "sheet_row": idx,
            "date": date,
            "brand": brand,
            "channel": map_channel(raw[COL_CHANNEL]),
            "category": raw[COL_CATEGORY],
            "lineup": raw[COL_LINEUP],
            "product": raw[COL_PRODUCT],
            "quantity": safe_int(raw[COL_QTY]),
            "revenue": revenue,
        })
        stats["kept"] += 1
    return parsed, dict(stats)


# 같은 날짜·같은 제품·같은 금액의 시트 행이 여러 건인 것은 정상이다.
# 이커운트 명세 1행 = 주문 1건이고(2026-01-19 에 79,000원 주문이 24건), 업로드 폼이
# 이것을 product_sales 1행으로 합치면서 buyers 를 센다. 중복으로 보고 걷어내면 매출이 사라진다.


def aggregate(parsed):
    """폼(upload-sales route)과 동일한 규약으로 두 테이블 행을 만든다."""
    prod = {}
    for r in parsed:
        key = (r["date"], r["brand"], r["channel"], r["product"], r["lineup"] or "")
        cur = prod.get(key)
        if cur:
            cur["revenue"] += r["revenue"]
            cur["quantity"] += r["quantity"]
            cur["buyers"] += 1  # 폼 규약: 원본 행 1건 = 구매자 1
        else:
            prod[key] = {
                "date": r["date"], "brand": r["brand"], "channel": r["channel"],
                "product": r["product"], "category": r["category"],
                "lineup": r["lineup"] or "", "revenue": r["revenue"],
                "quantity": r["quantity"], "buyers": 1,
            }

    daily = {}
    for r in parsed:
        key = (r["date"], r["brand"], r["channel"])
        cur = daily.get(key)
        if cur:
            cur["revenue"] += r["revenue"]
            cur["orders"] += r["quantity"]
            cur["quantity"] += r["quantity"]
        else:
            daily[key] = {
                "date": r["date"], "brand": r["brand"], "channel": r["channel"],
                "revenue": r["revenue"], "orders": r["quantity"], "quantity": r["quantity"],
            }
    return list(prod.values()), list(daily.values())


def fetch_db(sb, table, brands, since):
    rows, page, size = [], 0, 1000
    while True:
        q = (sb.table(table).select("date,brand,channel,revenue").in_("brand", sorted(brands))
             .order("date").range(page * size, page * size + size - 1))
        if since:
            q = q.gte("date", since)
        batch = q.execute().data
        rows.extend(batch)
        if len(batch) < size:
            return rows
        page += 1


def by_month(rows):
    out = defaultdict(lambda: {"rows": 0, "revenue": 0.0})
    for r in rows:
        m = str(r["date"])[:7]
        out[m]["rows"] += 1
        out[m]["revenue"] += float(r.get("revenue") or 0)
    return out


def print_delta(label, sheet_rows, db_rows):
    """시트 재빌드 결과 vs 현재 DB 월별 대조. 07-02 검증과 같은 기준."""
    s, d = by_month(sheet_rows), by_month(db_rows)
    months = sorted(set(s) | set(d))
    print(f"\n-- {label}: 월별 행수·매출 대조 (시트 재빌드 vs 현재 DB)")
    print(f"   {'월':<9}{'시트행':>7}{'DB행':>7}{'행Δ':>6}{'시트매출':>15}{'DB매출':>15}{'매출Δ':>12}")
    tot_sr = tot_dr = 0
    tot_sv = tot_dv = 0.0
    for m in months:
        sr, dr = s[m]["rows"], d[m]["rows"]
        sv, dv = s[m]["revenue"], d[m]["revenue"]
        tot_sr += sr; tot_dr += dr; tot_sv += sv; tot_dv += dv
        flag = "" if (sr == dr and abs(sv - dv) < 1) else "  <<"
        print(f"   {m:<9}{sr:>7}{dr:>7}{sr - dr:>6}{sv:>15,.0f}{dv:>15,.0f}{sv - dv:>12,.0f}{flag}")
    print(f"   {'합계':<9}{tot_sr:>7}{tot_dr:>7}{tot_sr - tot_dr:>6}{tot_sv:>15,.0f}{tot_dv:>15,.0f}{tot_sv - tot_dv:>12,.0f}")
    return {"sheet_rows": tot_sr, "db_rows": tot_dr,
            "sheet_revenue": tot_sv, "db_revenue": tot_dv,
            "row_delta": tot_sr - tot_dr, "revenue_delta": tot_sv - tot_dv}


def apply_rebuild(sb, product_rows, daily_rows, brands):
    """날짜×브랜드 단위 delete → insert. 폼과 달리 브랜드를 좁혀 다른 브랜드를 건드리지 않는다."""
    for i, brand in enumerate(sorted(brands), 1):
        b_dates = sorted({r["date"] for r in product_rows if r["brand"] == brand})
        print(f"  [{i}/{len(brands)}] {brand}: {len(b_dates)}일 삭제 중...")
        for d in b_dates:
            sb.table("product_sales").delete().eq("date", d).eq("brand", brand).execute()
            sb.table("daily_sales").delete().eq("date", d).eq("brand", brand).execute()

    for table, rows in (("product_sales", product_rows), ("daily_sales", daily_rows)):
        inserted = 0
        for i in range(0, len(rows), INSERT_CHUNK):
            chunk = rows[i:i + INSERT_CHUNK]
            sb.table(table).insert(chunk).execute()
            inserted += len(chunk)
        print(f"  OK {table}: {inserted}건 삽입")
    return len(product_rows), len(daily_rows)


def main():
    ap = argparse.ArgumentParser(description="Sales 시트 전 기간 → DB 전체 재빌드")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="DB 미변경 (기본값)")
    mode.add_argument("--apply", action="store_true", help="실제 재빌드")
    ap.add_argument("--brand", default="balancelab",
                    help="대상 브랜드 콤마 구분 또는 all (기본 balancelab)")
    ap.add_argument("--since", default=None, help="이 날짜(YYYY-MM-DD) 이후만")
    ap.add_argument("--json-out", default=None, help="결과 요약 JSON 경로")
    args = ap.parse_args()

    brands = ALL_BRANDS if args.brand == "all" else {b.strip() for b in args.brand.split(",") if b.strip()}
    unknown = brands - ALL_BRANDS
    if unknown:
        print(f"X 알 수 없는 브랜드: {sorted(unknown)}")
        return 2
    if brands - {"balancelab"}:
        print("! 밸런스랩 외 브랜드 포함. nutty/cafe24 daily_sales 는 '카페24_일별매출' 탭도 쓰는\n"
              "  경합 슬롯이라 이 재빌드가 그 값을 덮는다. 의도한 것인지 확인할 것.")

    apply = args.apply
    print("Sales 시트 전 기간 재빌드 " + ("[APPLY]" if apply else "[DRY-RUN]"))
    print(f"   브랜드={sorted(brands)} since={args.since or '전 기간'}\n")

    sheet_rows = read_sheet()
    print(f"1) 시트 {len(sheet_rows)}행 로드")

    parsed, stats = parse_rows(sheet_rows, brands, args.since)
    print(f"2) 파싱: 채택 {stats.get('kept', 0)}행")
    for k in ("short_row", "bad_date", "bad_revenue", "zero_revenue",
              "unknown_brand", "other_brand", "before_since"):
        if stats.get(k):
            print(f"     제외 {k}: {stats[k]}")
    if not parsed:
        print("대상 행 0. 종료 (DB 미변경).")
        return 0

    product_rows, daily_rows = aggregate(parsed)
    print(f"3) 집계: product_sales {len(product_rows)}행 / daily_sales {len(daily_rows)}행")

    sb = create_client(heartbeat.SUPABASE_URL, heartbeat.SUPABASE_KEY)
    summary = {
        "mode": "apply" if apply else "dry-run",
        "brands": sorted(brands),
        "since": args.since,
        "parse_stats": stats,
    }
    db_product = fetch_db(sb, "product_sales", brands, args.since)
    db_daily = fetch_db(sb, "daily_sales", brands, args.since)
    summary["product_sales"] = print_delta("product_sales", product_rows, db_product)
    summary["daily_sales"] = print_delta("daily_sales", daily_rows, db_daily)

    # 시트에 없는 (날짜, 브랜드) 는 삭제 대상이 아니다. 삭제는 시트에 행이 있는 날짜만 돈다.
    # 위 대조표의 마이너스 Δ 를 "지워질 금액" 으로 오독하지 않도록 따로 찍는다.
    sheet_keys = {(r["date"], r["brand"]) for r in product_rows}
    orphans = defaultdict(lambda: {"rows": 0, "revenue": 0.0})
    for r in db_product:
        if (r["date"], r["brand"]) not in sheet_keys:
            o = orphans[(r["date"], r["brand"])]
            o["rows"] += 1
            o["revenue"] += float(r.get("revenue") or 0)
    if orphans:
        total = sum(o["revenue"] for o in orphans.values())
        print(f"\n-- DB 에만 있는 (날짜,브랜드) {len(orphans)}건 / {total:,.0f}원 — 건드리지 않고 그대로 둔다")
        for (d, b), o in sorted(orphans.items()):
            print(f"   {d} {b:<11} rows={o['rows']} revenue={o['revenue']:,.0f}")
    summary["db_only_keys"] = [{"date": d, "brand": b, **o} for (d, b), o in sorted(orphans.items())]

    if apply:
        print(f"\n> 재빌드 적용: {len({r['date'] for r in product_rows})}일 x {len(brands)}브랜드")
        p, d = apply_rebuild(sb, product_rows, daily_rows, brands)
        summary["applied"] = {"product_sales": p, "daily_sales": d}
        latest = max(r["date"] for r in product_rows)
        heartbeat.record("sales_rebuild", ok=True, rows=p, latest_date=latest,
                         note=f"brands={sorted(brands)} since={args.since or 'all'}")
        print("\n재빌드 완료")
    else:
        print("\nDRY-RUN — DB 를 바꾸지 않았다. 적용하려면 --apply")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"   요약 저장: {args.json_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
