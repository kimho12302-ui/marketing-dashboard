# -*- coding: utf-8 -*-
"""sync_sales_auto 묶음 키·공구 셀러 이름 규칙 시험. 실행: python -m pytest scripts/tests -q"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from sync_sales_auto import build_rows, is_gonggu, map_brand, resolve_lineup, seller_for  # noqa: E402

SCHEDULE = [
    {"seller": "우아띵", "start_on": "2026-01-16", "end_on": "2026-01-20"},
    {"seller": "여울맘", "start_on": "2026-01-26", "end_on": "2026-01-29"},
    {"seller": "도다미네", "start_on": "2026-01-26", "end_on": "2026-02-01"},
]


def sheet_row(day, brand_label, lineup, product, qty, buyers, revenue, channel="스마트스토어", category="밸런스랩"):
    """시트 열: 월 / 주문일시 / 판매처 / 카테고리 / 브랜드명 / 라인업 / 제품 / 수량 / 구매자 수 / 매출 / 객단가"""
    return ["26년1월", f"1월 {day}일 (월)", channel, category, brand_label, lineup, product,
            str(qty), str(buyers), f"{revenue:,}", ""]


def test_seller_for_single_window():
    assert seller_for("2026-01-19", SCHEDULE) == "우아띵"


def test_seller_for_overlap_joins_with_middle_dot():
    assert seller_for("2026-01-27", SCHEDULE) == "여울맘·도다미네"


def test_seller_for_no_window_is_etc():
    assert seller_for("2026-01-22", SCHEDULE) == "기타"
    assert seller_for("2026-01-19", []) == "기타"


def test_resolve_lineup_rules():
    assert resolve_lineup("2026-01-19", "balancelab", "공동구매", "", SCHEDULE) == "우아띵"
    assert resolve_lineup("2026-01-19", "balancelab", "공동구매", "아하맘", SCHEDULE) == "아하맘"
    assert resolve_lineup("2026-01-19", "balancelab", "자체판매", "", SCHEDULE) == ""
    # 다른 브랜드의 F열은 상품 라인업이다. 일정표로 채우지 않는다.
    assert resolve_lineup("2026-01-19", "nutty", "너티", "", SCHEDULE) == ""
    assert resolve_lineup("2026-01-19", "nutty", "너티", "하루루틴", SCHEDULE) == "하루루틴"


def test_gonggu_and_self_same_day_same_product_stay_separate():
    """2026-01-19 실례: 뉴트리션 공구 3,689,500 + 자체 109,000 이 한 행으로 합쳐지던 버그."""
    rows = [
        sheet_row(19, "공동구매", "", "큐모발검사 뉴트리션", 30, 20, 2_000_000),
        sheet_row(19, "공동구매", "", "큐모발검사 뉴트리션", 26, 20, 1_689_500),
        sheet_row(19, "자체판매", "", "큐모발검사 뉴트리션", 1, 1, 109_000),
    ]
    out = build_rows(rows, {"2026-01-19"}, SCHEDULE)
    assert len(out) == 2
    gonggu = [r for r in out if is_gonggu(r)]
    self_ = [r for r in out if not is_gonggu(r)]
    assert [(r["lineup"], r["revenue"], r["quantity"], r["buyers"]) for r in gonggu] == [("우아띵", 3_689_500, 56, 40)]
    assert [(r["lineup"], r["revenue"], r["quantity"], r["buyers"]) for r in self_] == [("", 109_000, 1, 1)]


def test_named_seller_and_self_stay_separate():
    """2026-07-08 실례: F열 셀러(아하맘) 줄과 자체판매 줄이 첫 줄 lineup 으로 합쳐지던 버그."""
    rows = [
        sheet_row(8, "자체판매", "", "큐모발검사 뉴트리션", 2, 1, 99_000),
        sheet_row(8, "공동구매", "아하맘", "큐모발검사 뉴트리션", 17, 11, 1_375_000),
    ]
    out = sorted(build_rows(rows, {"2026-01-08"}, SCHEDULE), key=lambda r: r["lineup"])
    assert [(r["lineup"], r["revenue"]) for r in out] == [("", 99_000), ("아하맘", 1_375_000)]


def test_rows_outside_window_and_zero_revenue_are_skipped():
    rows = [
        sheet_row(18, "자체판매", "", "A", 1, 1, 10_000),
        sheet_row(19, "자체판매", "", "A", 1, 1, 0),
    ]
    assert build_rows(rows, {"2026-01-19"}, SCHEDULE) == []


def test_map_brand_matches_rebuild_rules():
    assert map_brand("하루가꿈", "하루가꿈") == "balancelab"
    assert map_brand("오리젠", "사입") == "saip"
    assert map_brand("", "") == "unknown"
    assert map_brand("공동구매", "밸런스랩") == "balancelab"


def test_seller_order_fixed_regardless_of_input_order():
    """DB 표에는 입력 순서가 없다. 시작일 → 마감일 → 이름 순으로 잇는다(보정 SQL 이름과 같음)."""
    assert seller_for("2026-01-27", list(reversed(SCHEDULE))) == "여울맘·도다미네"
    assert seller_for("2026-01-27", SCHEDULE) == "여울맘·도다미네"
