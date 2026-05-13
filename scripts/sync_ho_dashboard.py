"""호의 전체 대시보드 시트 → Supabase 동기화"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
SA_JSON = r"C:\Users\김호\.naver-searchad\google-service-account.json"
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"

def safe_num(v, d=0):
    if v is None or v == "" or v == "-" or v == "#DIV/0!": return d
    try: return float(str(v).replace(",","").replace("₩","").replace("원","").replace(" ",""))
    except: return d

def safe_int(v, d=0): return int(safe_num(v, d))

def parse_date(v):
    if not v: return None
    v = str(v).strip()
    if v == "DATE" or v == "일별": return None
    for fmt in ["%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y. %m. %d", "%Y. %m. %d."]:
        try: return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except: continue
    if len(v) == 8 and v.isdigit():
        try: return datetime.strptime(v, "%Y%m%d").strftime("%Y-%m-%d")
        except: pass
    # "3월 12일 (목)" format — assume 2026 if month <= current, 2025 if month > current
    import re
    m = re.match(r'(\d+)월\s*(\d+)일', v)
    if m:
        month = int(m.group(1))
        day = int(m.group(2))
        now = datetime.now()
        # If month > current month, it's likely last year
        year = 2026 if month <= now.month else 2025
        try: return datetime(year, month, day).strftime("%Y-%m-%d")
        except: pass
    return None

def dedup_upsert(sb, table, rows, conflict):
    if not rows:
        print(f"  ⏭ {table}: 데이터 없음")
        return
    fields = [f.strip() for f in conflict.split(",")]
    seen = {}
    for r in rows:
        key = tuple(str(r.get(f, "")) for f in fields)
        seen[key] = r
    rows = list(seen.values())
    total = 0
    for i in range(0, len(rows), 200):
        batch = rows[i:i+200]
        try:
            sb.table(table).upsert(batch, on_conflict=conflict).execute()
            total += len(batch)
        except Exception as e:
            print(f"  ❌ {table} batch {i}: {e}")
    print(f"  ✅ {table}: {total}건 완료")

def main():
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    sheet = gc.open_by_key(SHEET_ID)

    # 1. Total 탭 — 일별 브랜드별 매출/비용
    print("\n📊 1. Total (일별 매출/비용)...")
    ws = sheet.worksheet("Total")
    vals = ws.get_all_values()
    # row2 = header: DATE, 주차, 총매출, 아이언펫, 너티, 사료, 영양제, 총구매건, ...총비용, 아이언펫비용, 너티비용...
    sales_rows = []
    for row in vals[3:]:  # skip header rows
        d = parse_date(row[0])
        if not d: continue
        # 너티 매출
        nutty_rev = safe_num(row[4])
        nutty_orders = safe_int(row[9])
        if nutty_rev > 0:
            sales_rows.append({
                "date": d, "brand": "nutty", "channel": "total",
                "revenue": nutty_rev, "orders": nutty_orders,
                "avg_order_value": nutty_rev/nutty_orders if nutty_orders > 0 else 0
            })
        # 아이언펫 매출
        ironpet_rev = safe_num(row[3])
        ironpet_orders = safe_int(row[8])
        if ironpet_rev > 0:
            sales_rows.append({
                "date": d, "brand": "ironpet", "channel": "total",
                "revenue": ironpet_rev, "orders": ironpet_orders,
                "avg_order_value": ironpet_rev/ironpet_orders if ironpet_orders > 0 else 0
            })
    dedup_upsert(sb, "daily_sales", sales_rows, "date,brand,channel")

    # 2. [매출]채널별 — 일별 채널별 매출
    print("\n📊 2. [매출]채널별...")
    ws = sheet.worksheet("[매출]채널별")
    vals = ws.get_all_values()
    # 실제 컬럼 레이아웃 (row0=그룹헤더, row1=매출/개수/구매자수 반복):
    # col1-4: 총(매출,건수,구매자수,객단가), col5-7: 카페24(매출,개수,구매자수)
    # col8-10: 스마트스토어, col11-13: 쿠팡, col14-16: 에이블리
    # col17-19: 페오펫(데이터없음), col20-22: 피피, col23-24: 펫프렌즈(데이터없음)
    sales_rows = []
    channels = [
        (5, "cafe24"), (8, "smartstore"), (11, "coupang"), (14, "ably"), (20, "pp")
    ]
    for row in vals[2:]:  # skip headers
        d = parse_date(row[0])
        if not d: continue
        for col_start, ch_name in channels:
            rev = safe_num(row[col_start]) if col_start < len(row) else 0
            # col+1=개수(수량), col+2=구매자수(실제 주문건수) — 구매자수 사용
            orders = safe_int(row[col_start+2]) if col_start+2 < len(row) else 0
            if rev > 0:
                sales_rows.append({
                    "date": d, "brand": "nutty", "channel": ch_name,
                    "revenue": rev, "orders": orders,
                    "avg_order_value": rev/orders if orders > 0 else 0
                })
    dedup_upsert(sb, "daily_sales", sales_rows, "date,brand,channel")

    # 3. Paid 탭 — 일별 전체 광고비 (채널별)
    print("\n📊 3. Paid (전체 광고비)...")
    ws = sheet.worksheet("Paid")
    vals = ws.get_all_values()
    # row1: T.COST, T.Imp., T.Click, 인플루언서, 그외, N검색COST, imp, click, CTR, CTC, N쇼핑COST, ...메타...
    ad_rows = []
    for row in vals[2:]:
        d = parse_date(row[0])
        if not d: continue
        # 네이버 검색
        ns_cost = safe_num(row[6]) if len(row) > 6 else 0
        ns_imp = safe_int(row[7]) if len(row) > 7 else 0
        ns_click = safe_int(row[8]) if len(row) > 8 else 0
        if ns_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "naver_search",
                "spend": ns_cost, "impressions": ns_imp, "clicks": ns_click,
                "conversions": 0, "conversion_value": 0,
                "roas": 0, "ctr": ns_click/ns_imp*100 if ns_imp > 0 else 0,
                "cpc": ns_cost/ns_click if ns_click > 0 else 0})
        # 쇼핑광고
        nsh_cost = safe_num(row[11]) if len(row) > 11 else 0
        nsh_imp = safe_int(row[12]) if len(row) > 12 else 0
        nsh_click = safe_int(row[13]) if len(row) > 13 else 0
        if nsh_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "naver_shopping",
                "spend": nsh_cost, "impressions": nsh_imp, "clicks": nsh_click,
                "conversions": 0, "conversion_value": 0,
                "roas": 0, "ctr": nsh_click/nsh_imp*100 if nsh_imp > 0 else 0,
                "cpc": nsh_cost/nsh_click if nsh_click > 0 else 0})
        # 메타
        meta_cost = safe_num(row[17]) if len(row) > 17 else 0
        meta_click = safe_int(row[19]) if len(row) > 19 else 0
        if meta_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "meta",
                "spend": meta_cost, "impressions": 0, "clicks": meta_click,
                "conversions": 0, "conversion_value": 0,
                "roas": 0, "ctr": 0, "cpc": meta_cost/meta_click if meta_click > 0 else 0})
        # GFA (col29)
        gfa_cost = safe_num(row[29]) if len(row) > 29 else 0
        gfa_imp = safe_int(row[30]) if len(row) > 30 else 0
        gfa_click = safe_int(row[32]) if len(row) > 32 else 0
        if gfa_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "gfa",
                "spend": gfa_cost, "impressions": gfa_imp, "clicks": gfa_click,
                "conversions": 0, "conversion_value": 0,
                "roas": 0, "ctr": gfa_click/gfa_imp*100 if gfa_imp > 0 else 0,
                "cpc": gfa_cost/gfa_click if gfa_click > 0 else 0})
        # 구글 검색광고 (col37)
        gsearch_cost = safe_num(row[37]) if len(row) > 37 else 0
        gsearch_imp = safe_int(row[38]) if len(row) > 38 else 0
        gsearch_click = safe_int(row[40]) if len(row) > 40 else 0
        if gsearch_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "google_search",
                "spend": gsearch_cost, "impressions": gsearch_imp, "clicks": gsearch_click,
                "conversions": 0, "conversion_value": 0, "roas": 0,
                "ctr": gsearch_click/gsearch_imp*100 if gsearch_imp > 0 else 0,
                "cpc": gsearch_cost/gsearch_click if gsearch_click > 0 else 0})
        # 구글 GDN / Performance Max (col45)
        gdn_cost = safe_num(row[45]) if len(row) > 45 else 0
        gdn_imp = safe_int(row[46]) if len(row) > 46 else 0
        gdn_click = safe_int(row[48]) if len(row) > 48 else 0
        if gdn_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "google_pmax",
                "spend": gdn_cost, "impressions": gdn_imp, "clicks": gdn_click,
                "conversions": 0, "conversion_value": 0, "roas": 0,
                "ctr": gdn_click/gdn_imp*100 if gdn_imp > 0 else 0,
                "cpc": gdn_cost/gdn_click if gdn_click > 0 else 0})
        # 쿠팡 광고 (col53)
        coupang_cost = safe_num(row[53]) if len(row) > 53 else 0
        coupang_imp = safe_int(row[54]) if len(row) > 54 else 0
        coupang_click = safe_int(row[56]) if len(row) > 56 else 0
        if coupang_cost > 0:
            ad_rows.append({"date": d, "brand": "nutty", "channel": "coupang_ads",
                "spend": coupang_cost, "impressions": coupang_imp, "clicks": coupang_click,
                "conversions": 0, "conversion_value": 0, "roas": 0,
                "ctr": coupang_click/coupang_imp*100 if coupang_imp > 0 else 0,
                "cpc": coupang_cost/coupang_click if coupang_click > 0 else 0})
    dedup_upsert(sb, "daily_ad_spend", ad_rows, "date,brand,channel")

    # 4. [I]Paid — 아이언펫 광고비
    print("\n📊 4. [I]Paid (아이언펫 광고비)...")
    ws = sheet.worksheet("[I]Paid")
    vals = ws.get_all_values()
    ad_rows = []
    for row in vals[2:]:
        d = parse_date(row[0])
        if not d: continue
        total_cost = safe_num(row[1]) if len(row) > 1 else 0
        if total_cost > 0:
            # 네이버 검색
            ns_cost = safe_num(row[6]) if len(row) > 6 else 0
            if ns_cost > 0:
                ad_rows.append({"date": d, "brand": "ironpet", "channel": "naver_search",
                    "spend": ns_cost, "impressions": safe_int(row[7]) if len(row)>7 else 0,
                    "clicks": safe_int(row[8]) if len(row)>8 else 0,
                    "conversions": 0, "conversion_value": 0, "roas": 0, "ctr": 0, "cpc": 0})
            # 쇼핑
            nsh_cost = safe_num(row[11]) if len(row) > 11 else 0
            if nsh_cost > 0:
                ad_rows.append({"date": d, "brand": "ironpet", "channel": "naver_shopping",
                    "spend": nsh_cost, "impressions": safe_int(row[12]) if len(row)>12 else 0,
                    "clicks": safe_int(row[13]) if len(row)>13 else 0,
                    "conversions": 0, "conversion_value": 0, "roas": 0, "ctr": 0, "cpc": 0})
            # 메타
            meta_cost = safe_num(row[17]) if len(row) > 17 else 0
            if meta_cost > 0:
                ad_rows.append({"date": d, "brand": "ironpet", "channel": "meta",
                    "spend": meta_cost, "impressions": 0,
                    "clicks": safe_int(row[19]) if len(row)>19 else 0,
                    "conversions": 0, "conversion_value": 0, "roas": 0, "ctr": 0, "cpc": 0})
    dedup_upsert(sb, "daily_ad_spend", ad_rows, "date,brand,channel")

    # 5. Funnel 탭 — 퍼널
    print("\n📊 5. Funnel...")
    ws = sheet.worksheet("Funnel")
    vals = ws.get_all_values()
    funnel_rows = []
    for row in vals[2:]:
        d = parse_date(row[0])
        if not d: continue
        impressions = safe_int(row[2])
        sessions = safe_int(row[3])
        cart = safe_int(row[4])
        signups = safe_int(row[5])
        purchases = safe_int(row[6])
        repurchases = safe_int(row[7])
        if impressions > 0 or sessions > 0:
            funnel_rows.append({
                "date": d, "brand": "nutty", "channel": "all",  # channel 컬럼 필수 (unique key: date,brand,channel)
                "impressions": impressions, "sessions": sessions,
                "cart_adds": cart, "signups": signups,
                "purchases": purchases, "repurchases": repurchases
            })
    dedup_upsert(sb, "daily_funnel", funnel_rows, "date,brand")

    # 6. Sales 탭 — 제거됨 (이카운트 엑셀 업로드가 daily_sales 단일 소스, 중복 방지)

    print("\n🎉 호 대시보드 전체 동기화 완료!")

if __name__ == "__main__":
    main()
