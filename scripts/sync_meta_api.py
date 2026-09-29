"""Meta(Facebook/Instagram) 광고 insights → daily_ad_spend 직접 수집.

기존 sync_all.py의 sync_meta()는 SHEET_META 시트를 '읽기'만 하는데, 그 시트를
채우던 OpenClaw 크론이 죽어 데이터가 끊김. 이 스크립트는 Meta Graph API에서
일별 insights를 직접 끌어와 DB에 적재 → 시트 의존 제거, 완전 자동.

토큰: 환경변수 META_ADS_TOKEN (System User 토큰 권장; 현재는 User 토큰)
계정: META_{NUTTY,IRONPET,BALANCELAB}_AD_ACCOUNT (없으면 알려진 기본값)
사용: python sync_meta_api.py [since YYYY-MM-DD]  (기본 최근 30일)
"""
import os
import re
import json
import sys
import datetime

import requests
from supabase import create_client

# 같은 폴더 모듈(bl_campaign_map)을 CI 에서도 import 할 수 있게.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bl_campaign_map import classify as bl_classify

sys.stdout.reconfigure(encoding="utf-8")

GRAPH = "https://graph.facebook.com/v19.0"
TOKEN = os.environ.get("META_ADS_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)

ACCOUNTS = {
    "nutty": os.environ.get("META_NUTTY_AD_ACCOUNT", "act_1510647003433200"),
    "ironpet": os.environ.get("META_IRONPET_AD_ACCOUNT", "act_8188388757843816"),
    "balancelab": os.environ.get("META_BALANCELAB_AD_ACCOUNT", "act_276181463299827"),
}

DRY_RUN = os.environ.get("DRY_RUN") == "1"
PURCHASE_TYPES = {"purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"}


def num(v):
    try:
        return float(v)
    except Exception:
        return 0.0


def extract(actions, value=False):
    """actions/action_values 리스트에서 구매 전환 합산"""
    total = 0.0
    for a in actions or []:
        if a.get("action_type") in PURCHASE_TYPES:
            total += num(a.get("value"))
    return total



# ── 캠페인명 → 제품 ────────────────────────────────────────────────────────
# 실제 형식(2026-09-29 광고관리자 실측, 3계정 169개):
#   접두어 [N]/[I]/[Q] 가 붙거나 안 붙고, 뒤 공백도 섞인다
#     "[N]스트레스제로껌_구매전환_260415" vs "[N] 너티 퓨레 백원딜 프로모션_260406"
#   구분자는 언더바. 점은 안 쓴다. 제품명 자체에 공백이 들어간다("큐모발검사 뉴트리션")
#   최신 규칙은 제품명_목적_(방식)_(소구점)_YYMMDD, 끝 6자리 날짜가 거의 항상 붙는다
#   ★ 제품명이 아예 없는 이름도 많다: "[I]구매전환_260401", "트래픽_사전예약_260810"
#
# ★ 못 가르면 폴백하지 않고 None 을 돌려준다. 목적어만 있는 캠페인을 아무 제품에 붙이면
#   그 제품 ROAS 가 조용히 틀린다. 호출부가 집행액과 함께 경고로 드러낸다.
_PREFIX = re.compile(r"^\[[NIQ]\]\s*")
_TAIL_DATE = re.compile(r"_\d{6}(?:#\d+(?:/\d+)?)*\s*$")
# 첫 토큰이 이것들이면 제품이 아니라 목적어다.
_PURPOSE = re.compile(r"^(구매전환|전환|트래픽|리타게팅|리타겟팅|장바구니|잠재고객|인지도|도달|CBO|ABO|참여)")


def product_from_campaign(name: str):
    """캠페인명 → 제품명. 못 가르면 None.

    밸런스랩 검사 제품은 bl_campaign_map 의 규칙을 그대로 쓴다. 규칙을 여기 복제하면
    다음에 제품이 늘 때 한쪽만 고쳐져 갈라진다(타액·음식물과민증이 전부 모발로 합산되던
    2026-08 사고가 그 형태였다).
    """
    raw = str(name or "").strip()
    if not raw:
        return None
    # 1) 밸런스랩 검사 라인은 내용으로 잡는다(접두어·순서와 무관).
    brand, product = bl_classify(raw)
    if product:
        return product
    # 2) 접두어·꼬리 날짜를 떼고 첫 토큰을 본다.
    core = _TAIL_DATE.sub("", _PREFIX.sub("", raw)).strip()
    if not core:
        return None
    first = core.split("_")[0].strip()
    if not first or _PURPOSE.match(first):
        return None
    # 3) 제품 정본에 있는 이름이면 그것으로 정규화한다(표기 흔들림 흡수).
    for item in _master_products():
        if item and item in first:
            return item
    # 4) 정본에 없지만 목적어도 아니면 첫 토큰을 제품명으로 쓴다.
    #    새 제품이 광고부터 시작되는 경우가 있어 버리지 않는다. 대신 정본에 없다는 건
    #    호출부가 '상품 목록 시트에 추가하라'로 드러낸다.
    return first


_MASTER_CACHE = None


def _master_products():
    """제품 정본('상품 목록' 시트 → product_master.json)의 제품명 목록. 없으면 빈 목록."""
    global _MASTER_CACHE
    if _MASTER_CACHE is None:
        try:
            path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "data", "product_master.json")
            items = json.load(open(path, encoding="utf-8")).get("items", [])
            # 긴 이름을 먼저 봐야 "큐모발검사"가 "큐모발검사 뉴트리션"을 가로채지 않는다.
            _MASTER_CACHE = sorted({i.get("product", "") for i in items if i.get("product")},
                                   key=len, reverse=True)
        except Exception:
            _MASTER_CACHE = []
    return _MASTER_CACHE


