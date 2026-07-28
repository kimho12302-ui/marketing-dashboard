# -*- coding: utf-8 -*-
"""DB 밸런스랩 GFA → 밸런스랩 시트(1sQclVno) [Q]Paid 의 AB(비용)/AC(노출)/AE(클릭) 기록.
DB값 0/0/0 행은 스킵(시트 보존). 실행: python push_bl_gfa.py [--apply]"""
import os, sys, re
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime

APPLY = "--apply" in sys.argv
START, END = "2026-06-18", "2026-06-27"
BL_ID = "1sQclVno_knYQ3v9-0jZEcwuWuRrP84J481V4wD_ab74"
gc = gspread.authorize(Credentials.from_service_account_file(
    os.path.expanduser('~/.naver-searchad/google-service-account.json'),
    scopes=['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive']))
sb = create_client("https://phcfydxgwkmjiogerqmm.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg")

sh = gc.open_by_key(BL_ID)
ws = next(w for w in sh.worksheets() if w.id == 1297683241)  # [Q]Paid
vals = ws.get_all_values()

db = {r['date']: r for r in (sb.table('daily_ad_spend').select('date,spend,impressions,clicks').eq('brand','balancelab').eq('channel','gfa').gte('date',START).lte('date',END).execute().data or [])}
print(f"=== [Q]Paid 밸런스랩 GFA 푸시 ({ws.title}) ===")
batch = []
for d in sorted(db):
    rr = db[d]; cost,imp,clk = int(rr['spend'] or 0), int(rr['impressions'] or 0), int(rr['clicks'] or 0)
    if cost<=0 and imp<=0 and clk<=0:
        print(f"  {d}: DB 0/0/0 → 스킵"); continue
    dt = datetime.strptime(d,"%Y-%m-%d"); target = f"{dt.month}월 {dt.day}일"
    rn = next((i+1 for i,row in enumerate(vals) if row and target in str(row[0])), None)
    if not rn:
        print(f"  {d}: 시트 '{target}' 행 없음 → 스킵"); continue
    cur = vals[rn-1][27] if len(vals[rn-1])>27 else ""  # 현재 AB값
    batch += [{'range':f'AB{rn}','values':[[cost]]},{'range':f'AC{rn}','values':[[imp]]},{'range':f'AE{rn}','values':[[clk]]}]
    print(f"  {d} (행{rn}): 현재AB='{cur}' → AB={cost} AC={imp} AE={clk}")
if APPLY and batch:
    ws.batch_update(batch, value_input_option='USER_ENTERED'); print(f"\n✅ {len(batch)//3}일 기록")
else:
    print("\n(dry-run) --apply 로 반영")
