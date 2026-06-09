"""블로그 게시물 수(글수) → content_performance 수집.

소스(클라우드 접근 가능한 것만):
- 네이버 블로그 RSS: 밸런스랩(ysiet_qhair). 게시일별 글 수 집계. (조회수는 RSS에 없음 → 0)
- Cafe24 매거진(아이언펫 ironpet.store): 게시판 스크래핑. 브랜드 귀속은 BLOG_SOURCES에서 지정.

content_performance 적재: platform="naver_blog"/"cafe24_blog", content_type="네이버블로그"/"매거진",
posts=글수, 나머지(노출/클릭/참여)=0 (RSS/게시판에 지표 없음 → 가짜값 안 넣음).
비파괴 upsert (unique=date,brand,platform,content_type). 0행이면 기존 보존.

사용: python sync_blog_posts.py [since YYYY-MM-DD]  (기본 최근 60일)
"""
import os
import sys
import re
import datetime
from collections import defaultdict
from email.utils import parsedate_to_datetime

import requests
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ppmi-dashboard/1.0)"}
DRY_RUN = os.environ.get("DRY_RUN") == "1"


def fetch_naver_blog(blog_id, since, today):
    """네이버 블로그 RSS → (date -> 글수). RSS는 최근 글만 제공(보통 50개)."""
    url = f"https://rss.blog.naver.com/{blog_id}.xml"
    r = requests.get(url, timeout=20, headers=HEADERS)
    r.raise_for_status()
    counts = defaultdict(int)
    for m in re.findall(r"<pubDate>(.*?)</pubDate>", r.text):
        try:
            d = parsedate_to_datetime(m.strip()).strftime("%Y-%m-%d")
        except Exception:
            continue
        if since <= d <= today:
            counts[d] += 1
    return counts


def fetch_cafe24_magazine(board_url, since, today, max_pages=3):
    """Cafe24 매거진 게시판 스크래핑 → (date -> 글수).

    게시판 행 단위로 (게시물, 작성일) 페어를 추출. 페이지네이션으로 최근 N페이지.
    Cafe24 게시판 구조: 각 행에 article 링크 + 날짜(YYYY-MM-DD 또는 YYYY/MM/DD).
    날짜를 못 찾는 행은 건너뜀(가짜값 금지).
    """
    counts = defaultdict(int)
    seen = set()
    for page in range(1, max_pages + 1):
        sep = "&" if "?" in board_url else "?"
        url = f"{board_url}{sep}page={page}"
        try:
            r = requests.get(url, timeout=25, headers=HEADERS)
            if r.status_code != 200:
                break
        except Exception:
            break
        html = r.text
        # 게시물 블록: article 링크 ~ 그 근처 날짜. 행 단위로 자르기 위해 article 번호 기준 분할.
        # 패턴: /article/.../{boardNo}/{articleNo}/ 와 인접한 날짜.
        for block in re.split(r'(?=/article/[^"\']*?/\d+/\d+/)', html):
            am = re.search(r"/article/[^\"']*?/(\d+)/(\d+)/", block)
            if not am:
                continue
            art_no = am.group(2)
            if art_no in seen:
                continue
            dm = re.search(r"(20\d{2})[-./](\d{2})[-./](\d{2})", block[:1500])
            if not dm:
                continue
            d = f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}"
            if not (since <= d <= today):
                continue
            seen.add(art_no)
            counts[d] += 1
    return counts


# 수집 대상: (소스종류, 식별자, brand, platform, content_type)
BLOG_SOURCES = [
    {"kind": "naver", "id": "ysiet_qhair", "brand": "balancelab",
     "platform": "naver_blog", "content_type": "네이버블로그"},
    # 매거진 귀속(brand)은 사용자 확인 후 활성화. ironpet.store는 아이언펫/너티 공용.
    # {"kind": "cafe24", "url": "https://ironpet.store/board/매거진/8/", "brand": "ironpet",
    #  "platform": "cafe24_blog", "content_type": "매거진"},
]


def main():
    since = sys.argv[1] if len(sys.argv) > 1 else (
        datetime.datetime.now() - datetime.timedelta(days=60)).strftime("%Y-%m-%d")
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    rows = []
    for src in BLOG_SOURCES:
        try:
            if src["kind"] == "naver":
                counts = fetch_naver_blog(src["id"], since, today)
            elif src["kind"] == "cafe24":
                counts = fetch_cafe24_magazine(src["url"], since, today)
            else:
                continue
        except Exception as e:
            print(f"  ❌ {src['platform']} {src.get('id') or src.get('url')}: {e}")
            continue
        total = sum(counts.values())
        print(f"  {src['platform']} ({src['brand']}): {total}글 [{len(counts)}일]")
        for d, n in sorted(counts.items()):
            rows.append({
                "date": d, "brand": src["brand"], "platform": src["platform"],
                "content_type": src["content_type"],
                "posts": n, "impressions": 0, "clicks": 0, "ctr": 0,
                "followers": 0, "engagement": 0,
            })

    print(f"\n총 {len(rows)}행 [{since} ~ {today}]")
    if DRY_RUN:
        for r in rows[:12]:
            print("  ", r)
        return

    if not rows:
        print("⚠ 수집된 블로그 글 0 → 기존 데이터 보존, 쓰기 생략")
        try:
            from heartbeat import record as hb
            hb("blog_posts", ok=False, rows=0, note="0 posts collected")
        except Exception:
            pass
        return

    for i in range(0, len(rows), 200):
        sb.table("content_performance").upsert(
            rows[i:i + 200], on_conflict="date,brand,platform,content_type"
        ).execute()
    print(f"✅ content_performance 블로그 {len(rows)}행 upsert 완료")
    try:
        from heartbeat import record as hb
        latest = max((r["date"] for r in rows), default=None)
        hb("blog_posts", ok=True, rows=len(rows), latest_date=latest)
    except Exception:
        pass


if __name__ == "__main__":
    main()