def fetch_insights(acct, since, until, level="campaign"):
    """일별 insights.

    ★ level 기본값을 account → campaign 으로 바꿨다(2026-09-29).
      캠페인명에 제품명이 들어 있는데 계정 합계만 받아와서 제품 축을 만들 수 없었다.
      브랜드 합계는 캠페인 행을 날짜별로 더해서 그대로 만든다(값은 동일).
      campaign_name 이 없으면(계정 레벨 폴백) 제품 축만 비고 합계는 살아 있다.
    """
    fields = "spend,impressions,clicks,actions,action_values"
    if level == "campaign":
        fields += ",campaign_id,campaign_name"
    rows, url = [], f"{GRAPH}/{acct}/insights"
    params = {
        "fields": fields,
        "time_increment": 1,
        "time_range": '{"since":"%s","until":"%s"}' % (since, until),
        "level": level,
        "access_token": TOKEN,
        "limit": 500,
    }
    while url:
        j = requests.get(url, params=params, timeout=40).json()
        if "error" in j:
            print(f"  ❌ {acct}: {j['error'].get('message')}")
            break
        rows += j.get("data", [])
        url = j.get("paging", {}).get("next")
        params = None
    return rows


def main():
    if not TOKEN:
        print("❌ META_ADS_TOKEN 없음"); sys.exit(1)
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    since = sys.argv[1] if len(sys.argv) > 1 else (
        datetime.datetime.now() - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_rows = []
    product_rows = []          # 제품 축(ad_product_performance). 캠페인명에서 제품을 가른다.
    unmatched = {}             # 제품을 못 가른 캠페인 → 집행액. 폴백하지 않고 드러낸다.
    for brand, acct in ACCOUNTS.items():
        data = fetch_insights(acct, since, today)
        # 캠페인 행을 날짜별로 더해 브랜드 합계를 만든다. 기존 계정 레벨 값과 같아야 한다.
        by_date = {}
        for d in data:
            date = d.get("date_start")
            if not date:
                continue
            spend = num(d.get("spend"))
            impressions = int(num(d.get("impressions")))
            clicks = int(num(d.get("clicks")))
            conversions = int(extract(d.get("actions")))
            conv_value = extract(d.get("action_values"))

            cname = d.get("campaign_name") or ""
            if cname:
                product = product_from_campaign(cname)
                if product and (spend > 0 or conv_value > 0):
                    product_rows.append({
                        "date": date, "channel": "meta", "brand": brand,
                        "product_id": f"meta:{d.get('campaign_id') or cname}",
                        "product_name": product, "lineup": product,
                        "spend": spend, "impressions": impressions, "clicks": clicks,
                        "conversions": conversions, "conversion_value": conv_value,
                        "roas": conv_value / spend if spend > 0 else 0,
                        "ctr": clicks / impressions * 100 if impressions > 0 else 0,
                        "cpc": spend / clicks if clicks > 0 else 0,
                    })
                elif not product and spend > 0:
                    unmatched[cname] = unmatched.get(cname, 0) + spend

            e = by_date.setdefault(date, {"spend": 0.0, "impressions": 0, "clicks": 0,
                                          "conversions": 0, "conversion_value": 0.0})
            e["spend"] += spend; e["impressions"] += impressions; e["clicks"] += clicks
            e["conversions"] += conversions; e["conversion_value"] += conv_value

        n = 0
        for date, d in sorted(by_date.items()):
            spend = d["spend"]; impressions = d["impressions"]; clicks = d["clicks"]
            conversions = d["conversions"]; conv_value = d["conversion_value"]
            all_rows.append({
                "date": date, "brand": brand, "channel": "meta",
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "conversions": conversions, "conversion_value": conv_value,
                "roas": conv_value / spend if spend > 0 else 0,
                "ctr": clicks / impressions * 100 if impressions > 0 else 0,
                "cpc": spend / clicks if clicks > 0 else 0,
            })
            n += 1
        print(f"  {brand} ({acct}): {n}일 수집 (총 spend {sum(num(x.get('spend')) for x in data):,.0f})")

    print(f"\n총 {len(all_rows)}행 [{since} ~ {today}]")
    if DRY_RUN:
        for r in all_rows[:6]:
            print("  ", {k: r[k] for k in ("date", "brand", "spend", "clicks", "conversions", "conversion_value")})
        return

    # ★ 전 계정 0행 = 토큰 만료/권한 문제 → 정직하게 ok=False (가짜 🟢 방지)
    if not all_rows:
        print("⚠ 메타 0행 수집 (토큰 만료/권한 문제 추정) → 하트비트 ok=False")
        try:
            from heartbeat import record as hb
            hb("meta", ok=False, rows=0, note="0 rows collected (token expired?)")
        except Exception:
            pass
        sys.exit(1)

    for i in range(0, len(all_rows), 200):
        sb.table("daily_ad_spend").upsert(all_rows[i:i + 200], on_conflict="date,brand,channel").execute()
    print(f"✅ daily_ad_spend meta {len(all_rows)}행 upsert 완료")

    if unmatched:
        print(f"⚠ 캠페인명에서 제품을 못 가른 집행 {len(unmatched)}건 (목적어만 있는 이름):")
        for cn, sp in sorted(unmatched.items(), key=lambda x: -x[1])[:6]:
            print(f"   {cn}  {int(sp):,}원")
    if product_rows:
        try:
            for i in range(0, len(product_rows), 200):
                sb.table("ad_product_performance").upsert(
                    product_rows[i:i + 200], on_conflict="date,channel,brand,product_id").execute()
            print(f"📦 ad_product_performance meta {len(product_rows)}행 upsert 완료")
        except Exception as pe:
            # 제품 축 실패가 브랜드 합계까지 막으면 안 된다.
            print(f"⚠ 제품 축 적재 실패(브랜드 합계는 반영됨): {pe}")
    try:
        from heartbeat import record as hb
        latest = max((r["date"] for r in all_rows), default=None)
        hb("meta", ok=True, rows=len(all_rows), latest_date=latest)
    except Exception:
        pass


if __name__ == "__main__":
    main()
