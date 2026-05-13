import os
# -*- coding: utf-8 -*-
"""DB → [N]Paid 시트 역동기화"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
WORKSHEET_NAME = "[N]Paid"

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

def main():
    print("📊 DB → [N]Paid 시트 업데이트\n")
    
    # Google Sheets 연결
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ])
    gc = gspread.authorize(creds)
    
    # Supabase 연결
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 시트 열기
    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.worksheet(WORKSHEET_NAME)
    
    # 최근 7일 데이터 가져오기
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    
    print(f"기간: {start_date} ~ {end_date}\n")
    
    # DB에서 데이터 가져오기
    result = sb.table('daily_ad_spend').select('*').eq('brand', 'nutty').gte('date', start_date).lte('date', end_date).execute()
    
    # 날짜별 집계
    data_by_date = {}
    for r in result.data:
        date = r['date']
        if date not in data_by_date:
            data_by_date[date] = {
                'total_cost': 0,
                'total_imp': 0,
                'total_click': 0,
                'naver_search_cost': 0,
                'naver_search_imp': 0,
                'naver_search_click': 0,
                'naver_shopping_cost': 0,
                'meta_cost': 0,
                'meta_imp': 0,
                'meta_click': 0,
                'google_cost': 0,
                'coupang_cost': 0,
                'gfa_cost': 0,
            }
        
        channel = r['channel']
        spend = r['spend']
        imp = r['impressions']
        click = r['clicks']
        
        data_by_date[date]['total_cost'] += spend
        data_by_date[date]['total_imp'] += imp
        data_by_date[date]['total_click'] += click
        
        if channel == 'naver_search':
            data_by_date[date]['naver_search_cost'] += spend
            data_by_date[date]['naver_search_imp'] += imp
            data_by_date[date]['naver_search_click'] += click
        elif channel == 'naver_shopping':
            data_by_date[date]['naver_shopping_cost'] += spend
        elif channel == 'meta':
            data_by_date[date]['meta_cost'] += spend
            data_by_date[date]['meta_imp'] += imp
            data_by_date[date]['meta_click'] += click
        elif channel in ['google_search', 'google_pmax']:
            data_by_date[date]['google_cost'] += spend
        elif channel == 'coupang_ads':
            data_by_date[date]['coupang_cost'] += spend
        elif channel == 'gfa':
            data_by_date[date]['gfa_cost'] += spend
    
    # 시트 전체 읽기
    all_values = ws.get_all_values()
    
    # 업데이트할 행 찾기
    updates = []
    for date_str, data in data_by_date.items():
        # 날짜 형식: "2026-03-24" -> "3월 24일"
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        target_date = f"{dt.month}월 {dt.day}일"
        
        # 시트에서 해당 날짜 행 찾기
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):  # DATE 컬럼
                row_num = i + 1  # gspread는 1-based
                
                # 컬럼 매핑 (0-based index)
                # B=1(T.COST), C=2(T.Imp), D=3(T.Click), G=6(naver search COST), H=7(naver search imp)
                # 정확한 컬럼은 시트 구조 확인 필요
                
                print(f"  {target_date} (행{row_num}): cost={data['total_cost']:,.0f}원, imp={data['total_imp']:,}회")
                
                # 업데이트 (정확한 컬럼 매핑)
                ws.update_cell(row_num, 2, round(data['total_cost']))  # B (col2): T.COST
                ws.update_cell(row_num, 3, data['total_imp'])  # C (col3): T.Imp
                ws.update_cell(row_num, 4, data['total_click'])  # D (col4): T.Click
                ws.update_cell(row_num, 7, data['naver_search_cost'])  # G (col7): 네이버 검색 COST
                ws.update_cell(row_num, 8, data['naver_search_imp'])  # H (col8): 네이버 검색 imp
                ws.update_cell(row_num, 9, data.get('naver_search_click', 0))  # I (col9): 네이버 검색 CLICK
                ws.update_cell(row_num, 12, data['naver_shopping_cost'])  # L (col12): 쇼핑광고 COST
                ws.update_cell(row_num, 18, data['meta_cost'])  # R (col18): 메타 COST
                ws.update_cell(row_num, 21, data.get('meta_imp', 0))  # U (col21): 메타 imp
                ws.update_cell(row_num, 20, data.get('meta_click', 0))  # T (col20): 메타 CLICK
                ws.update_cell(row_num, 30, data['gfa_cost'])  # AD (col30): GFA COST
                
                updates.append(target_date)
                break
    
    print(f"\n✅ {len(updates)}개 날짜 업데이트 완료")

if __name__ == "__main__":
    main()
