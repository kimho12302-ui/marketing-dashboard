import os
# -*- coding: utf-8 -*-
"""DB(밸런스랩 광고비) → 밸런스랩 시트(1sQclVno)의 [Q]Paid 자동 동기화.
메인 시트와 컬럼이 다른 [Q]Paid 전용. 채널: naver_search/shopping/meta/gfa.
0-가드: DB cost>0 인 채널만 기록 → 시트 수기값(특히 GFA) 0-덮어쓰기 방지.
사용: python sync_db_to_bl_paid.py [START END] [--apply]   (기본 dry-run, 최근 10일)
"""
import sys, re
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta

APPLY = "--apply" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("-")]
if len(args) >= 2:
    START, END = args[0], args[1]
else:
    END = datetime.now().strftime("%Y-%m-%d")
    START = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")

SA = os.path.expanduser("~/.naver-searchad/google-service-account.json")
BL_ID = "1sQclVno_knYQ3v9-0jZEcwuWuRrP84J481V4wD_ab74"
QPAID_GID = 1297683241
SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

# [Q]Paid 채널별 컬럼 (cost, imp, click) — A1 letters
CH_COLS = {
    "naver_search":   ("E", "F", "G"),
    "naver_shopping": ("J", "K", "L"),
    "meta":           ("P", "S", "R"),
    "gfa":            ("AB", "AC", "AE"),
}

gc = gspread.authorize(Credentials.from_service_account_file(SA, scopes=[
    "https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]))
sb = create_client(SB_URL, SB_KEY)

ws = next(w for w in gc.open_by_key(BL_ID).worksheets() if w.id == QPAID_GID)
vals = ws.get_all_values()

rows = sb.table("daily_ad_spend").select("date,channel,spend,impressions,clicks") \
    .eq("brand", "balancelab").gte("date", START).lte("date", END).execute().data or []
by_date = {}
for r in rows:
    by_date.setdefault(r["date"], {})[r["channel"]] = r

print(f"=== DB→[Q]Paid 밸런스랩 동기화 {START}~{END} (apply={APPLY}) ===")
batch, written = [], 0
for date in sorted(by_date):
    dt = datetime.strptime(date, "%Y-%m-%d")
    target = f"{dt.month}월 {dt.day}일"
    rn = next((i + 1 for i, row in enumerate(vals) if row and target in str(row[0])), None)
    if not rn:
        print(f"  {date}: 시트 행 없음 → 스킵"); continue
    parts = []
    for ch, (cc, ic, kc) in CH_COLS.items():
        d = by_date[date].get(ch)
        if not d or int(d["spend"] or 0) <= 0:   # 0-가드: 시트 보존
            continue
        batch += [
            {"range": f"{cc}{rn}", "values": [[int(d["spend"])]]},
            {"range": f"{ic}{rn}", "values": [[int(d["impressions"] or 0)]]},
            {"range": f"{kc}{rn}", "values": [[int(d["clicks"] or 0)]]},
        ]
        parts.append(f"{ch}={int(d['spend'])}"); written += 1
    if parts:
        print(f"  {date} (행{rn}): " + ", ".join(parts))

if APPLY and batch:
    ws.batch_update(batch, value_input_option="USER_ENTERED")
    print(f"\n✅ {written}개 채널셀 기록")
elif not APPLY:
    print(f"\n(dry-run) 기록 예정 채널셀 {written}개 — --apply 로 반영")
