# -*- coding: utf-8 -*-
"""밸런스랩 제품별 광고비 표 (주간·월간 사전회의록용).

    python scripts/bl_product_spend_report.py 2026-09-01 2026-09-30
    python scripts/bl_product_spend_report.py 2026-10-01 2026-10-06 --json

직전 구간은 자동으로 붙는다. 달력 한 달이면 직전 달, 아니면 같은 길이의 직전 구간.

원천을 이렇게 고른 이유 (2026-10-07)
  - 네이버: DB(daily_ad_spend)가 아니라 SA API 를 캠페인 단위로 직접 부른다.
    밸런스랩 계정에 와이에스환경, 한국반려동물안전인증센터, S99.벌크, 99.브랜드 캠페인이
    얹혀 있고 2026-08 이전 DB 합계에는 그 비용이 섞여 있다. bl_campaign_map 으로 거른다.
  - 큐모발 파워링크는 캠페인 하나에 뉴트리션과 중금속이 섞여 있어 키워드 단위로 받아
    검색어 뜻으로 가른다(검색어 기준이지 구매 제품 기준이 아니다). 키워드 합과 캠페인 합의
    차이는 미귀속(확장검색 등, 원인 미확인)으로 그대로 드러낸다.
    쇼핑검색은 상품 단위 캠페인이라 정확하다.
  - 메타: DB ad_product_performance(캠페인명 -> 제품) + daily_ad_spend 합계. 차이 = 제품 미구분.
    밸런스랩 메타 계정에 남의 캠페인(2026-05 생분해 플라스틱 경진대회)이 섞여 있어
    "큐"로 시작하지 않는 제품명은 밸런스랩 아님으로 빼서 따로 적는다.
    메타 DB 는 GitHub Actions 가 채운다(유효 토큰이 Secrets 에만 있음). 과거분이 비면
    meta-backfill 워크플로를 돌린다.
  - GFA: DB 수기 입력분. 기간 안에 행이 없으면 0 이 아니라 측정 불가(미입력).
"""
import argparse
import base64
import collections
import hashlib
import hmac
import json
import os
import re
import sys
import time
from datetime import date, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bl_campaign_map import classify  # noqa: E402

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg")
NAVER_CFG = os.path.expanduser("~/.naver-searchad-balancelab/config.json")

HEAVY = re.compile("중금속|납중독|수은")
NUTRI = re.compile("미네랄|영양|결핍|부족|마그네슘|아연|칼슘|철분|나트륨|구리|셀레늄|대사|체질|기능의학")
ROWS = ["큐모발 뉴트리션", "큐모발 중금속", "큐모발 구분불가", "큐타액호르몬", "큐음식물과민증", "제품 미구분"]


def product_row(p):
    if not p:
        return "제품 미구분"
    if "음식물" in p:
        return "큐음식물과민증"
    if "타액" in p or "호르몬" in p:
        return "큐타액호르몬"
    if "뉴트리션" in p:
        return "큐모발 뉴트리션"
    if "중금속" in p:
        return "큐모발 중금속"
    if "모발" in p:
        return "큐모발 구분불가"
    return "제품 미구분"


def keyword_intent(kw):
    h, n = bool(HEAVY.search(kw)), bool(NUTRI.search(kw))
    if h and not n:
        return "큐모발 중금속"
    if n and not h:
        return "큐모발 뉴트리션"
    return "큐모발 구분불가"


