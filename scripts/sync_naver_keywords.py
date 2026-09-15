# -*- coding: utf-8 -*-
"""네이버 검색광고 **키워드 단위** 성과 → keyword_performance.

실행: python sync_naver_keywords.py [START END] [--apply]
  START END 생략 시 최근 7일. 예) python sync_naver_keywords.py 2026-09-01 2026-09-02 --apply

★ 왜 새로 만들었나 (2026-09)
  기존 keyword_performance 는 2026-05-04 에 멈춰 있었고, 그나마 들어있던 값도
  키워드가 아니라 **캠페인명**이었다('02.너티_파워링크', '사입_벌크' 등 실측 확인).
  즉 "수집 중단"이 아니라 애초에 키워드 단위였던 적이 없다. 이 스크립트가 진짜 키워드를 넣는다.

★ 구조
  캠페인(WEB_SITE=파워링크) → 광고그룹 → 키워드 → /stats 로 키워드별 노출·클릭·비용·전환.
  SHOPPING/BRAND_SEARCH 캠페인은 키워드가 없다(상품군·브랜드 기반) → 제외.
  /stats 는 단일 날짜 쿼리만 값을 돌려줘서(캠페인 수집기와 동일 제약) 날짜별로 돈다.
  광고그룹 단위로 키워드 id 를 묶어 1회 호출한다(키워드마다 호출하면 수천 회가 된다).
"""
import os, sys, re, json, time, hmac, hashlib, base64, requests
sys.stdout.reconfigure(encoding='utf-8')
from datetime import datetime, timedelta
from collections import defaultdict
from supabase import create_client

APPLY = "--apply" in sys.argv
_KST_NOW = datetime.utcnow() + timedelta(hours=9)
TODAY = _KST_NOW.strftime("%Y-%m-%d")
DEFAULT_WINDOW_DAYS = 7

_dates = [a for a in sys.argv[1:] if re.fullmatch("[0-9]{4}-[0-9]{2}-[0-9]{2}", a)]
if len(_dates) >= 2:
    START, END = _dates[0], _dates[1]
elif len(_dates) == 1:
    sys.exit(f"날짜를 2개 주세요 (START END). 받은 값: {_dates[0]}")
else:
    START = (_KST_NOW - timedelta(days=DEFAULT_WINDOW_DAYS - 1)).strftime("%Y-%m-%d")
    END = TODAY
if START > END:
    sys.exit(f"START({START}) 가 END({END}) 보다 뒤입니다.")
if END > TODAY:
    END = TODAY
print(f"📅 처리 범위 {START} ~ {END}" + ("" if len(_dates) >= 2 else f"  (기본 최근 {DEFAULT_WINDOW_DAYS}일)"))

CFG = os.path.expanduser("~/.naver-searchad/config.json")
SB_URL = os.environ.get("SUPABASE_URL") or "https://phcfydxgwkmjiogerqmm.supabase.co"
# 환경변수 우선, 없으면 레포 공통 상수. 워크플로에 SUPABASE 시크릿이 없어서
# env 필수로 두면 daily-sync 에서 매번 조용히 죽는다(continue-on-error: true).
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

cfg = json.load(open(CFG, encoding="utf-8"))
API_KEY, API_SECRET, CUSTOMER_ID = cfg["api_key"], cfg["api_secret"], str(cfg["customer_id"])
BASE_URL = cfg.get("base_url", "https://api.searchad.naver.com")


