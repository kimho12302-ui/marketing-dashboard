# -*- coding: utf-8 -*-
"""통계시트 '상품 목록' → product_master.json (제품 정본).

이 파일이 제품 정체성의 정본이다. 여기서 세 가지가 한 번에 결정된다:
  스마트스토어 상품번호(G열) → 브랜드 · 라인업 · 판매 원장 제품명

왜 필요한가 (2026-09-16):
  광고(GFA)는 상품번호로 성과를 준다. 판매 원장은 제품명으로 기록된다. 이름끼리는
  안 붙는다(광고 70종 중 마스터와 이름이 같은 건 11종). 그런데 마스터는 판매 원장과
  98%(109종 중 107종) 붙는다. 그래서 마스터에 광고 상품번호를 얹어 삼각형을 만들었다.

  브랜드도 이걸로 정본이 된다. 이전에는 상품명에서 '파미나'를 찾아 사입으로 **추측**했다.
  한 캠페인에 사입+너티가 섞여 있어 캠페인명으로는 못 가르고, 상품명 추측은
  새 브랜드가 생기면 조용히 틀린다. 시트가 답을 갖고 있으니 시트를 쓴다.

출력은 두 곳에 쓴다. 대시보드(ppmi-dashboard-v2)도 같은 정본을 읽어야 하기 때문이다.
"""
import os, re, json, sys, collections
import gspread
from google.oauth2.service_account import Credentials

SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
TAB = "상품 목록"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTS = [
    os.path.join(HERE, "data", "product_master.json"),
    os.path.join(os.path.dirname(HERE), "ppmi-dashboard-v2", "src", "lib", "product-master.json"),
]

# 카테고리가 먼저다. '자체판매' 브랜드명 아래 밸런스랩·하루가꿈이 섞여 있어
# 브랜드명만 보면 못 가른다(2026-09-16 실측).
CATEGORY_BRAND = {"밸런스랩": "balancelab", "하루가꿈": "balancelab", "헬스케어": "ironpet"}
BRAND_KEY = {
    "파미나": "saip", "닥터레이": "saip", "고네이티브": "saip",
    "테라카니스": "saip", "오리젠": "saip", "벳라이프": "saip",
    "너티": "nutty", "아이언펫": "ironpet",
    "공동구매": "balancelab", "자체판매": "balancelab",
}


def main():
    creds = Credentials.from_service_account_file(
        os.path.expanduser("~/.naver-searchad/google-service-account.json"),
        scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"])
    rows = gspread.authorize(creds).open_by_key(SHEET_ID).worksheet(TAB).get_all_values()[3:]

    by_pid, items, unknown = {}, [], []
    for r in rows:
        name = (r[4].strip() if len(r) > 4 else "")
        if not name:
            continue
        cat = r[1].strip() if len(r) > 1 else ""
        brand_ko = r[2].strip() if len(r) > 2 else ""
        key = CATEGORY_BRAND.get(cat) or BRAND_KEY.get(brand_ko)
        if not key:
            unknown.append((brand_ko, cat, name))
            continue
        pid = r[6].strip() if len(r) > 6 else ""
        item = {
            "code": r[0].strip() if len(r) > 0 else "",
            "category": cat, "brand_ko": brand_ko, "brand": key,
            "lineup": r[3].strip() if len(r) > 3 else "",
            "product": name,
            "coupang_pid": r[5].strip() if len(r) > 5 else "",
        }
        items.append(item)
        if re.fullmatch(r"\d{9,12}", pid):
            if pid in by_pid:
                print(f"  ⚠ 상품번호 중복 {pid}: '{by_pid[pid]['product'][:28]}' vs '{name[:28]}' → 먼저 것 유지")
            else:
                by_pid[pid] = item

    payload = {"generated_from": TAB, "by_smartstore_pid": by_pid, "items": items}
    for out in OUTS:
        if not os.path.isdir(os.path.dirname(out)):
            print(f"  (건너뜀, 경로 없음) {out}"); continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        print(f"  → {out}")

    print(f"\n제품 {len(items)}종 / 스마트스토어 상품번호 매핑 {len(by_pid)}개")
    print("  브랜드별:", dict(collections.Counter(i["brand"] for i in items)))
    if unknown:
        # 폴백하지 않는다. 모르는 브랜드를 아무 데나 넣으면 어느 브랜드가 틀렸는지 모른다.
        print(f"\n  ⚠ 브랜드를 못 가른 행 {len(unknown)}개 — BRAND_KEY/CATEGORY_BRAND 에 추가 필요:")
        for b, c, n in unknown[:5]:
            print(f"     브랜드'{b}' 카테고리'{c}'  {n[:40]}")


if __name__ == "__main__":
    main()
