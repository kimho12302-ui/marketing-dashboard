# -*- coding: utf-8 -*-
"""rebuild_sales_full 이 sync_sales_auto 와 같은 공구/자체 규칙을 쓰는지 시험. 실행: python -m pytest scripts/tests -q"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import rebuild_sales_full as R  # noqa: E402
import sync_sales_auto as S  # noqa: E402

SCHEDULE = [
    {"seller": "우아띵", "start_on": "2026-01-16", "end_on": "2026-01-20"},
    {"seller": "여울맘", "start_on": "2026-01-26", "end_on": "2026-01-29"},
    {"seller": "도다미네", "start_on": "2026-01-26", "end_on": "2026-02-01"},
]


def sheet_row(day, brand_label, lineup, product, qty, revenue, channel="스마트스토어", category="밸런스랩"):
    """시트 열: 월 / 주문일시 / 판매처 / 카테고리 / 브랜드명 / 라인업 / 제품 / 수량 / 구매자 수 / 매출 / 객단가"""
    return ["26년1월", f"1월 {day}일 (월)", channel, category, brand_label, lineup, product,
            str(qty), "1", f"{revenue:,}", ""]


def rebuild(rows, schedule=SCHEDULE):
    parsed, _ = R.parse_rows(rows, {"balancelab", "nutty"}, None, schedule)
    prod, daily = R.aggregate(parsed)
    return prod, daily


def test_rules_are_shared_not_copied():
    assert R.map_brand is S.map_brand
    assert R.map_brand_full is S.map_brand
    assert R.resolve_lineup is S.resolve_lineup
    assert R.is_gonggu is S.is_gonggu


def test_blank_seller_gonggu_and_self_stay_separate():
    """2026-01-19 실례: E열 공동구매(셀러 빈칸) 줄과 자체판매 줄이 한 자체 행으로 합쳐지던 버그."""
    prod, daily = rebuild([
        sheet_row(19, "공동구매", "", "큐모발검사 뉴트리션", 30, 2_000_000),
        sheet_row(19, "공동구매", "", "큐모발검사 뉴트리션", 26, 1_689_500),
        sheet_row(19, "자체판매", "", "큐모발검사 뉴트리션", 1, 109_000),
    ])
    got = sorted((r["lineup"], r["revenue"], r["quantity"], r["buyers"]) for r in prod)
    assert got == [("", 109_000, 1, 1), ("우아띵", 3_689_500, 56, 2)]
    # daily_sales 는 lineup 이 없으므로 한 행 그대로다.
    assert [(r["channel"], r["revenue"]) for r in daily] == [("smartstore", 3_798_500)]


def test_overlap_and_unknown_seller():
    prod, _ = rebuild([
        sheet_row(27, "공동구매", "", "큐모발검사 뉴트리션", 2, 200_000),
        sheet_row(22, "공동구매", "", "큐모발검사 뉴트리션", 1, 99_000),
    ])
    assert sorted((r["date"], r["lineup"]) for r in prod) == [("2026-01-22", "기타"), ("2026-01-27", "여울맘·도다미네")]
    assert all(S.is_gonggu(r) for r in prod)


def test_no_schedule_still_counts_as_gonggu():
    """일정표를 못 읽어도 공동구매 줄은 '기타' 로 공구에 남는다(자체로 새지 않는다)."""
    prod, _ = rebuild([sheet_row(19, "공동구매", "", "큐모발검사 뉴트리션", 1, 99_000)], schedule=[])
    assert [(r["lineup"], S.is_gonggu(r)) for r in prod] == [("기타", True)]


def test_other_brand_lineup_untouched():
    prod, _ = rebuild([sheet_row(19, "너티", "", "너티 사료", 1, 30_000, category="너티")])
    assert [(r["brand"], r["lineup"]) for r in prod] == [("nutty", "")]
