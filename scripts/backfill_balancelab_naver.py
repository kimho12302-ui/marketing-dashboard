# -*- coding: utf-8 -*-
"""밸런스랩 네이버 SA 백필 (DB 만 갱신, 시트는 건드리지 않음).

sync_all.py 의 밸런스랩 블록과 같은 API를 쓰지만 이 스크립트는 DB만 쓴다.
sync_all.py 를 과거 구간으로 돌리면 시트 역동기화까지 함께 실행돼
2026-06-08 이전 시트 수정 금지 운영 규칙을 어기기 때문에 분리했다.

갱신 대상
  - daily_ad_spend (brand=balancelab, naver_search / naver_shopping)
  - ad_product_performance (brand=balancelab, 캠페인명 -> 제품, product_id=nvsa:캠페인ID)

2026-10-07 고친 것
  1. 밸런스랩 계정(800812)에 함께 있는 남의 캠페인(와이에스환경기술연구소, 한국반려동물안전인증센터,
     S99.벌크, 99.브랜드, 2023_아이언펫)을 bl_campaign_map.classify 로 뺀다. 예전 버전은 계정 전체를
     더해서 2026-01~08 대시보드 밸런스랩 네이버에 그 비용이 섞였다(1월 파워링크 340,153 중 77,011).
  2. 하루 한 번 /stats 에 캠페인 ID 를 모아 부른다(예전: 캠페인마다 1회).
  3. 조회 실패를 삼키지 않는다(예전 버전은 실패한 날을 조용히 0으로 넣었다).
     3회 재시도 후에도 실패하면 아무것도 쓰지 않고 멈춘다.
  4. 새 값이 0이어도 DB 에 기존 행이 있으면 0으로 덮어쓴다. 남의 캠페인만 돈 날이 그대로 남지 않게.

실행: python backfill_balancelab_naver.py START END [--apply]   (기본 dry-run, 월별 비교표 출력)
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta

import requests
from supabase import create_client

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bl_campaign_map import classify  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_PATH = os.path.expanduser("~/.naver-searchad-balancelab/config.json")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)
FIELDS = json.dumps(["impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt"])
METRICS = ("spend", "impressions", "clicks", "conversions", "conversion_value")

APPLY = "--apply" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) < 2:
    print("사용법: python backfill_balancelab_naver.py YYYY-MM-DD YYYY-MM-DD [--apply]")
    sys.exit(1)
START, END = args[0], args[1]

with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
    cfg = json.load(f)
API_KEY, API_SECRET = cfg["api_key"], cfg["api_secret"]
CUSTOMER_ID, BASE_URL = str(cfg["customer_id"]), cfg["base_url"]


def api_get(endpoint, params=None):
    last = None
    for attempt in range(3):
        ts = str(int(time.time() * 1000))
        sign = base64.b64encode(
            hmac.new(API_SECRET.encode(), f"{ts}.GET.{endpoint}".encode(), hashlib.sha256).digest()
        ).decode()
        headers = {"X-API-KEY": API_KEY, "X-Customer": CUSTOMER_ID, "X-Timestamp": ts, "X-Signature": sign}
        try:
            r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # 재시도 후에도 실패하면 위로 올린다
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{endpoint} 조회 실패 (3회): {last}")


def rates(d):
    s, i, c, v = d["spend"], d["impressions"], d["clicks"], d["conversion_value"]
    return {"roas": v / s if s > 0 else 0, "ctr": c / i * 100 if i > 0 else 0, "cpc": s / c if c > 0 else 0}


def collect():
    campaigns = api_get("/ncc/campaigns")
    meta, skipped = {}, defaultdict(float)
    for c in campaigns:
        brand, product = classify(c.get("name", ""))
        channel = "naver_shopping" if c.get("campaignTp") == "SHOPPING" else "naver_search"
        meta[c["nccCampaignId"]] = (brand, product, channel, c.get("name", ""))
    ids = list(meta)
    start_dt = datetime.strptime(START, "%Y-%m-%d")
    days = (datetime.strptime(END, "%Y-%m-%d") - start_dt).days + 1
    print(f"캠페인 {len(ids)}개 / 구간 {START} ~ {END} ({days}일)")

    agg, products = {}, []
    for off in range(days):
        target = (start_dt + timedelta(days=off)).strftime("%Y-%m-%d")
        by_ch = {ch: dict.fromkeys(METRICS, 0) for ch in ("naver_search", "naver_shopping")}
        for i in range(0, len(ids), 50):
            st = api_get("/stats", {"ids": ids[i:i + 50], "fields": FIELDS,
                                    "timeRange": json.dumps({"since": target, "until": target}),
                                    "timeIncrement": "TIME_INCREMENT_DAILY"})
            for it in (st if isinstance(st, list) else st.get("data", [])):
                cid = it["id"]
                brand, product, ch, name = meta[cid]
                v = {"spend": float(it.get("salesAmt", 0)), "impressions": int(it.get("impCnt", 0)),
                     "clicks": int(it.get("clkCnt", 0)), "conversions": int(it.get("ccnt", 0)),
                     "conversion_value": float(it.get("convAmt", 0))}
                if brand != "balancelab":
                    skipped[name] += v["spend"]
                    continue
                for k in METRICS:
                    by_ch[ch][k] += v[k]
                if product and (v["spend"] > 0 or v["conversion_value"] > 0):
                    products.append({"date": target, "channel": ch, "brand": "balancelab",
                                     "product_id": "nvsa:" + cid, "product_name": product,
                                     "lineup": product, **v, **rates(v)})
        for ch, d in by_ch.items():
            agg[(target, ch)] = d
        if off % 20 == 0:
            print(f"  ... {target}")
    return agg, products, skipped


def existing_rows(sb):
    out, off = {}, 0
    while True:
        r = (sb.table("daily_ad_spend").select("date,channel,spend").eq("brand", "balancelab")
             .in_("channel", ["naver_search", "naver_shopping"]).gte("date", START).lte("date", END)
             .range(off, off + 999).execute().data)
        for x in r:
            out[(x["date"], x["channel"])] = float(x["spend"] or 0)
        if len(r) < 1000:
            return out
        off += 1000


def main():
    agg, products, skipped = collect()
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    old = existing_rows(sb)
    rows = []
    for (d, ch), v in sorted(agg.items()):
        if v["spend"] <= 0 and v["conversion_value"] <= 0 and (d, ch) not in old:
            continue
        rows.append({"date": d, "brand": "balancelab", "channel": ch, **v, **rates(v)})

    print("\n월 | 채널 | DB 기존 | 새 값 | 차이")
    months = defaultdict(lambda: [0.0, 0.0])
    for (d, ch), s in old.items():
        months[(d[:7], ch)][0] += s
    for r in rows:
        months[(r["date"][:7], r["channel"])][1] += r["spend"]
    for k in sorted(months):
        o, n = months[k]
        print(f"{k[0]} | {k[1]} | {o:,.0f} | {n:,.0f} | {n - o:,.0f}")
    print("\n제외한 캠페인(밸런스랩 아님): " + ", ".join(f"{k} {v:,.0f}" for k, v in skipped.items() if v))
    print(f"daily_ad_spend {len(rows)}행 / ad_product_performance {len(products)}행")

    if not APPLY:
        print("[DRY-RUN] --apply 로 반영")
        return
    for i in range(0, len(rows), 200):
        sb.table("daily_ad_spend").upsert(rows[i:i + 200], on_conflict="date,brand,channel").execute()
    for i in range(0, len(products), 200):
        sb.table("ad_product_performance").upsert(products[i:i + 200],
                                                  on_conflict="date,channel,brand,product_id").execute()
    print("✅ 반영 완료")


if __name__ == "__main__":
    main()
