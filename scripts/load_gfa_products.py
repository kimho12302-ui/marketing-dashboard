# -*- coding: utf-8 -*-
"""GFA 상품별 CSV → ad_product_performance (제품 축 원장).

load_gfa_daily_csv.py 는 같은 CSV 를 '브랜드 합계'로 눌러 daily_ad_spend 에 넣는다.
이 스크립트는 같은 CSV 를 '상품 단위 그대로' 별도 테이블에 넣는다. 두 테이블은
역할이 다르다 — daily_ad_spend 는 기존 집계(매출·ROAS·페이싱)가 전부 걸려 있는
브랜드 원장이고, ad_product_performance 는 드릴다운 전용이다.
한 테이블에 섞으면 /api/ads 가 행 단위로 합산하므로 무조건 이중계상된다.

기본 dry-run. --apply 가 있어야 쓴다.
"""
import csv, sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gfa_brand_map import brand_from_product
from supabase import create_client

APPLY = "--apply" in sys.argv
paths = [a for a in sys.argv[1:] if not a.startswith("--")]
if not paths:
    sys.exit("사용법: load_gfa_products.py <csv> [--apply] [--skip-date YYYY-MM-DD]")
CSV_PATH = paths[0]
skip = {sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--skip-date" and i + 1 < len(sys.argv)}

SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
sb = create_client(SB_URL, SB_KEY)


def num(v):
    s = str(v or "").replace(",", "").replace("₩", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


rows_in = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
agg = collections.defaultdict(lambda: dict(spend=0.0, impressions=0, clicks=0, conversions=0, conversion_value=0.0, name="", lineup=None))
unmatched = collections.Counter()
for r in rows_in:
    if r["date"] in skip:
        continue
    brand, lineup = brand_from_product(r["product_name"])
    if brand is None:
        unmatched[r["product_name"][:50]] += num(r["cost"])
        continue
    # 같은 상품이 여러 캠페인에 걸쳐 있을 수 있다 → (date, brand, product_id) 로 합산.
    e = agg[(r["date"], brand, str(r["product_id"]).strip())]
    e["name"] = r["product_name"]
    e["lineup"] = lineup
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
for (d, brand, pid), e in sorted(agg.items()):
    spend = round(e["spend"])
    payload.append({
        "date": d, "channel": "gfa", "brand": brand,
        "product_id": pid, "product_name": e["name"], "lineup": e["lineup"],
        "spend": spend, "impressions": e["impressions"], "clicks": e["clicks"],
        "conversions": e["conversions"], "conversion_value": round(e["conversion_value"]),
        "roas": (e["conversion_value"] / spend) if spend else 0,
        "ctr": (e["clicks"] / e["impressions"] * 100) if e["impressions"] else 0,
        "cpc": (spend / e["clicks"]) if e["clicks"] else 0,
    })

dates = sorted({p["date"] for p in payload})
by_brand = collections.Counter(p["brand"] for p in payload)
print(f"=== ad_product_performance 적재 계획 {len(payload)}건 ({dates[0]} ~ {dates[-1]}) ===")
print("  브랜드별 행수:", dict(by_brand))
print(f"  합계 광고비 {sum(p['spend'] for p in payload):,}원 / 전환매출 {sum(p['conversion_value'] for p in payload):,}원")
print("\n  --- 기간 합산 ROAS 상위 8 ---")
prod = collections.defaultdict(lambda: [0, 0, ""])
for p in payload:
    a = prod[p["product_id"]]
    a[0] += p["spend"]; a[1] += p["conversion_value"]; a[2] = p["product_name"]
for pid, (c, v, nm) in sorted(prod.items(), key=lambda x: -(x[1][1] / x[1][0] if x[1][0] else 0))[:8]:
    print(f"    {nm[:34]:<36} {c:>9,}원 → {v:>10,}원  {(v/c if c else 0):>7.1f}x")

if not APPLY:
    print("\n(dry-run) --apply 로 반영.")
    sys.exit(0)

total = 0
for i in range(0, len(payload), 200):
    chunk = payload[i:i + 200]
    sb.table("ad_product_performance").upsert(chunk, on_conflict="date,channel,brand,product_id").execute()
    total += len(chunk)
print(f"\n✅ {total}건 적재 완료.")
