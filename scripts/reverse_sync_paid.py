# -*- coding: utf-8 -*-
"""Paid 탭(시트) → daily_ad_spend(DB) 역싱크. 시트에 수기로 채운 광고비를 대시보드에 반영.
- 너티=[N]Paid(메인시트), 밸런스랩=[Q]Paid(밸런스랩 별도시트). 컬럼 매핑 다름.
- 기존 DB 행: spend/impressions/clicks만 UPDATE (naver 전환매출 conversion_value 보존). 없으면 INSERT.
- 시트 cost>0 인 (날짜,채널)만. 06-10~06-19.
실행: python reverse_sync_paid.py [--apply]
"""
import os, sys, re
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

APPLY = "--apply" in sys.argv
START, END, YEAR = "2026-06-10", "2026-06-19", 2026
SA = os.path.expanduser('~/.naver-searchad/google-service-account.json')
MAIN_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
BL_ID = "1sQclVno_knYQ3v9-0jZEcwuWuRrP84J481V4wD_ab74"
SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

# (cost_col, imp_col, click_col) 0-based
NUTTY = {"naver_search": (6,7,8), "naver_shopping": (11,12,13), "meta": (17,20,19), "gfa": (29,30,32), "google_pmax": (44,45,47)}
BL    = {"naver_search": (4,5,6), "naver_shopping": (9,10,11), "meta": (15,18,17), "gfa": (27,28,30)}
SOURCES = [("nutty", MAIN_ID, "[N]Paid", NUTTY), ("balancelab", BL_ID, "[Q]Paid", BL)]

creds = Credentials.from_service_account_file(SA, scopes=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'])
gc = gspread.authorize(creds)
sb = create_client(SB_URL, SB_KEY)

def pdate(a):
    m = re.search(r'6월\s*(\d{1,2})일', str(a)); return f"{YEAR}-06-{int(m.group(1)):02d}" if m else None
def pnum(v):
    s = re.sub(r'[^\d.-]', '', str(v));
    if s in ('','-') or 'DIV' in str(v): return None
    try: return int(round(float(s)))
    except: return None

# 기존 DB
db = {}
for r in (sb.table('daily_ad_spend').select('date,brand,channel,spend,impressions,clicks').gte('date',START).lte('date',END).in_('brand',['nutty','balancelab']).execute().data or []):
    db[(r['date'], r['brand'], r['channel'])] = r

updates, inserts = [], []
for brand, sid, tab, cols in SOURCES:
    ws = gc.open_by_key(sid).worksheet(tab)
    for row in ws.get_all_values():
        d = pdate(row[0] if row else "")
        if not d or d < START or d > END: continue
        for ch, (cc, ic, kc) in cols.items():
            cost = pnum(row[cc]) if len(row) > cc else None
            if cost is None or cost <= 0: continue
            imp = pnum(row[ic]) if len(row) > ic else 0
            clk = pnum(row[kc]) if len(row) > kc else 0
            key = (d, brand, ch); ex = db.get(key)
            if ex is None:
                inserts.append({"date":d,"brand":brand,"channel":ch,"spend":cost,"impressions":imp or 0,"clicks":clk or 0,"conversions":0,"conversion_value":0})
            elif int(ex.get('spend') or 0) != cost or int(ex.get('impressions') or 0) != (imp or 0):
                updates.append({"date":d,"brand":brand,"channel":ch,"spend":cost,"impressions":imp or 0,"clicks":clk or 0,"old_spend":int(ex.get('spend') or 0)})

updates.sort(key=lambda x:(x['brand'],x['date'],x['channel'])); inserts.sort(key=lambda x:(x['brand'],x['date'],x['channel']))
print(f"=== INSERT {len(inserts)}건 (DB에 없던 행) ===")
for p in inserts: print(f"  {p['brand']:<11} {p['date']} {p['channel']:<15} spend={p['spend']:,} imp={p['impressions']}")
print(f"\n=== UPDATE {len(updates)}건 (spend/imp 변경; conv_value 보존) ===")
for p in updates: print(f"  {p['brand']:<11} {p['date']} {p['channel']:<15} {p['old_spend']:,} → {p['spend']:,}")

if APPLY:
    if inserts:
        for i in range(0,len(inserts),100): sb.table('daily_ad_spend').insert(inserts[i:i+100]).execute()
    for u in updates:
        sb.table('daily_ad_spend').update({"spend":u["spend"],"impressions":u["impressions"],"clicks":u["clicks"]}).eq('date',u['date']).eq('brand',u['brand']).eq('channel',u['channel']).execute()
    print(f"\n✅ INSERT {len(inserts)} / UPDATE {len(updates)} 적용 완료.")
else:
    print("\n(dry-run) --apply 로 반영.")
