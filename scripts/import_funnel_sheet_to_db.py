import os
# -*- coding: utf-8 -*-
"""통계시트 Funnel 탭의 수기 퍼널(카페24/스마트스토어) → daily_funnel(DB) 역동기화.

배경: 대시보드 원천은 DB인데, 운영자가 통계시트에 직접 적은 수기 퍼널은
      DB로 흐르는 경로가 없어 대시보드에 안 보였음. 이 스크립트가 시트→DB를 메꿈.

안전장치:
 - 기본 dry-run(읽기만). 실제 반영은 --write.
 - 카페24: 수기필드(cart_adds=Z, 회원가입=AA, 재구매=AC)만 brand='all'에 반영.
   세션(T)은 GA4가 brand='nutty'로 따로 채우므로 건드리지 않음(이중집계 방지).
 - 스마트스토어: 시트가 전체+밸런스랩 '합산'이라 brand='all'로만 복원(세션=AI, 알림=AK,
   체류=AJ, 재구매=AM). 밸런스랩 분리는 시트에 없어 복원 불가(한계, 합계는 정확).
 - read-modify-write: 기존 행의 다른 필드를 0으로 덮지 않음.

사용: python scripts/import_funnel_sheet_to_db.py 2026-05-04 2026-06-09 [--write]
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]


def col(letter: str) -> int:
    """엑셀 컬럼 문자 → 0-based 인덱스. 'T'→19, 'AA'→26."""
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def num(v):
    s = str(v).replace(",", "").replace("원", "").replace("%", "").strip()
    if s in ("", "-"):
        return 0
    try:
        f = float(s)
        return int(f) if f == int(f) else round(f, 1)
    except ValueError:
        return 0


def main():
    write = "--write" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print("사용: python import_funnel_sheet_to_db.py START END [--write]")
        return
    start_date, end_date = args[0], args[1]

    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    ws = gc.open_by_key(SHEET_ID).worksheet("Funnel")
    rows = ws.get_all_values()

    sd = datetime.strptime(start_date, "%Y-%m-%d")
    ed = datetime.strptime(end_date, "%Y-%m-%d")
    plan = []
    cur = sd
    while cur <= ed:
        label = f"{cur.month}월 {cur.day}일 ({DAY_NAMES[cur.weekday()]})"
        rownum = None
        for i, r in enumerate(rows):
            if r and label in str(r[0]):
                rownum = i
                break
        if rownum is not None:
            r = rows[rownum]
            def g(letter):
                ci = col(letter)
                return num(r[ci]) if ci < len(r) else 0
            cafe24 = {"cart_adds": g("Z"), "purchases": g("AA"), "repurchases": g("AC")}
            ss = {"sessions": g("AI"), "avg_duration": g("AJ"), "subscribers": g("AK"), "repurchases": g("AM")}
            plan.append((cur.strftime("%Y-%m-%d"), rownum + 1, cafe24, ss))
        cur += timedelta(days=1)

    print(f"📋 {start_date} ~ {end_date} · 시트에서 찾은 날짜 {len(plan)}개\n")
    print(f"{'날짜':12} {'행':>4}  카페24(장바/회원가입/재구매)   스마트스토어(세션/알림/재구매)")
    for date, rn, c, s in plan:
        print(f"{date:12} {rn:>4}  {c['cart_adds']:>5}/{c['purchases']:>5}/{c['repurchases']:>5}        {s['sessions']:>6}/{s['subscribers']:>5}/{s['repurchases']:>5}")

    if not write:
        print(f"\n[DRY-RUN] 위 값을 확인하세요. 실제 반영: 끝에 --write 추가")
        return

    cafe_n = ss_n = 0
    for date, rn, c, s in plan:
        if any(c.values()):
            ex = sb.table("daily_funnel").select("*").eq("date", date).eq("brand", "all").eq("channel", "cafe24").execute().data
            row = dict(ex[0]) if ex else {"date": date, "brand": "all", "channel": "cafe24"}
            row.pop("id", None)
            row.update(c)
            sb.table("daily_funnel").upsert(row, on_conflict="date,brand,channel").execute()
            cafe_n += 1
        if any(s.values()):
            ex = sb.table("daily_funnel").select("*").eq("date", date).eq("brand", "all").eq("channel", "smartstore").execute().data
            row = dict(ex[0]) if ex else {"date": date, "brand": "all", "channel": "smartstore"}
            row.pop("id", None)
            row.update(s)
            sb.table("daily_funnel").upsert(row, on_conflict="date,brand,channel").execute()
            ss_n += 1
    print(f"\n✅ 반영 완료 — 카페24 {cafe_n}일, 스마트스토어 {ss_n}일")


if __name__ == "__main__":
    main()
