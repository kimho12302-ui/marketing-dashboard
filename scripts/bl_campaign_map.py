# -*- coding: utf-8 -*-
"""밸런스랩 네이버 검색광고 캠페인명 → 브랜드·제품(라인업).

★ 왜 필요한가 (2026-09-29)
  밸런스랩은 캠페인명에 제품이 그대로 들어 있다(`P01.밸런스랩_큐모발검사`,
  `S03.큐음식물과민증검사`). 수집기(sync_all.sync_balancelab_naver)는 이미 캠페인
  단위로 /stats 를 부르면서도 by_channel 로 합치며 이름을 버리고 있었다.
  추가 API 호출 없이 같은 루프에서 제품 축을 만들 수 있다.

★ 이 계정에는 밸런스랩이 아닌 캠페인이 섞여 있다
  2023_아이언펫 / 와이에스환경기술연구소 / 한국반려동물안전인증센터 / 수은세상.
  지금은 전부 PAUSED 라 금액이 0이지만, 재개되면 밸런스랩 광고비가 부풀어 오른다.
  브랜드를 캠페인명으로 가려서 그 사고를 미리 막는다.
"""
import re

# 검사 라인. 순서가 판정 우선순위다. 긴 이름을 먼저 둬야 부분일치로 잘못 잡히지 않는다.
# 표기는 판매 원장·brand-groups 의 BL_TEST_LINES 와 맞춘다.
PRODUCT_RULES = [
    (re.compile(r"음식물과민증|지연성|알러지|알레르기|IgG", re.I), "큐음식물과민증검사"),
    (re.compile(r"타액|호르몬"), "큐타액호르몬검사"),
    (re.compile(r"모발.*뉴트리션|뉴트리션"), "큐모발검사 뉴트리션"),
    (re.compile(r"모발.*중금속|중금속"), "큐모발검사 중금속"),
    (re.compile(r"모발"), "큐모발검사"),
    (re.compile(r"영양실조|생로병사"), "큐모발검사"),
]

# 밸런스랩 계정에 얹혀 있는 남의 캠페인. 밸런스랩 광고비로 세면 안 된다.
NOT_BALANCELAB = [
    (re.compile(r"아이언펫"), "ironpet"),
    (re.compile(r"벌크"), "saip"),
]
# 브랜드도 제품도 아닌 것(외부 기관·별도 사업). 집계에서 뺀다.
OTHER_BIZ = re.compile(r"와이에스환경|한국반려동물안전인증센터|수은세상|99\.브랜드")


def classify(campaign_name: str):
    """캠페인명 → (브랜드, 제품). 제품을 못 가르면 제품만 None.

    브랜드가 None 이면 밸런스랩 집계에서 빼야 하는 캠페인이다.
    ★ 폴백으로 balancelab 을 찍지 않는다. 남의 캠페인이 섞여 있는 계정이라
      모르는 이름을 밸런스랩으로 미는 순간 광고비가 조용히 부푼다.
    """
    n = str(campaign_name or "")
    for pat, brand in NOT_BALANCELAB:
        if pat.search(n):
            return brand, None
    if OTHER_BIZ.search(n):
        return None, None
    for pat, product in PRODUCT_RULES:
        if pat.search(n):
            return "balancelab", product
    # 밸런스랩이라고 적혀 있는데 제품을 못 가른 경우: 브랜드만 인정하고 제품은 비운다.
    if "밸런스랩" in n or "밸런스" in n:
        return "balancelab", None
    return None, None


if __name__ == "__main__":
    samples = [
        "P01.밸런스랩_큐모발검사", "P02.밸런스랩_큐타액호르몬검사", "P03.밸런스랩_큐지연성알러지검사",
        "S01_큐모발검사_뉴트리션", "S02_큐모발검사_중금속", "S03.큐음식물과민증검사",
        "S03.큐타액호르몬검사", "쇼핑검색_큐모발", "🟣모발중금속 종합검사", "🟢중금속+미네랄",
        "생로병사 영양실조_240328", "큐모발검사",
        "2023_아이언펫", "2023_아이언펫_쇼핑검색", "S99.벌크",
        "와이에스환경기술연구소", "한국반려동물안전인증센터", "수은세상", "99.브랜드",
    ]
    for s in samples:
        b, p = classify(s)
        print(f"  {s:<28} → brand={b or '(제외)':<12} product={p or '-'}")