def api_get(endpoint, params=None, retry=3):
    for attempt in range(retry):
        try:
            ts = str(int(time.time() * 1000))
            sig = base64.b64encode(hmac.new(API_SECRET.encode(), f"{ts}.GET.{endpoint}".encode(), hashlib.sha256).digest()).decode()
            r = requests.get(BASE_URL + endpoint, headers={
                "X-API-KEY": API_KEY, "X-Customer": CUSTOMER_ID,
                "X-Timestamp": ts, "X-Signature": sig, "Content-Type": "application/json",
            }, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == retry - 1:
                raise
            time.sleep(1)


def brand_from_campaign(campaign: str) -> str:
    """sync_naver_sa.py 와 동일 규칙. '사입/벌크'를 '너티'보다 먼저 본다(2026-08 이중계상 사고)."""
    c = campaign.lower()
    if "사입" in c or "벌크" in c: return "saip"
    if "아이언펫" in c: return "ironpet"
    if "너티" in c or "사운드" in c or "하루루틴" in c: return "nutty"
    if "밸런스" in campaign or "큐모발" in campaign or "balancelab" in c: return "balancelab"
    return "nutty"


# ── 1. 구조 조회 (캠페인 → 광고그룹 → 키워드). 하루에 한 번만 하면 되므로 날짜 루프 밖. ──
campaigns = [c for c in api_get("/ncc/campaigns") if c.get("campaignTp") == "WEB_SITE"]
print(f"  파워링크 캠페인 {len(campaigns)}개")

groups = []  # (brand, adgroup_id, {keyword_id: keyword})
for c in campaigns:
    brand = brand_from_campaign(c.get("name", ""))
    for ag in (api_get("/ncc/adgroups", {"nccCampaignId": c["nccCampaignId"]}) or []):
        kws = api_get("/ncc/keywords", {"nccAdgroupId": ag["nccAdgroupId"]}) or []
        if kws:
            groups.append((brand, ag["nccAdgroupId"], {k["nccKeywordId"]: k["keyword"] for k in kws}))
print(f"  키워드 있는 광고그룹 {len(groups)}개 · 총 키워드 {sum(len(g[2]) for g in groups)}개")

# ── 2. 날짜별 × 광고그룹별 성과 ──
agg = defaultdict(lambda: {"impressions": 0, "clicks": 0, "cost": 0.0, "conversions": 0, "conversion_value": 0.0})
start_dt, end_dt = datetime.strptime(START, "%Y-%m-%d"), datetime.strptime(END, "%Y-%m-%d")
for off in range((end_dt - start_dt).days + 1):
    d = (start_dt + timedelta(days=off)).strftime("%Y-%m-%d")
    for brand, agid, idmap in groups:
        try:
            st = api_get("/stats", {
                "ids": list(idmap.keys()),
                # convAmt = 전환매출액. salesAmt 는 이름과 달리 '광고비'다(네이버 명명).
                # 이게 없으면 키워드별 ROAS 를 못 본다 - 어느 키워드가 돈을 벌었는지 판단 불가.
                "fields": '["impCnt","clkCnt","salesAmt","ccnt","convAmt"]',
                "timeRange": json.dumps({"since": d, "until": d}),
            })
        except Exception as e:
            print(f"  ⚠ [{d} {agid}] {e}")
            continue
        for it in (st if isinstance(st, list) else st.get("data", [])):
            kw = idmap.get(it.get("id"))
            if not kw:
                continue
            imp, clk = int(it.get("impCnt", 0)), int(it.get("clkCnt", 0))
            cost, conv = float(it.get("salesAmt", 0)), int(it.get("ccnt", 0))
            cval = float(it.get("convAmt", 0))
            # ★ cval 을 가드에 넣는다. 네이버가 전환을 클릭일이 아닌 날짜로 귀속시키면
            #   노출·클릭·비용이 0인 채 매출만 서는 행이 생길 수 있고, 그걸 버리면 ROAS 분자가
            #   조용히 사라진다. 2026-09-02~15 실측에선 그런 행이 0건이라 부풀 위험은 없었지만
            #   귀속 규칙 자체는 확인하지 못했다. 매출이 사라지는 쪽이 훨씬 비싸다.
            if imp == 0 and clk == 0 and cost == 0 and cval == 0:
                continue  # 완전 무실적 행은 넣지 않는다 (테이블이 0행으로 부풀어 조회가 느려진다)
            e = agg[(d, brand, "naver_search", kw)]
            e["impressions"] += imp; e["clicks"] += clk
            e["cost"] += cost; e["conversions"] += conv; e["conversion_value"] += cval

rows = []
for (d, brand, platform, kw), v in agg.items():
    imp, clk, cost = v["impressions"], v["clicks"], v["cost"]
    rows.append({
        "date": d, "brand": brand, "platform": platform, "keyword": kw,
        "impressions": imp, "clicks": clk, "cost": int(cost), "conversions": v["conversions"],
        # ctr 컬럼이 numeric(6,4) 라 100 이상이 안 들어간다(클릭==노출이면 100%).
        # 99.99 로 클램프한다 — 이 구간은 어차피 "전부 클릭됨"이라 소수점 정밀도가 의미 없다.
        "ctr": min(99.99, round(clk / imp * 100, 2)) if imp else 0,
        "cpc": int(cost / clk) if clk else 0,
        "conversion_value": int(v["conversion_value"]),
    })
rows.sort(key=lambda r: (r["date"], r["brand"], -r["cost"], -r["impressions"]))

# 미리보기는 '돈을 번 키워드'와 '돈만 쓴 키워드'를 먼저 보여준다. 날짜순 상위 12줄만 찍으면
# 첫 날 저비용 키워드만 나와서 수집이 제대로 됐는지 눈으로 확인이 안 된다(2026-09-15).
_top = sorted(rows, key=lambda r: -r["conversion_value"])[:6]
_burn = sorted([r for r in rows if r["conversion_value"] == 0], key=lambda r: -r["cost"])[:6]

print()
print(f"=== keyword_performance upsert 계획 {len(rows)}건 ===")
print("--- 전환매출 상위 6 / 비용만 쓴 상위 6 ---")
for r in (_top + _burn):
    _roas = (r["conversion_value"] / r["cost"]) if r["cost"] else 0
    print(f"  {r['date']} {r['brand']:<10} {r['keyword'][:20]:<22} 노출{r['impressions']:>6} 클릭{r['clicks']:>4} 비용{r['cost']:>8,} 전환매출{r['conversion_value']:>9,} ROAS{_roas:>7.2f}x")
print(f"  ... 전체 {len(rows)}건")

if APPLY:
    sb = create_client(SB_URL, SB_KEY)

    # ★ conversion_value 컬럼이 아직 없는 DB 에서도 죽지 않게 한다.
    #   컬럼 없이 그대로 쏘면 PostgREST 가 PGRST204 로 **청크 200건 전체**를 거부하는데,
    #   daily-sync.yml 이 continue-on-error: true 라 키워드 수집이 통째로 죽어도 아무도 모른다.
    #   첫 실패에서 한 번 감지하고, 없으면 그 필드만 빼고 계속 간다(경고는 남긴다).
    #   DDL 을 실행하면 코드 수정 없이 그날부터 전환매출이 들어온다:
    #   ALTER TABLE keyword_performance ADD COLUMN conversion_value NUMERIC(12,0) NOT NULL DEFAULT 0;
    has_cval = True

    def _push(chunk):
        global has_cval
        payload = chunk if has_cval else [
            {k: v for k, v in r.items() if k != "conversion_value"} for r in chunk
        ]
        try:
            sb.table("keyword_performance").upsert(
                payload, on_conflict="date,brand,platform,keyword").execute()
        except Exception as exc:
            if has_cval and "conversion_value" in str(exc):
                has_cval = False
                print("  WARN keyword_performance.conversion_value 컬럼이 없습니다 - 전환매출을 빼고 적재합니다.")
                print("       ALTER TABLE keyword_performance ADD COLUMN conversion_value NUMERIC(12,0) NOT NULL DEFAULT 0;")
                return _push(chunk)
            raise

    total = 0
    for i in range(0, len(rows), 200):
        chunk = rows[i:i+200]
        _push(chunk)
        total += len(chunk)
    print()
    print(f'[OK] {total}건 upsert 완료.' + ('' if has_cval else '  (전환매출 제외 - 컬럼 없음)'))
else:
    print("\n(dry-run) --apply 로 반영.")
