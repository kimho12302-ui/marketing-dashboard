import os
# -*- coding: utf-8 -*-
"""DB → [N]Paid, [I]Paid, [사입]Paid 시트 역동기화 (전체 브랜드)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

# 브랜드별 워크시트 매핑
BRAND_SHEETS = {
    "nutty": "[N]Paid",
    "ironpet": "[I]Paid",
    "saip": "[사입]Paid",
}

def aggregate_data(brand, start_date, end_date, sb):
    """특정 브랜드의 날짜별 데이터 집계"""
    result = sb.table('daily_ad_spend').select('*').eq('brand', brand).gte('date', start_date).lte('date', end_date).execute()
    
    data_by_date = {}
    for r in result.data:
        date = r['date']
        if date not in data_by_date:
            data_by_date[date] = {
                'total_cost': 0, 'total_imp': 0, 'total_click': 0,
                'naver_search_cost': 0, 'naver_search_imp': 0, 'naver_search_click': 0,
                'naver_shopping_cost': 0, 'naver_shopping_imp': 0, 'naver_shopping_click': 0,
                'meta_cost': 0, 'meta_imp': 0, 'meta_click': 0, 'meta_reach': 0,
                'google_search_cost': 0,
                'google_pmax_cost': 0, 'google_pmax_imp': 0, 'google_pmax_click': 0,
                'ga4_pmax_cost': 0, 'ga4_pmax_imp': 0, 'ga4_pmax_click': 0,
                'ga4_search_cost': 0, 'ga4_search_imp': 0, 'ga4_search_click': 0,
                'ga4_demandgen_cost': 0, 'ga4_demandgen_imp': 0, 'ga4_demandgen_click': 0,
                'coupang_cost': 0, 'coupang_imp': 0, 'coupang_click': 0, 'coupang_revenue': 0,
                'gfa_cost': 0, 'gfa_imp': 0, 'gfa_click': 0,
            }
        
        channel = r['channel']
        spend = r['spend']
        imp = r['impressions']
        click = r['clicks']
        
        # ga4 채널은 google_pmax와 중복이므로 total에서 제외
        if not channel.startswith('ga4'):
            data_by_date[date]['total_cost'] += spend
            data_by_date[date]['total_imp'] += imp
            data_by_date[date]['total_click'] += click
        
        if channel == 'naver_search':
            data_by_date[date]['naver_search_cost'] += spend
            data_by_date[date]['naver_search_imp'] += imp
            data_by_date[date]['naver_search_click'] += click
        elif channel == 'naver_shopping':
            data_by_date[date]['naver_shopping_cost'] += spend
            data_by_date[date]['naver_shopping_imp'] += imp
            data_by_date[date]['naver_shopping_click'] += click
        elif channel == 'meta':
            data_by_date[date]['meta_cost'] += spend
            data_by_date[date]['meta_imp'] += imp
            data_by_date[date]['meta_click'] += click
            reach_val = r.get('reach')
            data_by_date[date]['meta_reach'] += (reach_val if reach_val is not None else 0)
        elif channel == 'google_search':
            data_by_date[date]['google_search_cost'] += spend
        elif channel == 'google_pmax':
            data_by_date[date]['google_pmax_cost'] += spend
            data_by_date[date]['google_pmax_imp'] += imp
            data_by_date[date]['google_pmax_click'] += click
        elif channel == 'ga4_Performance Max':
            data_by_date[date]['ga4_pmax_cost'] += spend
            data_by_date[date]['ga4_pmax_imp'] += imp
            data_by_date[date]['ga4_pmax_click'] += click
        elif channel == 'ga4_Search':
            data_by_date[date]['ga4_search_cost'] += spend
            data_by_date[date]['ga4_search_imp'] += imp
            data_by_date[date]['ga4_search_click'] += click
        elif channel == 'ga4_Demand Gen':
            data_by_date[date]['ga4_demandgen_cost'] += spend
            data_by_date[date]['ga4_demandgen_imp'] += imp
            data_by_date[date]['ga4_demandgen_click'] += click
        elif channel == 'coupang_ads':
            data_by_date[date]['coupang_cost'] += spend
            data_by_date[date]['coupang_imp'] += imp
            data_by_date[date]['coupang_click'] += click
            conv_val = r.get('conversion_value')
            data_by_date[date]['coupang_revenue'] += (conv_val if conv_val is not None else 0)
        elif channel == 'gfa':
            data_by_date[date]['gfa_cost'] += spend
            data_by_date[date]['gfa_imp'] += imp
            data_by_date[date]['gfa_click'] += click
    
    return data_by_date

def update_sheet(ws, data_by_date, brand_name):
    """시트 업데이트 (batch)"""
    all_values = ws.get_all_values()
    batch_data = []
    
    for date_str, data in data_by_date.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        target_date = f"{dt.month}월 {dt.day}일"
        
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):
                row_num = i + 1
                
                print(f"    {target_date} (행{row_num}): total={data['total_cost']:,.0f}원 | meta={data['meta_cost']:,.0f}원")
                
                batch_data.extend([
                    # Total(B) 미기록: 시트가 채널 합산 수식([사입]/[I]Paid은 B=수식). 정적값 덮어쓰면 수식 깨짐.
                    # 총노출(C)/총클릭(D)도 동일 사유로 보류 — 필요시 복원.
                    {'range': f'G{row_num}', 'values': [[data['naver_search_cost']]]},
                    {'range': f'H{row_num}', 'values': [[data['naver_search_imp']]]},
                    {'range': f'I{row_num}', 'values': [[data['naver_search_click']]]},
                    {'range': f'L{row_num}', 'values': [[data['naver_shopping_cost']]]},
                    {'range': f'M{row_num}', 'values': [[data['naver_shopping_imp']]]},
                    {'range': f'N{row_num}', 'values': [[data['naver_shopping_click']]]},
                    {'range': f'R{row_num}', 'values': [[data['meta_cost']]]},
                    {'range': f'U{row_num}', 'values': [[data['meta_imp']]]},
                    {'range': f'T{row_num}', 'values': [[data['meta_click']]]},
                    {'range': f'W{row_num}', 'values': [[data['meta_reach']]]},
                    {'range': f'AS{row_num}', 'values': [[data['google_pmax_cost']]]},
                    {'range': f'AT{row_num}', 'values': [[data['google_pmax_imp']]]},
                    {'range': f'AV{row_num}', 'values': [[data['google_pmax_click']]]},
                    # GFA(AD/AE/AG) 미기록: GFA는 이 파이프라인이 수집 안 함(수기 입력). 0 덮어쓰기 금지.
                ])
                
                # 쿠팡은 너티만 (AZ=매출, BA=비용, BB=노출, BD=클릭)
                if brand_name == "nutty":
                    print(f"      → 쿠팡: 비용={data['coupang_cost']:,.0f}원 | 매출={data['coupang_revenue']:,.0f}원 | 노출={data['coupang_imp']:,} | 클릭={data['coupang_click']}")
                    batch_data.extend([
                        {'range': f'AZ{row_num}', 'values': [[data['coupang_revenue']]]},
                        {'range': f'BA{row_num}', 'values': [[data['coupang_cost']]]},
                        {'range': f'BB{row_num}', 'values': [[data['coupang_imp']]]},
                        {'range': f'BD{row_num}', 'values': [[data['coupang_click']]]},
                    ])
                break
    
    if batch_data:
        ws.batch_update(batch_data)
        return len(data_by_date), len(batch_data)
    return 0, 0

def update_balancelab_sheet(sb, start_date, end_date):
    """밸런스랩 [Q]Paid 시트 업데이트"""
    print(f"🔹 balancelab → [Q]Paid")
    
    BALANCELAB_SHEET_ID = "1sQclVno_knYQ3v9-0jZEcwuWuRrP84J481V4wD_ab74"
    
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ])
    gc = gspread.authorize(creds)
    
    sheet = gc.open_by_key(BALANCELAB_SHEET_ID)
    ws = sheet.worksheet("[Q]Paid")
    
    result = sb.table('daily_ad_spend').select('*').eq('brand', 'balancelab').gte('date', start_date).lte('date', end_date).execute()
    
    by_date = {}
    for r in result.data:
        date = r['date']
        if date not in by_date:
            by_date[date] = {
                'naver_search_cost': 0, 'naver_search_imp': 0, 'naver_search_click': 0,
                'naver_shopping_cost': 0, 'naver_shopping_imp': 0, 'naver_shopping_click': 0,
                'meta_cost': 0, 'meta_imp': 0, 'meta_click': 0, 'meta_reach': 0
            }
        
        channel = r['channel']
        if channel == 'naver_search':
            by_date[date]['naver_search_cost'] += r['spend']
            by_date[date]['naver_search_imp'] += r['impressions']
            by_date[date]['naver_search_click'] += r['clicks']
        elif channel == 'naver_shopping':
            by_date[date]['naver_shopping_cost'] += r['spend']
            by_date[date]['naver_shopping_imp'] += r['impressions']
            by_date[date]['naver_shopping_click'] += r['clicks']
        elif channel == 'meta':
            by_date[date]['meta_cost'] += r['spend']
            by_date[date]['meta_imp'] += r['impressions']
            by_date[date]['meta_click'] += r['clicks']
            by_date[date]['meta_reach'] += r.get('reach', 0)
    
    all_values = ws.get_all_values()
    batch_data = []
    
    for date_str, data in by_date.items():
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
        target_date = f"{dt.month}월 {dt.day}일 ({DAY_NAMES[dt.weekday()]})"
        
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):
                row_num = i + 1
                print(f"    {target_date} (행{row_num}): 네이버검색={data['naver_search_cost']:,}원 | 메타={data['meta_cost']:,}원")
                
                batch_data.extend([
                    {'range': f'E{row_num}', 'values': [[data['naver_search_cost']]]},
                    {'range': f'F{row_num}', 'values': [[data['naver_search_imp']]]},
                    {'range': f'G{row_num}', 'values': [[data['naver_search_click']]]},
                    {'range': f'J{row_num}', 'values': [[data['naver_shopping_cost']]]},
                    {'range': f'K{row_num}', 'values': [[data['naver_shopping_imp']]]},
                    {'range': f'L{row_num}', 'values': [[data['naver_shopping_click']]]},
                    {'range': f'P{row_num}', 'values': [[data['meta_cost']]]},
                    {'range': f'R{row_num}', 'values': [[data['meta_click']]]},
                    {'range': f'S{row_num}', 'values': [[data['meta_imp']]]},
                    {'range': f'U{row_num}', 'values': [[data['meta_reach']]]},
                ])
                break
    
    if batch_data:
        ws.batch_update(batch_data)
        print(f"  ✅ {len(by_date)}개 날짜 업데이트 완료\n")
    else:
        print(f"  ⏭️ 데이터 없음\n")

def update_coupang_funnel(sb, start_date, end_date):
    """쿠팡 Funnel 데이터 업데이트 (Funnel 탭 AQ~AT열)"""
    print(f"🔹 쿠팡 funnel → Funnel 탭")
    
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ])
    gc = gspread.authorize(creds)
    
    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.worksheet("Funnel")
    
    result = sb.table('daily_funnel').select('*').eq('brand', 'all').eq('channel', 'coupang').gte('date', start_date).lte('date', end_date).execute()
    
    all_values = ws.get_all_values()
    batch_data = []
    
    for row_data in result.data:
        date = row_data['date']
        dt = datetime.strptime(date, "%Y-%m-%d")
        DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
        target_date = f"{dt.month}월 {dt.day}일 ({DAY_NAMES[dt.weekday()]})"
        
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):
                row_num = i + 1
                
                impressions = row_data.get('impressions', 0)
                sessions = row_data.get('sessions', 0)
                cart_adds = row_data.get('cart_adds', 0)
                purchases = row_data.get('purchases', 0)
                
                print(f"    {target_date} (행{row_num}): 조회={impressions}, 방문자={sessions}, 장바구니={cart_adds}, 구매={purchases}")
                
                batch_data.extend([
                    {'range': f'AQ{row_num}', 'values': [[impressions]]},
                    {'range': f'AR{row_num}', 'values': [[sessions]]},
                    {'range': f'AS{row_num}', 'values': [[cart_adds]]},
                    {'range': f'AT{row_num}', 'values': [[purchases]]},
                ])
                break
    
    if batch_data:
        ws.batch_update(batch_data)
        print(f"  ✅ {len(result.data)}개 날짜 업데이트 완료\n")
    else:
        print(f"  ⏭️ 데이터 없음\n")

def update_cafe24_funnel(sb, gc, start_date, end_date):
    """카페24 퍼널 → Funnel 탭 (T=세션, Z=장바구니, AA=회원가입, AC=재구매)

    주의: daily_funnel에 같은 날짜가 brand=all(수기 입력) + brand=nutty/기타(GA4)로 나뉘어
    저장된 케이스가 있어 날짜별로 병합 후 시트에 기록한다.
    """
    print(f"🔹 카페24 funnel → Funnel 탭")
    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.worksheet("Funnel")
    result = sb.table('daily_funnel').select('*').eq('channel', 'cafe24').gte('date', start_date).lte('date', end_date).execute()
    all_values = ws.get_all_values()
    batch_data = []

    by_date = {}
    for r in result.data:
        d = r['date']
        entry = by_date.get(d, {
            'sessions': 0,
            'cart_adds': 0,
            'new_visitors': 0,
            'registrations': 0,
            'repurchases': 0,
            'avg_duration': 0,
            'total_users': 0,
        })
        entry['sessions'] = max(entry['sessions'], r.get('sessions', 0) or 0)
        entry['cart_adds'] = max(entry['cart_adds'], r.get('cart_adds', 0) or 0)
        entry['new_visitors'] = max(entry['new_visitors'], r.get('signups', 0) or 0)     # GA4 신규방문자
        entry['registrations'] = max(entry['registrations'], r.get('purchases', 0) or 0) # 실제 회원가입 수 (수기입력)
        entry['repurchases'] = max(entry['repurchases'], r.get('repurchases', 0) or 0)
        entry['avg_duration'] = max(entry['avg_duration'], r.get('avg_duration', 0) or 0)
        entry['total_users'] = max(entry['total_users'], r.get('subscribers', 0) or 0)   # DAU
        by_date[d] = entry

    for date, row_data in by_date.items():
        dt = datetime.strptime(date, "%Y-%m-%d")
        DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
        target_date = f"{dt.month}월 {dt.day}일 ({DAY_NAMES[dt.weekday()]})"
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):
                row_num = i + 1
                sessions = row_data['sessions']
                cart_adds = row_data['cart_adds']
                new_visitors = row_data['new_visitors']
                registrations = row_data['registrations']
                repurchases = row_data['repurchases']
                avg_duration = row_data['avg_duration']
                total_users = row_data['total_users']
                returning = max(0, total_users - new_visitors)
                print(f"    {target_date} (행{row_num}): 세션={sessions}, DAU={total_users}, 신규={new_visitors}, 재방문={returning}, 체류={avg_duration:.0f}s, 장바구니={cart_adds}, 회원가입={registrations}, 재구매={repurchases}")
                batch_data.extend([
                    {'range': f'T{row_num}', 'values': [[sessions]]},
                    {'range': f'U{row_num}', 'values': [[new_visitors]]},
                    {'range': f'V{row_num}', 'values': [[returning]]},
                    {'range': f'W{row_num}', 'values': [[total_users]]},
                    {'range': f'X{row_num}', 'values': [[sessions]]},
                    {'range': f'Y{row_num}', 'values': [[round(avg_duration)]]},
                    {'range': f'Z{row_num}', 'values': [[cart_adds]]},
                    {'range': f'AA{row_num}', 'values': [[registrations]]},
                    {'range': f'AC{row_num}', 'values': [[repurchases]]},
                ])
                break
    if batch_data:
        ws.batch_update(batch_data)
        print(f"  ✅ {len(by_date)}개 날짜 업데이트 완료\n")
    else:
        print(f"  ⏭️ 데이터 없음\n")


def update_smartstore_funnel(sb, gc, start_date, end_date):
    """스마트스토어 퍼널 → Funnel 탭 (AI=세션, AK=알림, AM=재구매)

    규칙:
    - 일반(너티/아이언펫/사입)은 brand='all'
    - 밸런스랩은 brand='balancelab'
    - Funnel 탭은 날짜별 스마트스토어 총합을 봐야 하므로 두 값을 합산
    """
    print(f"🔹 스마트스토어 funnel → Funnel 탭")
    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.worksheet("Funnel")
    result = sb.table('daily_funnel').select('*').eq('channel', 'smartstore').gte('date', start_date).lte('date', end_date).execute()
    all_values = ws.get_all_values()
    batch_data = []

    by_date = {}
    for r in result.data:
        d = r['date']
        entry = by_date.get(d, {
            'sessions': 0,
            'subscribers': 0,
            'repurchases': 0,
            'avg_duration': 0,
        })
        entry['sessions'] += r.get('sessions', 0) or 0
        entry['subscribers'] += r.get('subscribers', 0) or 0
        entry['repurchases'] += r.get('repurchases', 0) or 0
        entry['avg_duration'] = max(entry['avg_duration'], r.get('avg_duration', 0) or 0)
        by_date[d] = entry

    for date, row_data in by_date.items():
        dt = datetime.strptime(date, "%Y-%m-%d")
        DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
        target_date = f"{dt.month}월 {dt.day}일 ({DAY_NAMES[dt.weekday()]})"
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):
                row_num = i + 1
                sessions = row_data['sessions']
                subscribers = row_data['subscribers']
                repurchases = row_data['repurchases']
                avg_duration = row_data['avg_duration']
                print(f"    {target_date} (행{row_num}): 세션={sessions}, 체류={avg_duration:.0f}s, 알림={subscribers}, 재구매={repurchases}")
                batch_data.extend([
                    {'range': f'AI{row_num}', 'values': [[sessions]]},
                    {'range': f'AJ{row_num}', 'values': [[round(avg_duration)]]},
                    {'range': f'AK{row_num}', 'values': [[subscribers]]},
                    {'range': f'AM{row_num}', 'values': [[repurchases]]},
                ])
                break
    if batch_data:
        ws.batch_update(batch_data)
        print(f"  ✅ {len(by_date)}개 날짜 업데이트 완료\n")
    else:
        print(f"  ⏭️ 데이터 없음\n")


def sync_product_costs_to_sheet(sb, gc, start_date: str, end_date: str):
    """건별비용 DB(product_costs) → 시트 건별비용 탭

    기존 시트 행 그대로 두고, DB에만 있는 신규 항목만 맨 아래에 추가.
    건별비용 탭 구조: A=DATE, B=관련(브랜드), C=카테고리, D=사유, E=금액, F=공급업체/메모
    """
    print("🔹 건별비용 DB → 시트 동기화")
    result = sb.table('product_costs').select('*').gte('date', start_date).lte('date', end_date).order('date').execute()
    if not result.data:
        print("  ⏭️ product_costs 데이터 없음")
        return

    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.worksheet("건별비용")
    existing = ws.get_all_values()  # 헤더 포함

    # 시트의 기존 (date, description, amount) 조합으로 중복 방지
    existing_keys = set()
    for row in existing[1:]:  # 헤더 제외
        if len(row) >= 5 and row[0].strip():
            existing_keys.add((row[0].strip(), row[3].strip(), str(row[4]).strip().replace(",", "")))

    BRAND_LABELS = {
        "nutty": "너티", "ironpet": "아이언펫",
        "saip": "사입", "balancelab": "밸런스랩",
    }

    new_rows = []
    for r in result.data:
        date_str = str(r.get("date", ""))
        desc = str(r.get("description", ""))
        amount = str(int(r.get("amount", 0)))
        key = (date_str, desc, amount)
        if key in existing_keys:
            continue
        brand_label = BRAND_LABELS.get(r.get("brand", ""), r.get("brand", ""))
        new_rows.append([
            date_str,
            brand_label,
            r.get("category", ""),
            desc,
            int(r.get("amount", 0)),
            r.get("note", ""),
        ])

    if not new_rows:
        print("  ✅ 신규 항목 없음 (모두 동기화됨)")
        return

    ws.append_rows(new_rows, value_input_option="USER_ENTERED")
    print(f"  ✅ {len(new_rows)}건 추가 완료")


def main():
    import sys
    print("📊 DB → 브랜드별 Paid 시트 업데이트\n")
    
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    sheet = gc.open_by_key(SHEET_ID)
    
    # CLI 인자로 날짜 범위 지정 가능: python script.py 2025-12-22 2026-04-01
    if len(sys.argv) >= 3:
        start_date = sys.argv[1]
        end_date = sys.argv[2]
    else:
        # 기본값: 최근 30일(오늘 제외) 재동기화
        # 수기입력/재입력/늦은 백필이 잦아서 4일치만 돌리면 날짜 구멍이 남는다.
        yesterday = datetime.now() - timedelta(days=1)
        end_date = yesterday.strftime("%Y-%m-%d")
        start_date = (yesterday - timedelta(days=29)).strftime("%Y-%m-%d")
    
    print(f"기간: {start_date} ~ {end_date}\n")
    
    total_dates = 0
    total_cells = 0
    
    for brand, sheet_name in BRAND_SHEETS.items():
        print(f"🔹 {brand} → {sheet_name}")
        
        try:
            ws = sheet.worksheet(sheet_name)
            data = aggregate_data(brand, start_date, end_date, sb)
            
            if data:
                dates, cells = update_sheet(ws, data, brand)
                total_dates += dates
                total_cells += cells
                print(f"  ✅ {dates}개 날짜 업데이트 완료\n")
            else:
                print(f"  ⏭️ 데이터 없음\n")
        except Exception as e:
            print(f"  ❌ 에러: {e}\n")
    
    # 밸런스랩 추가
    try:
        update_balancelab_sheet(sb, start_date, end_date)
    except Exception as e:
        print(f"  ❌ 밸런스랩 에러: {e}\n")
    
    # 쿠팡 funnel 추가
    try:
        update_coupang_funnel(sb, start_date, end_date)
    except Exception as e:
        print(f"  ❌ 쿠팡 funnel 에러: {e}\n")

    # 카페24 funnel 추가 (T=세션, Z=장바구니, AA=회원가입, AC=재구매)
    try:
        update_cafe24_funnel(sb, gc, start_date, end_date)
    except Exception as e:
        print(f"  ❌ 카페24 funnel 에러: {e}\n")

    # 스마트스토어 funnel 추가 (AI=세션, AK=알림, AM=재구매)
    try:
        update_smartstore_funnel(sb, gc, start_date, end_date)
    except Exception as e:
        print(f"  ❌ 스마트스토어 funnel 에러: {e}\n")

    # 건별비용 DB → 시트 건별비용 탭 (misc_costs 테이블 미존재로 비활성화)
    # try:
    #     sync_product_costs_to_sheet(sb, gc, start_date, end_date)
    # except Exception as e:
    #     print(f"  ❌ 건별비용 에러: {e}\n")

    print(f"✅ 전체 완료: {total_dates}개 날짜, {total_cells}개 셀 업데이트")

if __name__ == "__main__":
    main()
