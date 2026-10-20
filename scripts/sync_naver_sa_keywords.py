# -*- coding: utf-8 -*-
"""네이버 검색광고 **등록 키워드 목록** → naver_sa_keyword. 2026-10-20 신설.

실행: python sync_naver_sa_keywords.py [--apply] [--dump=파일.json]
  인자 없으면 dry-run(DB 미변경). --dump 를 주면 받은 행을 JSON 파일로도 쓴다(검산용).

왜
  대시보드 키워드 탭 「추가할 키워드」 칸은 "이미 등록된 키워드인가"를 가려야 한다.
  keyword_performance 는 노출이 있던 키워드만 들어 있어서 꺼진 키워드·노출 0 키워드를
  "미등록"으로 읽는다. 그래서 계정의 실제 등록 목록을 매일 통째로 받아 둔다.
  기준 문서: Work/PPMI/projects/검색광고-운영/reports/2026-10-20-추가키워드-기준.md (2-2절)
  SQL: ppmi-dashboard-v2/docs/sql/2026-10-20-add-keyword-candidates.sql

호출 수
  계정마다 /ncc/campaigns 1회 + /ncc/adgroups 1회 + 광고그룹마다 /ncc/keywords 1회(두 계정 합 약 185회)
  + /stats 를 키워드 100개씩(두 계정 합 약 40회). 1~2분.

★ /stats 는 실적이 0 인 id 를 응답에서 뺀다. 빠진 id 는 0 으로 채운다(빈칸이면 "모름"으로 읽힌다).
★ 받는 도중 API 가 하나라도 실패하면 아무것도 쓰지 않고 exit 1. 일부만 쓰면 빠진 키워드가
  "미등록"으로 보여 거짓 후보가 생긴다. 계정마다 upsert 한 번(한 문장)이라 절반만 들어가는 일이 없다.
★ 표가 아직 없으면(SQL 실행 전) 경고만 찍고 exit 0. daily-sync 실패 알림을 띄우지 않는다.
★ 읽기 전용. 계정에 쓰기(등록·입찰·잠금)는 하지 않는다.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from naver_sa_api import ACCOUNTS, use_account, api_get  # noqa: E402

APPLY = "--apply" in sys.argv
DUMP = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--dump=")), None)

TABLE = "naver_sa_keyword"
SQL_PATH = "ppmi-dashboard-v2/docs/sql/2026-10-20-add-keyword-candidates.sql"
SB_URL = os.environ.get("SUPABASE_URL") or "https://phcfydxgwkmjiogerqmm.supabase.co"
# sync_naver_keywords.py 와 같은 anon 기본값(워크플로에 SUPABASE 시크릿이 없다).
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

# ACCOUNTS 의 이름 → raw_naver_search_term 의 account 값. 두 표를 같은 값으로 붙인다.
ACCOUNT_KEY = {"pet": "main", "balancelab": "balancelab"}

# 밸런스랩 계정에 얹힌 그룹사 캠페인. 기준 문서 1-1절 그대로(이름 일치).
# ★ bl_campaign_map.OTHER_BIZ 와 다르다. 저쪽은 '99.브랜드' 도 빼지만, 10-14 부터 '밸런스랩'
#   키워드가 99.브랜드 캠페인에 등록돼 있어 여기서는 밸런스랩으로 둔다(기준 문서 2-2절).
GROUP_CAMPAIGNS = {"와이에스환경기술연구소", "한국반려동물안전인증센터", "S99.벌크", "수은세상"}

STATS_BATCH = 100        # /stats ids 상한
STATS_DAYS = 30          # 어제까지 30일
LIVE = "ELIGIBLE"

_KST = datetime.now(timezone.utc) + timedelta(hours=9)
TODAY = _KST.strftime("%Y-%m-%d")
STATS_UNTIL = (_KST - timedelta(days=1)).strftime("%Y-%m-%d")
STATS_SINCE = (_KST - timedelta(days=STATS_DAYS)).strftime("%Y-%m-%d")


def norm(s):
    """소문자 + 공백 제거. settings/search-ads/sa_doctor.norm 과 같다."""
    return (s or "").strip().lower().replace(" ", "")


def brand_of(account, campaign):
    """캠페인 이름 → 브랜드. 기준 문서 2-2절 규칙.

    ★ sync_naver_keywords.brand_from_campaign 과 다르다(저쪽은 모르는 이름을 nutty 로 민다).
      펫 계정에서 사입·너티가 아닌 캠페인은 아이언펫 캠페인이다(전부 꺼져 있다).
    """
    name = campaign or ""
    if account == "balancelab":
        if name in GROUP_CAMPAIGNS:
            return "group"
        if name.startswith("2023_아이언펫"):
            return "ironpet"
        return "balancelab"
    if "사입" in name:
        return "saip"
    if "너티" in name:
        return "nutty"
    return "ironpet"


def as_list(res):
    if isinstance(res, list):
        return res
    if isinstance(res, dict):
        return res.get("data", [])
    return []


def collect(acct):
    """한 계정의 등록 키워드 전체. 실패하면 예외(호출부가 exit 1)."""
    account = ACCOUNT_KEY[acct["name"]]
    campaigns = {c["nccCampaignId"]: c for c in as_list(api_get("/ncc/campaigns"))}
    adgroups = as_list(api_get("/ncc/adgroups"))
    calls = 2

    rows = []
    for ag in adgroups:
        cmp = campaigns.get(ag.get("nccCampaignId"))
        if cmp is None:
            continue  # 지워진 캠페인의 그룹. 등록으로 보지 않는다
        kws = as_list(api_get("/ncc/keywords", {"nccAdgroupId": ag["nccAdgroupId"]}))
        calls += 1
        for k in kws:
            use_group = bool(k.get("useGroupBidAmt"))
            group_bid = int(ag.get("bidAmt") or 0)
            rows.append({
                "account": account,
                "keyword_id": k["nccKeywordId"],
                "keyword": k.get("keyword") or "",
                "keyword_norm": norm(k.get("keyword")),
                "brand": brand_of(account, cmp.get("name")),
                "campaign_id": cmp["nccCampaignId"],
                "campaign": cmp.get("name"),
                "campaign_tp": cmp.get("campaignTp"),
                "campaign_status": cmp.get("status"),
                "campaign_lock": bool(cmp.get("userLock")),
                "adgroup_id": ag["nccAdgroupId"],
                "adgroup": ag.get("name"),
                "adgroup_status": ag.get("status"),
                "adgroup_lock": bool(ag.get("userLock")),
                "status": k.get("status"),
                "status_reason": k.get("statusReason"),
                "keyword_lock": bool(k.get("userLock")),
                "use_group_bid": use_group,
                "bid": group_bid if use_group else int(k.get("bidAmt") or 0),
                "group_bid": group_bid,
                "reg_tm": k.get("regTm"),
                "edit_tm": k.get("editTm"),
                "is_live": k.get("status") == LIVE and ag.get("status") == LIVE and cmp.get("status") == LIVE,
                "imp_30d": 0, "clk_30d": 0, "cost_30d": 0,
                "seen_on": TODAY,
            })

    # 30일 실적. 응답에 없는 id 는 위에서 넣은 0 그대로 둔다.
    by_id = {r["keyword_id"]: r for r in rows}
    ids = list(by_id)
    for i in range(0, len(ids), STATS_BATCH):
        res = api_get("/stats", {
            "ids": ids[i:i + STATS_BATCH],
            "fields": json.dumps(["impCnt", "clkCnt", "salesAmt"]),  # salesAmt = 광고비(네이버 명명)
            "timeRange": json.dumps({"since": STATS_SINCE, "until": STATS_UNTIL}),
        })
        calls += 1
        for it in as_list(res):
            r = by_id.get(it.get("id"))
            if r is None:
                continue
            r["imp_30d"] = int(it.get("impCnt") or 0)
            r["clk_30d"] = int(it.get("clkCnt") or 0)
            r["cost_30d"] = int(float(it.get("salesAmt") or 0))

    print(f"  [{account}] 캠페인 {len(campaigns)}개 · 광고그룹 {len(adgroups)}개 · 키워드 {len(rows)}개 · API {calls}회")
    return account, rows


def table_missing(exc):
    """PostgREST 가 표를 못 찾을 때(PGRST205) 또는 Postgres 42P01."""
    code = getattr(exc, "code", None)
    if code in ("PGRST205", "42P01"):
        return True
    text = str(exc)
    return ("PGRST205" in text or "42P01" in text) and TABLE in text


def main():
    sb = None
    if APPLY:
        from supabase import create_client
        sb = create_client(SB_URL, SB_KEY)
        # 표가 없으면 API 를 185번 부를 이유가 없다. 먼저 본다.
        try:
            sb.table(TABLE).select("keyword_id").limit(1).execute()
        except Exception as e:  # noqa: BLE001
            if table_missing(e):
                print(f"WARN {TABLE} 표가 아직 없습니다. 수집을 건너뜁니다(실패로 치지 않음).")
                print(f"     Supabase SQL Editor 에서 {SQL_PATH} 를 실행하면 다음 회차부터 쌓입니다.")
                return 0
            raise

    print(f"📅 수집일 {TODAY} · 30일 실적 {STATS_SINCE} ~ {STATS_UNTIL}")
    collected = []
    for acct in ACCOUNTS:
        if not use_account(acct["cfg"]):
            # 한 계정이 빠지면 그 계정 키워드가 전부 "미등록"으로 보인다. 조용히 넘기지 않는다.
            print(f"ERROR [{acct['name']}] 설정 없음 ({acct['cfg']})")
            return 1
        try:
            collected.append(collect(acct))
        except Exception as e:  # noqa: BLE001
            print(f"ERROR [{acct['name']}] 수집 실패, 아무것도 쓰지 않습니다: {e}")
            return 1

    total = sum(len(rows) for _, rows in collected)
    live = sum(1 for _, rows in collected for r in rows if r["is_live"])
    print(f"=== {TABLE} upsert 계획 {total}건 (라이브 {live}건) ===")

    if DUMP:
        json.dump([r for _, rows in collected for r in rows], open(DUMP, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  덤프: {DUMP}")

    if not APPLY:
        print("(dry-run) --apply 로 반영.")
        return 0

    for account, rows in collected:
        if not rows:
            # 키워드 0개는 계정 구조가 비었거나 응답이 이상한 것. 0을 쓰지 않는다.
            print(f"ERROR [{account}] 키워드 0개. 쓰지 않습니다.")
            return 1
        sb.table(TABLE).upsert(rows, on_conflict="account,keyword_id").execute()
        print(f"  [{account}] {len(rows)}건 upsert 완료")
    print("[OK]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
