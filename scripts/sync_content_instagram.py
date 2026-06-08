"""인스타그램 콘텐츠 성과 → content_performance 수집.

- 소유 계정(ironpet/balancelab): /me/accounts 로 IG id 확보 → media(좋아요+댓글)
- 비소유(nutty): Business Discovery 로 공개 데이터(댓글만, 좋아요/노출 불가)
- content_type = 미디어 포맷(image/video/carousel/reel) ← 대시보드 페이지가 이 값으로 그림
- 게시물수/참여 = 게시일 기준 집계, 팔로워 = 오늘 스냅샷
- 노출(impressions)은 owned per-post insights 필요 → v1에서는 0 (왜곡 금지, 가짜값 안 넣음)

토큰: 환경변수 META_ADS_TOKEN (GitHub Secrets / 로컬 export)
사용: python sync_content_instagram.py [since YYYY-MM-DD]
"""
import os
import sys
import datetime
from collections import defaultdict

import requests
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8")

GRAPH = "https://graph.facebook.com/v19.0"
TOKEN = os.environ.get("META_ADS_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)

# 브랜드 → IG 사용자명
USERNAMES = {
    "balancelab": "balancelab_official",
    "ironpet": "ironpet_official",
    "nutty": "nut.ty_official",
}

DRY_RUN = os.environ.get("DRY_RUN") == "1"


def fmt_type(media_type, product_type):
    if (product_type or "").upper() == "REELS":
        return "reel"
    m = (media_type or "").upper()
    return {"IMAGE": "image", "VIDEO": "video", "CAROUSEL_ALBUM": "carousel"}.get(m, "image")


def get_owned():
    """소유 IG 계정 {username: ig_id}"""
    r = requests.get(f"{GRAPH}/me/accounts", params={
        "fields": "instagram_business_account{id,username}", "access_token": TOKEN, "limit": 50}, timeout=30)
    out = {}
    for pg in r.json().get("data", []):
        ig = pg.get("instagram_business_account")
        if ig and ig.get("username"):
            out[ig["username"]] = ig["id"]
    return out


def fetch_owned(ig_id):
    """소유 계정 media 전체(페이지네이션) + 팔로워"""
    prof = requests.get(f"{GRAPH}/{ig_id}", params={
        "fields": "followers_count,media_count", "access_token": TOKEN}, timeout=30).json()
    media, url = [], f"{GRAPH}/{ig_id}/media"
    params = {"fields": "timestamp,media_type,media_product_type,like_count,comments_count",
              "access_token": TOKEN, "limit": 100}
    while url and len(media) < 600:
        j = requests.get(url, params=params, timeout=30).json()
        media += j.get("data", [])
        url = j.get("paging", {}).get("next")
        params = None
    return prof.get("followers_count", 0), media


def fetch_discovery(my_ig_id, username):
    """비소유 공개 계정(댓글만, 좋아요 None)"""
    fields = (f"business_discovery.username({username})"
              "{followers_count,media_count,media.limit(200)"
              "{timestamp,media_type,like_count,comments_count}}")
    j = requests.get(f"{GRAPH}/{my_ig_id}", params={"fields": fields, "access_token": TOKEN}, timeout=30).json()
    bd = j.get("business_discovery", {})
    return bd.get("followers_count", 0), bd.get("media", {}).get("data", [])


def main():
    if not TOKEN:
        print("❌ META_ADS_TOKEN 환경변수 없음"); sys.exit(1)
    since = sys.argv[1] if len(sys.argv) > 1 else "2026-01-01"
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    owned = get_owned()
    print("소유 IG:", owned)
    my_ig = next(iter(owned.values()), None)

    # (date, brand, content_type) -> {posts, engagement}
    agg = defaultdict(lambda: {"posts": 0, "engagement": 0})
    followers_now = {}

    for brand, uname in USERNAMES.items():
        if uname in owned:
            foll, media = fetch_owned(owned[uname])
        elif my_ig:
            foll, media = fetch_discovery(my_ig, uname)
        else:
            print(f"  ⚠ {brand}: 수집 불가 (소유계정 없음)"); continue
        followers_now[brand] = foll or 0
        cnt = 0
        for m in media:
            ts = (m.get("timestamp") or "")[:10]
            if not ts or ts < since or ts > today:
                continue
            ct = fmt_type(m.get("media_type"), m.get("media_product_type"))
            eng = (m.get("like_count") or 0) + (m.get("comments_count") or 0)
            k = (ts, brand, ct)
            agg[k]["posts"] += 1
            agg[k]["engagement"] += eng
            cnt += 1
        print(f"  {brand}: 팔로워 {foll}, 기간내 게시물 {cnt}")

    rows = []
    for (date, brand, ct), v in agg.items():
        foll = followers_now.get(brand, 0) or 0
        # engagement 컬럼 = numeric(6,4) → 참여율(%) 저장. (좋아요+댓글)/팔로워*100, 상한 99.9999
        eng_rate = round(min(99.9999, v["engagement"] / foll * 100), 4) if foll else 0
        rows.append({
            "date": date, "brand": brand, "platform": "instagram", "content_type": ct,
            "posts": v["posts"], "impressions": 0, "clicks": 0, "ctr": 0,
            "followers": 0, "engagement": eng_rate,
        })
    # 팔로워 스냅샷: 오늘 행(브랜드별, content_type='_followers')에 기록
    for brand, foll in followers_now.items():
        rows.append({
            "date": today, "brand": brand, "platform": "instagram", "content_type": "_followers",
            "posts": 0, "impressions": 0, "clicks": 0, "ctr": 0,
            "followers": foll, "engagement": 0,
        })

    print(f"\n총 {len(rows)}행 생성 (팔로워 스냅샷 {len(followers_now)}개 포함)")
    if DRY_RUN:
        print("[DRY_RUN] 쓰지 않음. 샘플:")
        for r in rows[:8]:
            print("  ", r)
        return

    # 인스타 데이터 교체: 기존 instagram 행 삭제 후 삽입
    sb.table("content_performance").delete().eq("platform", "instagram").execute()
    for i in range(0, len(rows), 200):
        sb.table("content_performance").insert(rows[i:i + 200]).execute()
    print(f"✅ content_performance instagram {len(rows)}행 교체 완료")


if __name__ == "__main__":
    main()
