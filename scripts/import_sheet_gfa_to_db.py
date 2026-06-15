# -*- coding: utf-8 -*-
"""[사입]Paid / [N]Paid 시트 GFA(AD=비용, AE=노출, AG=클릭)를 daily_ad_spend(channel=gfa)로 반영.
시트값을 source of truth로 cost+imp+click 전부 upsert. 비용(AD)>0 인 날짜만, FREEZE~TODAY.
실행: python import_sheet_gfa_to_db.py [--apply]
"""
import os, sys, re
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

APPLY = "--apply" in sys.argv
FREEZE, TODAY, YEAR = "2026-06-01", "2026-06-12", 2026
SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
TABS = {"[사입]Paid": "saip", "[N]Paid": "nutty"}
COST, IMP, CLK = 29, 30, 32  # AD, AE, AG (0-based)

creds = Credentials.from_service_account_file(SA_JSON, scopes=[
    'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'])
gc = gspread.authorize(creds)
sh = gc.open_by_key(SHEET_ID)
sb = create_client(SB_URL, SB_KEY)

existing = {}
for r in (sb.table('daily_ad_spend').select('date,brand,spend,impressions,clicks').eq('channel','gfa').gte('date',FREEZE).execute().data or []):
    existing[(r['date'], r['brand'])] = r

def pdate(a):
    m = re.search(r'(\d{1,2})월\s*(\d{1,2})일', str(a));  return f"{YEAR}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else None
def pnum(v):
    s = re.sub(r'[^\d.-]', '', str(v));  return int(float(s)) if s not in ('','-') else 0

rows = []
for tab, brand in TABS.items():
    for row in sh.worksheet(tab).get_all_values():
        d = pdate(row[0] if row else "")
        if not d or d < FREEZE or d > TODAY: continue
        cost = pnum(row[COST]) if len(row) > COST else 0
        if cost <= 0: continue
        imp = pnum(row[IMP]) if len(row) > IMP else 0
        clk = pnum(row[CLK]) if len(row) > CLK else 0
        rows.append({"date": d, "brand": brand, "channel": "gfa", "spend": cost,
                     "impressions": imp, "clicks": clk, "conversions": 0, "conversion_value": 0})

rows.sort(key=lambda x: (x["brand"], x["date"]))
print(f"=== GFA upsert 계획 {len(rows)}건 (cost/imp/click) ===")
for p in rows:
    ex = existing.get((p["date"], p["brand"]))
    was = f" (기존 imp={ex['impressions']},clk={ex['clicks']})" if ex else " (신규)"
    print(f"  {p['brand']:<6} {p['date']} cost={p['spend']:,} imp={p['impressions']:,} clk={p['clicks']}{was}")

if APPLY:
    for i in range(0, len(rows), 100):
        sb.table('daily_ad_spend').upsert(rows[i:i+100], on_conflict='date,channel,brand').execute()
    print(f"\n✅ {len(rows)}건 upsert 완료 (cost+imp+click).")
else:
    print("\n(dry-run) --apply 로 반영.")
