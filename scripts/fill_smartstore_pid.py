# -*- coding: utf-8 -*-
"""통계시트 '상품 목록' 탭에 스마트스토어 상품번호(G열)를 채운다.

왜 이 방식인가 (2026-09-16 검증):
  광고(GFA)는 상품번호로 성과를 준다. 판매 원장은 제품명으로 기록된다.
  이름끼리는 안 붙는다 — 광고 70종 중 마스터와 이름이 같은 건 11종뿐이다.
  그런데 '상품 목록' 마스터는 판매 원장과 98%(109종 중 107종) 붙는다.
  즉 마스터에 광고 상품번호만 얹으면 삼각형이 완성된다:
      GFA 상품번호 → 마스터 행 → 브랜드·라인업·제품명 → 판매 원장
  브랜드도 마스터가 정본이 된다. 상품명에서 '파미나'를 찾아 추측하던 걸 대체한다.

★ 기존 A~F 열과 기존 행은 건드리지 않는다. 빈 G열 쓰기와 맨 아래 행 추가만 한다.
  시트 1행에 "각 셀의 내용과 위치는 절대 바꾸지 말 것" 이라고 적혀 있다.
기본 dry-run. --apply 가 있어야 쓴다. 쓰기 전 백업 JSON 을 남긴다.
"""
import os, sys, re, json, collections, urllib.request, datetime
import gspread
from google.oauth2.service_account import Credentials

SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
TAB = "상품 목록"
HEADER_ROW = 3          # 헤더가 3행
DATA_START = 4          # 데이터가 4행부터
PID_COL = 7             # G열 (1-based)
SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
APPLY = "--apply" in sys.argv

# 마스터가 쓰는 브랜드 어휘. 초안 행의 브랜드명을 이 말로 적어야 기존 행과 섞인다.
MASTER_BRANDS = ["파미나", "닥터레이", "레이앤이본", "고네이티브", "테라카니스", "오리젠",
                 "벳라이프", "너티", "아이언펫", "마그네타"]
BRAND_ALIAS = {"레이앤이본": "닥터레이", "벳라이프": "파미나", "마그네타": "닥터레이"}


def fetch(path):
    out, off = [], 0
    while True:
        req = urllib.request.Request(f"{SB_URL}{path}&order=id.asc&offset={off}&limit=1000",
                                     headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY})
        d = json.load(urllib.request.urlopen(req, timeout=120))
        out += d
        if len(d) < 1000:
            return out
        off += 1000


def toks(x):
    return {t for t in re.sub(r"[^0-9A-Za-z가-힣]+", " ", str(x).lower()).split() if len(t) > 1}


def sizes(x):
    return set(re.findall(r"(\d+(?:\.\d+)?)\s*(kg|g|ml|개입|개|정)", str(x).lower()))


def brand_of(name):
    for b in MASTER_BRANDS:
        if b in name:
            return BRAND_ALIAS.get(b, b)
    return ""


