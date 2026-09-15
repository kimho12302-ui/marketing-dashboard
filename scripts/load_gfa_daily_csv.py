# -*- coding: utf-8 -*-
"""GFA 상품별 일별 CSV → daily_ad_spend(브랜드 합계) 적재.

네이버 GFA 는 상품 단위로만 전환매출을 주고, 캠페인명으로는 브랜드를 가를 수 없다
(한 캠페인에 사입+너티가 섞임 — gfa_brand_map.py 참고). 그래서 상품 단위로 받아
상품명으로 브랜드를 판정한 뒤 브랜드 합계로 눌러 넣는다.

제품 축 원본은 ad_product_performance 테이블이 생기면 별도로 적재한다
(migrations/2026-09-15_ad_product_performance.sql).

기본은 dry-run. --apply 를 줘야 쓴다.
"""
import csv, sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gfa_brand_map import brand_from_product
from supabase import create_client

APPLY = "--apply" in sys.argv
paths = [a for a in sys.argv[1:] if not a.startswith("--")]
if not paths:
    sys.exit("사용법: load_gfa_daily_csv.py <csv> [--apply] [--skip-date YYYY-MM-DD]")
CSV = paths[0]
skip = set()
for i, a in enumerate(sys.argv):
    if a == "--skip-date" and i + 1 < len(sys.argv):
        skip.add(sys.argv[i + 1])

SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
sb = create_client(SB_URL, SB_KEY)


def num(v):
    s = str(v or "").replace(",", "").replace("₩", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig")))
agg = collections.defaultdict(lambda: dict(spend=0.0, impressions=0, clicks=0, conversions=0, conversion_value=0.0))
unmatched = collections.Counter()
for r in rows:
    if r["date"] in skip:
        continue
    b, _line = brand_from_product(r["product_name"])
    if b is None:
        # ★ 폴백 금지. 모르는 상품을 아무 브랜드에 넣으면 어느 브랜드가 틀렸는지 영영 모른다.
        unmatched[r["product_name"][:50]] += num(r["cost"])
        continue
    e = agg[(r["date"], b)]
    e["spend"] += num(r["cost"])
    e["impressions"] += int(num(r["impressions"]))
    e["clicks"] += int(num(r["clicks"]))
    e["conversions"] += int(num(r["conversions"]))
    e["conversion_value"] += num(r["conversion_value"])

paid_unmatched = {k: v for k, v in unmatched.items() if v > 0}
if paid_unmatched:
    print("❌ 집행액이 있는데 브랜드를 못 가른 상품이 있습니다. gfa_brand_map.py 에 추가하세요:")
    for k, v in sorted(paid_unmatched.items(), key=lambda x: -x[1]):
        print(f"   {k}  {int(v):,}원")
    sys.exit(1)

payload = []
for (d, b), e in sorted(agg.items()):
    spend = round(e["spend"])
    payload.append({
        "date": d, "brand": b, "channel": "gfa",
        "spend": spend, "impressions": e["impressions"], "clicks": e["clicks"],
        "conversions": e["conversions"], "conversion_value": round(e["conversion_value"]),
        "roas": (e["conversion_value"] / spend) if spend else 0,
        "ctr": (e["clicks"] / e["impressions"] * 100) if e["impressions"] else 0,
        "cpc": (spend / e["clicks"]) if e["clicks"] else 0,
    })

# 기존값과 비교해서 무엇이 바뀌는지 먼저 보여준다.
dates = sorted({p["date"] for p in payload})
existing = {}
for r in (sb.table("daily_ad_spend").select("date,brand,spend,conversion_value")
          .eq("channel", "gfa").gte("date", dates[0]).lte("date", dates[-1]).execute().data or []):
    existing[(r["date"], r["brand"])] = r

print(f"=== GFA 적재 계획 {len(payload)}건 ({dates[0]} ~ {dates[-1]}) ===")
print(f"{'날짜':<12}{'브랜드':<9}{'광고비':>10}{'전환매출':>12}  변화")
for p in payload:
    prev = existing.get((p["date"], p["brand"]))
    if prev is None:
        note = "신규"
    elif int(prev["spend"] or 0) == p["spend"] and int(prev["conversion_value"] or 0) == p["conversion_value"]:
        note = "동일"
    else:
        note = f"덮어씀 (기존 {int(prev['spend'] or 0):,}원 / {int(prev['conversion_value'] or 0):,}원)"
    print(f"{p['date']:<12}{p['brand']:<9}{p['spend']:>10,}{p['conversion_value']:>12,}  {note}")

print(f"\n합계 광고비 {sum(p['spend'] for p in payload):,}원 / 전환매출 {sum(p['conversion_value'] for p in payload):,}원")
if skip:
    print(f"제외한 날짜: {', '.join(sorted(skip))}")

if not APPLY:
    print("\n(dry-run) --apply 로 반영.")
    sys.exit(0)

for i in range(0, len(payload), 100):
    sb.table("daily_ad_spend").upsert(payload[i:i + 100], on_conflict="date,channel,brand").execute()
print(f"\n✅ {len(payload)}건 반영 완료.")
