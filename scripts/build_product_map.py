# -*- coding: utf-8 -*-
"""광고 상품 ↔ 판매 SKU 매핑표 생성/검수.

왜 필요한가: 광고 플랫폼 상품명과 판매 원장 제품명이 다른 체계다.
  광고: "레이앤이본 닥터레이 오메가3 강아지 고양이 영양제"
  판매: "오메가3"
사람 눈엔 명백한데 문자열로는 안 붙는다. 그렇다고 유사도로 자동 연결하면
용량이 다른 SKU(1.5kg vs 2.5kg)가 조용히 붙어 제품별 ROAS 가 틀린다.

그래서 **한 번 만들고 사람이 검수하는 매핑표**를 쓴다.
키는 product_id(스마트스토어 상품번호)다. 상품명이 바뀌어도 ID 는 유지된다.

점수는 Jaccard 가 아니라 **포함도**를 쓴다: 판매명 토큰이 광고명에 얼마나 들어있나.
판매명이 짧고 광고명이 길어서 Jaccard 로는 정답이 낮게 나온다(오메가3 → 0.44).
포함도로 바꾸면 1.00 이 된다. 용량이 다르면 0.25 배로 깎아 SKU 혼동을 막는다.

출력: data/product_map.csv
  status=auto   자동 확정 (포함도 0.9+ 이고 2등과 0.15 이상 차이)
  status=review 사람이 봐야 함 — **매칭에 쓰이지 않는다**
직접 고칠 때는 sales_product 를 채우고 status 를 confirmed 로 바꾼다.
"""
import csv, os, re, sys, collections, urllib.request, json

SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "product_map.csv")
SALES_DAYS = 90  # 판매 SKU 후보를 모을 기간. 짧으면 안 팔린 제품이 후보에서 빠진다.


def q(path):
    """전량 조회.

    ★ PostgREST 의 db-max-rows(1000)가 클라이언트 Range 헤더보다 우선한다.
      Range: 0-9999 를 줘도 1000행에서 잘린다. 처음에 이걸 몰라서 판매 SKU 후보 풀이
      1946행 중 1000행만 잡혔고, 오리젠·벳라이프·레날·베가가 "판매 원장에 없음"으로
      나와 매칭이 틀렸다(2026-09-16). 반드시 offset 으로 넘긴다.
    """
    out, off = [], 0
    sep = "&" if "?" in path else "?"
    while True:
        req = urllib.request.Request(f"{SB_URL}{path}{sep}order=id.asc&offset={off}&limit=1000",
                                     headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY})
        d = json.load(urllib.request.urlopen(req, timeout=120))
        out += d
        if len(d) < 1000:
            return out
        off += 1000
        if off > 200000:
            raise SystemExit("q(): 200,000행 초과 — 쿼리 필터를 확인하세요")


def toks(x):
    x = re.sub(r"[^0-9A-Za-z가-힣]+", " ", str(x).lower())
    return {t for t in x.split() if len(t) > 1}


def sizes(x):
    return set(re.findall(r"(\d+(?:\.\d+)?)\s*(kg|g|ml|개입|개|정)", str(x).lower()))


def main():
    from datetime import date, timedelta
    since = (date.today() - timedelta(days=SALES_DAYS)).isoformat()
    ad = q("/rest/v1/ad_product_performance?select=id,product_id,product_name,brand,spend")
    ps = q(f"/rest/v1/product_sales?date=gte.{since}&select=id,product,brand,revenue")

    A = collections.defaultdict(lambda: {"spend": 0.0, "name": "", "brand": ""})
    for r in ad:
        a = A[str(r["product_id"])]
        a["spend"] += float(r["spend"] or 0); a["name"] = r["product_name"]; a["brand"] = r["brand"]
    S = collections.defaultdict(lambda: {"revenue": 0.0, "brand": ""})
    for r in ps:
        s = S[r["product"]]
        s["revenue"] += float(r["revenue"] or 0); s["brand"] = r["brand"]

    # 기존 매핑에서 사람이 손댄 것(confirmed)은 절대 덮어쓰지 않는다.
    keep = {}
    if os.path.exists(OUT):
        for row in csv.DictReader(open(OUT, encoding="utf-8-sig")):
            if row.get("status") == "confirmed":
                keep[row["product_id"]] = row

    rows = []
    for pid, a in sorted(A.items(), key=lambda x: -x[1]["spend"]):
        if pid in keep:
            rows.append(keep[pid]); continue
        ta, sa = toks(a["name"]), sizes(a["name"])
        scored = []
        for s, sv in S.items():
            if sv["brand"] != a["brand"]:
                continue
            ts = toks(s)
            if not ts:
                continue
            c = len(ta & ts) / len(ts)
            ss = sizes(s)
            if sa and ss and not (sa & ss):
                c *= 0.25  # 용량이 다르면 다른 SKU 다. 강하게 깎는다.
            scored.append((c, len(ts), s))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        best = scored[0] if scored else (0, 0, "")
        second = scored[1][0] if len(scored) > 1 else 0
        ok = best[0] >= 0.9 and (best[0] - second) >= 0.15
        rows.append({
            "product_id": pid, "brand": a["brand"], "ad_product": a["name"],
            "sales_product": best[2] if ok else "",
            "candidate": "" if ok else best[2],
            "score": f"{best[0]:.2f}", "runner_up": f"{second:.2f}",
            "spend_30d": str(int(a["spend"])),
            "status": "auto" if ok else "review",
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["product_id", "brand", "ad_product", "sales_product", "candidate", "score", "runner_up", "spend_30d", "status"])
        w.writeheader(); w.writerows(rows)

    tot = sum(int(r["spend_30d"]) for r in rows) or 1
    for st in ("confirmed", "auto", "review"):
        sub = [r for r in rows if r["status"] == st]
        if sub:
            print(f"  {st:<10} {len(sub):>3}종  광고비 {sum(int(r['spend_30d']) for r in sub)/tot*100:>5.1f}%")
    print(f"\n→ {OUT}")
    print("  review 행은 매칭에 쓰이지 않습니다. sales_product 를 채우고 status 를 confirmed 로 바꾸세요.")


if __name__ == "__main__":
    main()
