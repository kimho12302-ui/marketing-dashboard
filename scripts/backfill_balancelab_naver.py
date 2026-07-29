# -*- coding: utf-8 -*-
"""밸런스랩 네이버 SA 전환값 백필 (daily_ad_spend 만 갱신, 시트는 건드리지 않음).

sync_all.py 의 밸런스랩 블록과 같은 API를 쓰지만, 이 스크립트는 DB만 쓴다.
sync_all.py 를 과거 구간으로 돌리면 시트 역동기화까지 함께 실행돼
"2026-06-08 이전 시트 수정 금지" 운영 규칙을 어기기 때문에 분리했다.

배경: 밸런스랩 수집기가 stats fields 에 ccnt(전환수)·convAmt(전환매출)을 요청하지 않아
      밸런스랩 네이버 ROAS가 늘 0이었다. 필드는 sync_all.py 에서 고쳤고,
      과거분은 이 스크립트로 소급 수집한다.

실행: python backfill_balancelab_naver.py START END [--apply]   (기본 dry-run)
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

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_PATH = os.path.expanduser("~/.naver-searchad-balancelab/config.json")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)

APPLY = "--apply" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) < 2:
    print("사용법: python backfill_balancelab_naver.py YYYY-MM-DD YYYY-MM-DD [--apply]")
    sys.exit(1)
START, END = args[0], args[1]

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    cfg = json.load(f)
API_KEY, API_SECRET = cfg["api_key"], cfg["api_secret"]
CUSTOMER_ID, BASE_URL = cfg["customer_id"], cfg["base_url"]


def api_get(endpoint, params=None):
    ts = str(int(time.time() * 1000))
    sign = base64.b64encode(
        hmac.new(API_SECRET.encode(), f"{ts}.GET.{endpoint}".encode(), hashlib.sha256).digest()
    ).decode()
    headers = {
        "X-API-KEY": API_KEY, "X-Customer": CUSTOMER_ID,
        "X-Timestamp": ts, "X-Signature": sign, "Content-Type": "application/json",
    }
    r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


campaigns = api_get("/ncc/campaigns")
print(f"캠페인 {len(campaigns)}개")

start_dt = datetime.strptime(START, "%Y-%m-%d")
end_dt = datetime.strptime(END, "%Y-%m-%d")
days = (end_dt - start_dt).days + 1
print(f"구간 {START} ~ {END} ({days}일)")

rows = []
for off in range(days):
    target = (start_dt + timedelta(days=off)).strftime("%Y-%m-%d")
    by_channel = defaultdict(lambda: {"spend": 0.0, "impressions": 0, "clicks": 0,
                                      "conversions": 0, "conversion_value": 0.0})
    for c in campaigns:
        channel = "naver_shopping" if c.get("campaignTp", "") == "SHOPPING" else "naver_search"
        try:
            stats = api_get("/stats", params={
                "ids": [c["nccCampaignId"]],
                "fields": '["impCnt","clkCnt","salesAmt","ccnt","convAmt"]',
                "timeRange": json.dumps({"since": target, "until": target}),
                "timeIncrement": "TIME_INCREMENT_DAILY",
            })
            items = stats if isinstance(stats, list) else stats.get("data", [])
            for it in items:
                b = by_channel[channel]
                b["spend"] += float(it.get("salesAmt", 0))
                b["impressions"] += int(it.get("impCnt", 0))
                b["clicks"] += int(it.get("clkCnt", 0))
                b["conversions"] += int(it.get("ccnt", 0))
                b["conversion_value"] += float(it.get("convAmt", 0))
        except Exception:
            continue

    for channel, d in by_channel.items():
        if d["spend"] <= 0 and d["conversion_value"] <= 0:
            continue
        rows.append({
            "date": target, "brand": "balancelab", "channel": channel,
            "spend": d["spend"], "impressions": d["impressions"], "clicks": d["clicks"],
            "conversions": d["conversions"], "conversion_value": d["conversion_value"],
            "roas": d["conversion_value"] / d["spend"] if d["spend"] > 0 else 0,
            "ctr": d["clicks"] / d["impressions"] * 100 if d["impressions"] > 0 else 0,
            "cpc": d["spend"] / d["clicks"] if d["clicks"] > 0 else 0,
        })
    if off % 20 == 0:
        print(f"  ... {target} 까지 {len(rows)}행")

tot_spend = sum(r["spend"] for r in rows)
tot_val = sum(r["conversion_value"] for r in rows)
with_val = sum(1 for r in rows if r["conversion_value"] > 0)
print(f"\n총 {len(rows)}행  광고비 {tot_spend:,.0f}  전환값 {tot_val:,.0f}  "
      f"ROAS {(tot_val / tot_spend if tot_spend else 0):.2f}  (값>0 행 {with_val})")

if not APPLY:
    print("[DRY-RUN] --apply 로 반영")
    sys.exit(0)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
for i in range(0, len(rows), 200):
    sb.table("daily_ad_spend").upsert(rows[i:i + 200], on_conflict="date,brand,channel").execute()
print(f"✅ daily_ad_spend {len(rows)}행 upsert 완료")
