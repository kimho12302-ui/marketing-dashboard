# -*- coding: utf-8 -*-
"""DB의 GFA(daily_ad_spend channel=gfa)를 [N]Paid/[사입]Paid 시트의 AD(비용)/AE(노출)/AG(클릭)에 직접 기록.
정규 싱크(sync_db_to_sheet_all_brands.py)가 GFA를 건너뛰므로, 폼 입력 GFA를 시트에 반영할 때 사용.
DB에 gfa 행이 있는 날짜만 기록(없는 날짜의 시트값은 안 건드림).
실행: python push_gfa_to_sheet.py START END [--apply]   (예: 2026-06-12 2026-06-15)
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime

args = [a for a in sys.argv[1:] if not a.startswith("--")]
START = args[0] if len(args) > 0 else "2026-06-12"
END = args[1] if len(args) > 1 else "2026-06-15"
APPLY = "--apply" in sys.argv

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
TABS = {"[사입]Paid": "saip", "[N]Paid": "nutty"}

creds = Credentials.from_service_account_file(SA_JSON, scopes=[
    'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'])
gc = gspread.authorize(creds)
sh = gc.open_by_key(SHEET_ID)
sb = create_client(SB_URL, SB_KEY)

rows = sb.table('daily_ad_spend').select('date,brand,spend,impressions,clicks').eq('channel', 'gfa').gte('date', START).lte('date', END).execute().data or []
by_brand = {}
for r in rows:
    by_brand.setdefault(r['brand'], {})[r['date']] = r

for tab, brand in TABS.items():
    dat = by_brand.get(brand, {})
    if not dat:
        print(f"{tab}: DB GFA 없음(기간 {START}~{END})"); continue
    ws = sh.worksheet(tab)
    vals = ws.get_all_values()
    batch = []
    print(f"\n=== {tab} ({brand}) ===")
    for d in sorted(dat):
        rr = dat[d]
        dt = datetime.strptime(d, "%Y-%m-%d")
        target = f"{dt.month}월 {dt.day}일"
        found = None
        for i, row in enumerate(vals):
            if row and target in str(row[0]):
                found = i + 1; break  # 1-based
        if not found:
            print(f"  {d}: 시트에 '{target}' 행 없음 → 스킵"); continue
        cost, imp, clk = int(rr['spend'] or 0), int(rr['impressions'] or 0), int(rr['clicks'] or 0)
        batch += [
            {'range': f'AD{found}', 'values': [[cost]]},
            {'range': f'AE{found}', 'values': [[imp]]},
            {'range': f'AG{found}', 'values': [[clk]]},
        ]
        print(f"  {d} (행{found}): AD={cost} AE={imp} AG={clk}")
    if APPLY and batch:
        ws.batch_update(batch, value_input_option='USER_ENTERED')
        print(f"  ✅ {len(batch)//3}일 기록")

print("\n적용됨." if APPLY else "\n(dry-run) --apply 로 실제 기록.")
