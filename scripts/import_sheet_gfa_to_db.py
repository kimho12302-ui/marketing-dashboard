# -*- coding: utf-8 -*-
"""[사입]Paid / [N]Paid 시트 GFA(AD=비용, AE=노출, AG=클릭, AJ=구매금액)를
daily_ad_spend(channel=gfa)로 반영.
시트값을 source of truth로 upsert. 비용(AD)>0 인 날짜만.
실행: python import_sheet_gfa_to_db.py [START END] [--apply]
  START END 생략 시 최근 14일만 처리한다(기본).
  예) python import_sheet_gfa_to_db.py 2026-08-26 2026-09-02 --apply
      python import_sheet_gfa_to_db.py --apply            # 최근 14일

★ 범위 인자가 없던 시절엔 매 실행이 FREEZE(2026-06-01)~오늘 전 기간을 재기록했다.
  그래서 8/26~9/2 만 넣으려 한 실행이 8/20~25 의 과거 구매금액까지 건드렸다(2026-09 사고).
  이제 기본 창을 14일로 좁혀 파급 범위를 제한하고, 백필은 명시적 인자로만 하도록 한다.

★ AJ("구매")는 건수가 아니라 구매 금액이다(클릭 91건에 값 520,100 → 금액).
  따라서 conversion_value 로 넣는다. 구매 '건수' 열은 시트에 없어 conversions 는 0으로 둔다.
  이 열을 안 읽어서 대시보드 GFA ROAS가 계속 0.00x 로 표시됐다(2026-07 확인).
  밸런스랩 [Q]Paid 시트에는 구매 열 자체가 없어 여기서 다루지 않는다.
"""
import os, sys, re
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

from datetime import datetime, timedelta
APPLY = "--apply" in sys.argv
# TODAY 를 하드코딩하면 stale 해져서 그 이후 날짜가 조용히 스킵됨 (2026-07 리뷰 지적) → 실행 시점 KST 로 계산.
_KST_NOW = datetime.utcnow() + timedelta(hours=9)
FREEZE, TODAY, YEAR = "2026-06-01", _KST_NOW.strftime("%Y-%m-%d"), _KST_NOW.year
DEFAULT_WINDOW_DAYS = 14

# 처리 범위: [START, END]. 인자로 날짜 2개를 주면 그 구간, 없으면 최근 14일.
_dates = [a for a in sys.argv[1:] if re.fullmatch("[0-9]{4}-[0-9]{2}-[0-9]{2}", a)]
if len(_dates) >= 2:
    START, END = _dates[0], _dates[1]
elif len(_dates) == 1:
    sys.exit(f"날짜를 2개 주세요 (START END). 받은 값: {_dates[0]}")
else:
    START = (_KST_NOW - timedelta(days=DEFAULT_WINDOW_DAYS - 1)).strftime("%Y-%m-%d")
    END = TODAY
if START > END:
    sys.exit(f"START({START}) 가 END({END}) 보다 뒤입니다.")
if START < FREEZE:
    print(f"⚠ START({START}) 가 동결일({FREEZE}) 이전이라 {FREEZE} 로 올립니다.")
    START = FREEZE
if END > TODAY:
    END = TODAY
print(f"📅 처리 범위 {START} ~ {END}" + ("" if len(_dates) >= 2 else f"  (기본 최근 {DEFAULT_WINDOW_DAYS}일)"))
SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
SB_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
TABS = {"[사입]Paid": "saip", "[N]Paid": "nutty"}
COST, IMP, CLK, BUY_AMT = 29, 30, 32, 35  # AD, AE, AG, AJ(구매금액) (0-based)

creds = Credentials.from_service_account_file(SA_JSON, scopes=[
    'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'])
gc = gspread.authorize(creds)
sh = gc.open_by_key(SHEET_ID)
sb = create_client(SB_URL, SB_KEY)

existing = {}
for r in (sb.table('daily_ad_spend').select('date,brand,spend,impressions,clicks,conversion_value').eq('channel','gfa').gte('date',START).lte('date',END).execute().data or []):
    existing[(r['date'], r['brand'])] = r

def pdate(a):
    m = re.search(r'(\d{1,2})월\s*(\d{1,2})일', str(a));  return f"{YEAR}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else None
def pnum(v):
    s = re.sub(r'[^\d.-]', '', str(v));  return int(float(s)) if s not in ('','-') else 0

rows = []
for tab, brand in TABS.items():
    for row in sh.worksheet(tab).get_all_values():
        d = pdate(row[0] if row else "")
        if not d or d < START or d > END: continue
        cost = pnum(row[COST]) if len(row) > COST else 0
        if cost <= 0: continue
        imp = pnum(row[IMP]) if len(row) > IMP else 0
        clk = pnum(row[CLK]) if len(row) > CLK else 0
        # ★ 구매금액(AJ) 0-덮어쓰기 방지 (2026-09 사고).
        #   이전에는 공란도 pnum() 이 0 을 돌려줘 그대로 upsert 했다. 이 스크립트는 매 실행마다
        #   FREEZE~TODAY 전 기간을 재기록하므로, 시트에서 과거 AJ 셀이 비워지면 실행할 때마다
        #   DB 의 과거 구매금액이 0 으로 밀렸다(8/20~8/25 2브랜드 343만원 소실).
        #   공란("")과 명시적 0 을 구분해서, 공란이면 DB 기존값을 유지한다.
        buy_raw = row[BUY_AMT] if len(row) > BUY_AMT else ""
        if str(buy_raw).strip() == "":
            prev = existing.get((d, brand))
            buy_amt = int(prev.get("conversion_value") or 0) if prev else 0
        else:
            buy_amt = pnum(buy_raw)
        rows.append({"date": d, "brand": brand, "channel": "gfa", "spend": cost,
                     "impressions": imp, "clicks": clk,
                     "conversions": 0, "conversion_value": buy_amt,
                     "roas": buy_amt / cost if cost > 0 else 0,
                     "ctr": clk / imp * 100 if imp > 0 else 0,
                     "cpc": cost / clk if clk > 0 else 0})

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
