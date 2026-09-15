# -*- coding: utf-8 -*-
"""GFA 상품 → 브랜드·라인업 매핑.

★ 왜 상품명으로 가르는가 (2026-09-15 실측)
  GFA 캠페인은 브랜드 경계와 일치하지 않는다. 한 캠페인에 여러 브랜드가 섞인다.
    ADVoost 쇼핑 부스트 업        → 파미나17 · 고네이티브6 · 닥터레이6 · 너티4  (사입+너티 혼재)
    ADVoost 쇼핑_벳라이프_260818   → 상품은 전부 파미나 (이름과 내용 불일치)
  즉 캠페인명으로는 브랜드를 정확히 가를 수 없다. 상품 단위가 유일한 정답이다.
  30일 실측 기준 캠페인 기준 귀속은 12,980원(0.4%)을 틀린다. 상품 기준은 0.

★ 검색광고(sync_naver_sa.py)의 brand_from_campaign 과 다른 함수다.
  검색광고는 캠페인명에 브랜드 접두어가 붙어 있어(`02.너티_파워링크`,
  `05. 사입_파미나/닥터레이`, `03.아이언펫_쇼핑검색`) 캠페인 기준이 정확하다.
  GFA 만 네이밍 체계가 달라 이 모듈이 필요하다. 두 함수를 합치지 말 것.
"""

# 사입이 유통하는 브랜드. 순서 = 판정 우선순위.
# 사입 브랜드를 너티보다 먼저 본다(2026-08 벌크 사고와 같은 방향의 방어).
SAIP_BRANDS = [
    "파미나", "닥터레이", "레이앤이본", "테라카니스", "고네이티브",
    "오리젠", "벳라이프", "마그네타",
]

# 밸런스랩 검사 제품. 라인업(제품) 축까지 같이 돌려준다.
BALANCELAB_LINES = [
    ("큐모발", "큐모발검사"),
    ("큐타액", "큐타액호르몬검사"),
    ("호르몬", "큐타액호르몬검사"),
    ("큐음식물", "큐음식물과민증검사"),
    ("과민증", "큐음식물과민증검사"),
    ("지연성", "큐음식물과민증검사"),
]


def brand_from_product(product_name: str):
    """상품명 → (브랜드, 라인업).

    라인업은 밸런스랩만 채운다. 펫 브랜드는 상품 자체가 라인업이라
    product_name 을 그대로 쓰는 편이 낫고, 여기서 억지로 묶으면 정보가 준다.

    매칭 실패는 None 을 돌려준다. **폴백으로 아무 브랜드나 찍지 않는다** —
    조용히 섞이면 어느 브랜드 광고비가 틀렸는지 영영 모른다. 호출부에서
    집행액이 있는 미매칭만 경고하고 사람이 이 목록에 추가하게 한다.
    """
    n = str(product_name or "")
    for key, line in BALANCELAB_LINES:
        if key in n:
            return "balancelab", line
    for b in SAIP_BRANDS:
        if b in n:
            return "saip", None
    if "너티" in n:
        return "nutty", None
    if "아이언펫" in n:
        return "ironpet", None
    return None, None


if __name__ == "__main__":
    import csv, sys, collections
    path = sys.argv[1] if len(sys.argv) > 1 else "gfa_products.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    agg = collections.defaultdict(float)
    unmatched = []
    for r in rows:
        b, line = brand_from_product(r["product_name"])
        cost = float(r.get("cost") or 0)
        if b is None:
            unmatched.append((r["product_name"], cost))
        else:
            agg[b] += cost
    print(f"상품 {len(rows)}개 판정")
    for b, c in sorted(agg.items(), key=lambda x: -x[1]):
        print(f"  {b:<12} {int(c):>12,}원")
    paid_unmatched = [u for u in unmatched if u[1] > 0]
    print(f"\n미매칭 {len(unmatched)}개 (그중 집행액 있는 것 {len(paid_unmatched)}개)")
    for n, c in sorted(paid_unmatched, key=lambda x: -x[1])[:10]:
        print(f"  {n[:50]:<52} {int(c):,}원")
    sys.exit(1 if paid_unmatched else 0)