def main():
    creds = Credentials.from_service_account_file(
        os.path.expanduser("~/.naver-searchad/google-service-account.json"),
        scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"])
    ws = gspread.authorize(creds).open_by_key(SHEET_ID).worksheet(TAB)
    grid = ws.get_all_values()

    master = []   # (sheet_row, 제품명, 브랜드, 기존G)
    for i, r in enumerate(grid[DATA_START - 1:], start=DATA_START):
        name = r[4].strip() if len(r) > 4 else ""
        if not name:
            continue
        master.append({"row": i, "name": name, "brand": r[2].strip() if len(r) > 2 else "",
                       "cur": r[PID_COL - 1].strip() if len(r) > PID_COL - 1 else ""})

    ad = fetch("/rest/v1/ad_product_performance?select=id,product_id,product_name,spend")
    prods = {}
    for r in ad:
        p = prods.setdefault(str(r["product_id"]), {"name": r["product_name"], "spend": 0.0})
        p["spend"] += float(r["spend"] or 0)

    used_rows, matched, drafts = set(), [], []
    for pid, p in sorted(prods.items(), key=lambda x: -x[1]["spend"]):
        ta, sa = toks(p["name"]), sizes(p["name"])
        scored = []
        for m in master:
            if m["row"] in used_rows:
                continue
            ts = toks(m["name"])
            if not ts:
                continue
            c = len(ta & ts) / len(ts)
            ss = sizes(m["name"])
            if sa and ss and not (sa & ss):
                c *= 0.25          # 용량이 다르면 다른 SKU
            scored.append((c, len(ts), m))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        best = scored[0] if scored else (0, 0, None)
        second = scored[1][0] if len(scored) > 1 else 0
        # ★ 동점 처리. 판매 마스터에는 "…100g" 과 "…100g 5개" 처럼 한쪽이 다른 쪽을
        #   포함하는 이름이 흔하다. 둘 다 포함도 1.00 이 나와 점수차 규칙에 걸려
        #   정답인데도 초안으로 밀렸고, 그대로 쓰면 마스터에 중복 행이 생겨
        #   판매 원장과의 98% 연결이 깨진다(2026-09-16 dry-run 에서 발견).
        #   1등 토큰이 2등을 완전히 포함하면(= 더 구체적이면) 1등을 택한다.
        decisive = (best[0] - second) >= 0.1
        if not decisive and len(scored) > 1 and best[0] >= 0.9:
            t1, t2 = toks(scored[0][2]["name"]), toks(scored[1][2]["name"])
            decisive = t1 > t2          # 진부분집합이면 1등이 더 구체적이다
        if best[0] >= 0.9 and decisive:
            used_rows.add(best[2]["row"])
            matched.append((pid, p, best[2], best[0]))
        else:
            drafts.append((pid, p, best[2]["name"] if best[2] else "", best[0]))

    print(f"마스터 {len(master)}종 / 광고 상품 {len(prods)}종")
    print(f"  기존 행에 번호 기입 : {len(matched)}종")
    print(f"  초안 행 신규 추가   : {len(drafts)}종")
    tot = sum(p["spend"] for p in prods.values()) or 1
    print(f"  광고비 커버리지     : 기입 {sum(m[1]['spend'] for m in matched)/tot*100:.0f}% / 신규 {sum(d[1]['spend'] for d in drafts)/tot*100:.0f}%")

    print("\n=== 기존 행에 기입 (상위 8) ===")
    for pid, p, m, sc in matched[:8]:
        print(f"  r{m['row']:<4} {pid:<13} {p['name'][:34]:<36} → {m['name'][:30]}")
    print("\n=== 초안 행으로 추가 (광고비순 전체) ===")
    for pid, p, cand, sc in sorted(drafts, key=lambda x: -x[1]["spend"]):
        print(f"  {int(p['spend']):>8,}원 {pid:<13} [{brand_of(p['name']) or '브랜드?':<6}] {p['name'][:44]}")
        if cand:
            print(f"                            (가장 가까운 기존: {sc:.2f} {cand[:40]})")

    if not APPLY:
        print("\n(dry-run) --apply 로 반영. 쓰기 전 백업을 남깁니다.")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bpath = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", f"backup_상품목록_{stamp}.json")
    os.makedirs(os.path.dirname(bpath), exist_ok=True)
    json.dump(grid, open(bpath, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n백업: {bpath} ({len(grid)}행)")

    # 1) 헤더
    ws.update_cell(HEADER_ROW, PID_COL, "스마트스토어 상품번호")
    # 2) 기존 행 G열 (한 번에)
    cells = [gspread.Cell(m["row"], PID_COL, pid) for pid, p, m, sc in matched]
    if cells:
        ws.update_cells(cells, value_input_option="USER_ENTERED")
    # 3) 초안 행 추가
    if drafts:
        # 같은 제품명에 상품ID 가 여럿인 경우(옵션 변형)가 있다. 제품명이 키라서
        # 같은 이름으로 행을 두 개 만들면 판매 원장 연결이 어느 행에 붙을지 모호해진다.
        # 집행액이 큰 ID 하나만 행으로 만들고 나머지는 보고에만 남긴다.
        seen = set(); rows = []
        for pid, p, cand, sc in sorted(drafts, key=lambda x: -x[1]["spend"]):
            if p["name"] in seen:
                print(f"  (같은 이름 중복 ID 생략: {pid} {p['name'][:30]})")
                continue
            seen.add(p["name"])
            rows.append(["", "", brand_of(p["name"]), "", p["name"], "", pid])
        ws.append_rows(rows, value_input_option="USER_ENTERED", table_range="A1")
    print(f"✅ G열 헤더 + 기존 {len(matched)}행 기입 + 초안 {len(drafts)}행 추가 완료.")


if __name__ == "__main__":
    main()
