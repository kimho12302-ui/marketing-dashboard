"""네이버 검색광고 **실제 검색어** → raw_naver_search_term. 2026-09-18 신설.

실행: python sync_naver_search_terms.py [START END] [--account main|balancelab|all] [--apply]
  기본 최근 7일, 두 계정 모두, dry-run(DB 미변경). 예) python sync_naver_search_terms.py 2026-08-19 2026-09-17 --apply

왜
  keyword_performance 는 우리가 **등록한** 키워드 기준이다. 사람들이 실제로 친 검색어는 따로 받아야 한다.
  쿠팡 키워드 탭처럼 상품별·검색어별로 보려고 원천을 쌓는다(대시보드 키워드 탭).

원천(/stat-reports, 하루 한 장씩)
  EXPKEYWORD                        파워링크 검색어. 네이버는 검색어 단위 전환을 주지 않는다(2026-09-18 확인)
  SHOPPINGKEYWORD_DETAIL            쇼핑검색 검색어
  SHOPPINGKEYWORD_CONVERSION_DETAIL 쇼핑검색 검색어별 전환(purchase·add_to_cart)

칸 뜻(2026-09-18 실측, 09-16 보고서 합계가 캠페인 /stats 와 일치)
  EXPKEYWORD             0날짜 1고객 2캠페인 3광고그룹 4검색어 5매체 6기기 7(미사용) 8노출 9클릭 10광고비 11동영상조회
  SHOPPINGKEYWORD_DETAIL 0날짜 1고객 2캠페인 3광고그룹 4검색어 5소재 6비즈채널 7·8(미사용) 9매체 10기기 11노출 12클릭 13광고비 14(미사용) 15동영상조회
  *_CONVERSION_DETAIL    0날짜 1고객 2캠페인 3광고그룹 4검색어 5소재 6비즈채널 7·8(미사용) 9매체 10기기 11(미사용) 12전환유형 13건수 14금액
  쇼핑검색은 네이버가 소량 검색어를 보고서에서 빼서 광고비가 캠페인 합의 97.8~100% 다. 화면이 이 비율을 보여 준다.

계정이 둘이다. main(~/.naver-searchad/config.json, 너티·사입·아이언펫) · balancelab(~/.naver-searchad-balancelab/config.json).
두 축은 섞지 않는다(김호). 매체·미사용 칸은 합쳐서 (날짜, 계정, 광고유형, 캠페인, 광고그룹, 소재, 기기, 검색어) 한 행으로 만든다.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta

import requests
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8")

APPLY = "--apply" in sys.argv
_KST = datetime.utcnow() + timedelta(hours=9)
YESTERDAY = (_KST - timedelta(days=1)).strftime("%Y-%m-%d")
_dates = [a for a in sys.argv[1:] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", a)]
if len(_dates) == 2:
    START, END = _dates
elif not _dates:
    START, END = (_KST - timedelta(days=7)).strftime("%Y-%m-%d"), YESTERDAY
else:
    sys.exit("날짜는 START END 두 개")
END = min(END, YESTERDAY)  # 보고서는 하루가 끝나야 확정된다
_acc = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--account=")), "all")

ACCOUNTS = {
    "main": "~/.naver-searchad/config.json",
    "balancelab": "~/.naver-searchad-balancelab/config.json",
}
SB_URL = os.environ.get("SUPABASE_URL") or "https://phcfydxgwkmjiogerqmm.supabase.co"
# sync_naver_keywords.py 와 같은 anon 기본값(워크플로에 SUPABASE 시크릿이 없다).
SB_KEY = os.environ.get("SUPABASE_ANON_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"


def brand_from_campaign(campaign: str) -> str:
    """sync_naver_sa.py·sync_naver_keywords.py 와 같은 규칙. main 계정에만 쓴다."""
    c = campaign.lower()
    if "사입" in c or "벌크" in c:
        return "saip"
    if "아이언펫" in c:
        return "ironpet"
    if "너티" in c or "사운드" in c or "하루루틴" in c:
        return "nutty"
    if "밸런스" in campaign or "큐모발" in campaign or "balancelab" in c:
        return "balancelab"
    return "nutty"


class Api:
    def __init__(self, cfg_path):
        c = json.load(open(os.path.expanduser(cfg_path), encoding="utf-8"))
        self.k, self.s, self.cust = c["api_key"], c["api_secret"], str(c["customer_id"])
        self.base = c.get("base_url", "https://api.searchad.naver.com")

    def _h(self, method, ep):
        ts = str(int(time.time() * 1000))
        sig = base64.b64encode(hmac.new(self.s.encode(), f"{ts}.{method}.{ep}".encode(), hashlib.sha256).digest()).decode()
        return {"X-API-KEY": self.k, "X-Customer": self.cust, "X-Timestamp": ts, "X-Signature": sig,
                "Content-Type": "application/json"}

    def get(self, ep, params=None):
        for attempt in range(3):
            try:
                r = requests.get(self.base + ep, headers=self._h("GET", ep), params=params, timeout=60)
                r.raise_for_status()
                return r.json()
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(1.5)

    def report(self, tp, day):
        r = requests.post(self.base + "/stat-reports", headers=self._h("POST", "/stat-reports"),
                          json={"reportTp": tp, "statDt": f"{day}T00:00:00Z"}, timeout=60)
        r.raise_for_status()
        jid = r.json()["reportJobId"]
        for _ in range(90):
            g = self.get(f"/stat-reports/{jid}")
            if g["status"] in ("BUILT", "NONE", "ERROR", "AGGREGATING_ERROR"):
                break
            time.sleep(2)
        if g["status"] == "NONE":
            return []  # 그날 데이터 없음(사실)
        if g["status"] != "BUILT":
            raise RuntimeError(f"{tp} {day} 보고서 실패: {g['status']}")
        d = requests.get(g["downloadUrl"], headers=self._h("GET", "/report-download"), timeout=120)
        d.raise_for_status()
        return [ln.split("\t") for ln in d.text.splitlines() if ln.strip()]


def names(api):
    """캠페인·광고그룹 이름, 쇼핑 소재의 상품명. 삭제된 것은 id 로 남는다."""
    camps = {c["nccCampaignId"]: c["name"] for c in api.get("/ncc/campaigns")}
    groups, products = {}, {}
    for cid in camps:
        for g in api.get("/ncc/adgroups", {"nccCampaignId": cid}) or []:
            groups[g["nccAdgroupId"]] = g["name"]
            if g.get("adgroupType") == "SHOPPING" or "-02-" in g["nccAdgroupId"]:
                for a in api.get("/ncc/ads", {"nccAdgroupId": g["nccAdgroupId"]}) or []:
                    ref = a.get("referenceData") or {}
                    products[a["nccAdId"]] = ref.get("productTitle") or ref.get("productName")
    return camps, groups, products


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def collect(account, api, day, camps, groups, products, read_at):
    rows = {}

    def row(ad_type, cmp, grp, ad, device, query):
        key = "|".join([day, account, ad_type, cmp, grp, ad, device, query])
        if key not in rows:
            camp_name = camps.get(cmp, cmp)
            rows[key] = {
                "row_key": key, "date": day, "account": account, "ad_type": ad_type,
                "brand": "balancelab" if account == "balancelab" else brand_from_campaign(camp_name),
                "campaign_id": cmp, "campaign": camp_name, "adgroup_id": grp, "adgroup": groups.get(grp, grp),
                "ad_id": ad, "product": products.get(ad) or groups.get(grp, grp), "device": device, "query": query,
                "impressions": 0.0, "clicks": 0.0, "cost": 0.0, "purchases": 0.0, "purchase_value": 0.0,
                "cart_adds": 0.0, "cart_value": 0.0, "read_at": read_at,
            }
        return rows[key]

    for r in api.report("EXPKEYWORD", day):
        x = row("powerlink", r[2], r[3], "", r[6], r[4])
        x["impressions"] += num(r[8]); x["clicks"] += num(r[9]); x["cost"] += num(r[10])
    for r in api.report("SHOPPINGKEYWORD_DETAIL", day):
        x = row("shopping", r[2], r[3], r[5], r[10], r[4])
        x["impressions"] += num(r[11]); x["clicks"] += num(r[12]); x["cost"] += num(r[13])
    for r in api.report("SHOPPINGKEYWORD_CONVERSION_DETAIL", day):
        x = row("shopping", r[2], r[3], r[5], r[10], r[4])
        if r[12] == "purchase":
            x["purchases"] += num(r[13]); x["purchase_value"] += num(r[14])
        elif r[12] == "add_to_cart":
            x["cart_adds"] += num(r[13]); x["cart_value"] += num(r[14])
    out = []
    for x in rows.values():
        for k in ("impressions", "clicks", "purchases", "cart_adds"):
            x[k] = int(round(x[k]))
        for k in ("cost", "purchase_value", "cart_value"):
            x[k] = round(x[k])
        out.append(x)
    return out


def main():
    days = []
    d = datetime.strptime(START, "%Y-%m-%d")
    while d.strftime("%Y-%m-%d") <= END:
        days.append(d.strftime("%Y-%m-%d"))
        d += timedelta(days=1)
    targets = list(ACCOUNTS) if _acc == "all" else [_acc]
    print(f"네이버 검색어 {START}~{END} ({len(days)}일) 계정 {targets} {'[APPLY]' if APPLY else '[DRY-RUN]'}")
    sb = create_client(SB_URL, SB_KEY) if APPLY else None
    read_at = datetime.utcnow().isoformat() + "Z"
    failed = []
    for account in targets:
        api = Api(ACCOUNTS[account])
        camps, groups, products = names(api)
        print(f"  [{account}] 캠페인 {len(camps)} · 광고그룹 {len(groups)} · 쇼핑 소재 {len(products)}")
        for day in days:
            try:
                rows = collect(account, api, day, camps, groups, products, read_at)
            except Exception as e:  # 한 날이 죽어도 나머지는 받는다. 실패는 마지막에 모아 알린다
                failed.append(f"{account} {day}: {e}")
                print(f"    {day} 실패: {e}")
                continue
            by = defaultdict(lambda: [0, 0, 0.0, 0, 0.0])
            for x in rows:
                b = by[x["ad_type"]]
                b[0] += 1; b[1] += x["clicks"]; b[2] += x["cost"]; b[3] += x["purchases"]; b[4] += x["purchase_value"]
            summary = " | ".join(f"{t} {v[0]}행 클릭{v[1]} 광고비{v[2]:,.0f} 구매{v[3]}건 {v[4]:,.0f}원" for t, v in sorted(by.items()))
            print(f"    {day} {summary}")
            if APPLY and rows:
                for i in range(0, len(rows), 500):
                    sb.table("raw_naver_search_term").upsert(rows[i:i + 500], on_conflict="row_key").execute()
    if failed:
        print(f"\n실패 {len(failed)}건:\n  " + "\n  ".join(failed))
        sys.exit(1)
    print("\n완료" if APPLY else "\nDRY-RUN — DB 를 바꾸지 않았다. 적용하려면 --apply")


if __name__ == "__main__":
    main()