class Naver:
    def __init__(self):
        with open(NAVER_CFG, encoding="utf-8-sig") as f:
            self.cfg = json.load(f)

    def get(self, ep, params=None):
        ts = str(int(time.time() * 1000))
        msg = f"{ts}.GET.{ep}".encode()
        sig = base64.b64encode(hmac.new(self.cfg["api_secret"].encode(), msg, hashlib.sha256).digest()).decode()
        headers = {"X-API-KEY": self.cfg["api_key"], "X-Customer": str(self.cfg["customer_id"]),
                   "X-Timestamp": ts, "X-Signature": sig}
        r = requests.get(self.cfg["base_url"] + ep, headers=headers, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def spend(self, ids, s, e):
        out = {}
        for i in range(0, len(ids), 50):
            st = self.get("/stats", {"ids": ids[i:i + 50], "fields": json.dumps(["salesAmt"]),
                                     "timeRange": json.dumps({"since": s, "until": e})})
            for x in (st if isinstance(st, list) else st.get("data", [])):
                out[x["id"]] = out.get(x["id"], 0) + float(x.get("salesAmt", 0))
        return out


def split_hair_powerlink(nv, cid, s, e, res):
    """큐모발 파워링크 캠페인을 키워드 단위로 받아 검색어 뜻으로 가른다. 키워드 합을 돌려준다."""
    kw_sum = 0.0
    for g in nv.get("/ncc/adgroups", {"nccCampaignId": cid}):
        kws = {k["nccKeywordId"]: k["keyword"] for k in nv.get("/ncc/keywords", {"nccAdgroupId": g["nccAdgroupId"]})}
        for kid, a in nv.spend(list(kws), s, e).items():
            res[(keyword_intent(kws[kid]), "search")] += a
            kw_sum += a
    return kw_sum


def naver_part(s, e):
    """반환: {(행, search 또는 shopping): 금액}, 제외 캠페인 {이름: 금액}, 미귀속 금액."""
    nv = Naver()
    res, excluded, unattributed = collections.Counter(), collections.Counter(), 0.0
    for c in nv.get("/ncc/campaigns"):
        cid, name = c["nccCampaignId"], c.get("name", "")
        amt = nv.spend([cid], s, e).get(cid, 0)
        if not amt:
            continue
        brand, prod = classify(name)
        if brand != "balancelab":
            excluded[name] += amt
            continue
        ch = "shopping" if c.get("campaignTp") == "SHOPPING" else "search"
        row = product_row(prod)
        if ch == "search" and row == "큐모발 구분불가":
            gap = amt - split_hair_powerlink(nv, cid, s, e, res)
            res[("큐모발 구분불가", ch)] += gap
            unattributed += gap
        else:
            res[(row, ch)] += amt
    return res, excluded, unattributed


_SB = None


def sb_rows(table, sel, channel, s, e):
    global _SB
    if _SB is None:
        from supabase import create_client
        _SB = create_client(SUPABASE_URL, SUPABASE_KEY)
    out, off = [], 0
    while True:
        r = (_SB.table(table).select(sel).eq("brand", "balancelab").eq("channel", channel)
             .gte("date", s).lte("date", e).range(off, off + 999).execute().data)
        out += r
        if len(r) < 1000:
            return out
        off += 1000


def meta_part(s, e):
    rows = sb_rows("daily_ad_spend", "date,spend", "meta", s, e)
    total = sum(float(x["spend"]) for x in rows)
    last = max((x["date"] for x in rows), default=None)
    res, not_bl = collections.Counter(), collections.Counter()
    for x in sb_rows("ad_product_performance", "product_name,spend", "meta", s, e):
        p = x["product_name"] or ""
        if p.startswith("큐"):
            res[product_row(p)] += float(x["spend"])
        else:
            not_bl[p] += float(x["spend"])
    res["제품 미구분"] += total - sum(res.values()) - sum(not_bl.values())
    return res, not_bl, last


def gfa_part(s, e):
    rows = sb_rows("daily_ad_spend", "date,spend", "gfa", s, e)
    if not rows:
        hist = sb_rows("daily_ad_spend", "date", "gfa", "2026-01-01", e)
        return None, max((r["date"] for r in hist), default=None)
    return sum(float(r["spend"]) for r in rows), max(r["date"] for r in rows)


def build(s, e):
    nv, excluded, unattr = naver_part(s, e)
    mt, not_bl, meta_last = meta_part(s, e)
    gfa, gfa_last = gfa_part(s, e)
    table = {r: {"search": nv[(r, "search")], "shopping": nv[(r, "shopping")], "meta": mt[r]} for r in ROWS}
    return {"range": [s, e], "table": table, "naver_unattributed": unattr,
            "naver_excluded": dict(excluded), "meta_not_balancelab": dict(not_bl),
            "meta_last_date": meta_last, "gfa": gfa, "gfa_last_date": gfa_last}


def fmt(v):
    return f"{round(v):,}" if v else "0"


def note_lines(cur):
    e = cur["range"][1]
    out = []
    g = cur["gfa"]
    if g is not None:
        out.append(f"- GFA: {fmt(g)}원 (합계에 미포함, 별도)")
    else:
        last = cur["gfa_last_date"] or "없음"
        out.append(f"- GFA: 측정 불가(미입력, 마지막 입력 {last}). 합계에 미포함")
    ml = cur["meta_last_date"]
    if not ml or ml < e:
        out.append(f"- 메타 수집이 {ml or "없음"} 까지만 있음. 그 뒤는 측정 불가(미수집)")
    out.append("- 큐모발 파워링크는 검색어 뜻으로 나눈 값(구매 제품 기준 아님). 쇼핑검색과 메타는 캠페인 단위라 정확")
    if cur["naver_unattributed"] > 0:
        out.append(f"- 큐모발 구분불가 중 파워링크 {fmt(cur["naver_unattributed"])}원은 키워드에 안 붙는 금액(확장검색 등, 원인 미확인)")
    if cur["naver_excluded"]:
        items = ", ".join(f"{k} {fmt(v)}" for k, v in cur["naver_excluded"].items())
        out.append("- 제외(네이버 계정에 함께 있는 밸런스랩 아닌 캠페인): " + items)
    if cur["meta_not_balancelab"]:
        items = ", ".join(f"{k} {fmt(v)}" for k, v in cur["meta_not_balancelab"].items())
        out.append("- 제외(메타 계정의 밸런스랩 아닌 캠페인): " + items)
    out.append("- 광고 외 비용(바이럴, 인플루언서, 알림톡)은 원장이 없어 미포함")
    return out


def render(cur, prev):
    s, e = cur["range"]
    ps, pe = prev["range"]
    out = [f"**밸런스랩 제품별 광고비** ({s} ~ {e}, 원. 직전 구간 {ps} ~ {pe})", "",
           "| 제품 | 네이버 파워링크 | 네이버 쇼핑 | 메타 | 합계 | 직전 합계 |",
           "|---|---:|---:|---:|---:|---:|"]
    tot, ptot = collections.Counter(), 0.0
    for r in ROWS:
        c, p = cur["table"][r], prev["table"][r]
        sm, psum = sum(c.values()), sum(p.values())
        if not sm and not psum:
            continue
        for k, v in c.items():
            tot[k] += v
        ptot += psum
        a, b, m = fmt(c["search"]), fmt(c["shopping"]), fmt(c["meta"])
        out.append(f"| {r} | {a} | {b} | {m} | {fmt(sm)} | {fmt(psum)} |")
    a, b, m = fmt(tot["search"]), fmt(tot["shopping"]), fmt(tot["meta"])
    out.append(f"| **합계** | {a} | {b} | {m} | **{fmt(sum(tot.values()))}** | {fmt(ptot)} |")
    out.append("")
    out += note_lines(cur)
    return "\n".join(out)


def prev_range(s, e):
    if s.day == 1 and (e + timedelta(days=1)).day == 1:
        pe = s - timedelta(days=1)
        return pe.replace(day=1), pe
    n = (e - s).days + 1
    pe = s - timedelta(days=1)
    return pe - timedelta(days=n - 1), pe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("start")
    ap.add_argument("end")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    s, e = date.fromisoformat(a.start), date.fromisoformat(a.end)
    ps, pe = prev_range(s, e)
    cur, prev = build(a.start, a.end), build(ps.isoformat(), pe.isoformat())
    if a.json:
        print(json.dumps({"current": cur, "previous": prev}, ensure_ascii=False, indent=1))
    else:
        print(render(cur, prev))


if __name__ == "__main__":
    main()
