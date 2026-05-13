# -*- coding: utf-8 -*-
"""DB → [N]Paid 시트 역동기화 (batch update)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta

SA_JSON = r"C:\Users\김호\.naver-searchad\google-service-account.json"
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
WORKSHEET_NAME = "[N]Paid"

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

def col_letter(n):
    """숫자 → 컬럼 문자 (1=A, 2=B, ...)"""
    result = ""
    while n > 0:
        n -= 1
        result = chr(65 + (n % 26)) + result
        n //= 26
    return result

def main():
    print("📊 DB → [N]Paid 시트 업데이트 (batch)\n")
    
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
    
    # batch update용 데이터
    batch_data = []
    
    # 업데이트할 행 찾기
    for date_str, data in data_by_date.items():
        # 날짜 형식: "2026-03-24" -> "3월 24일"
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        target_date = f"{dt.month}월 {dt.day}일"
        
        # 시트에서 해당 날짜 행 찾기
        for i, row in enumerate(all_values):
            if target_date in str(row[0]):  # DATE 컬럼
                row_num = i + 1  # gspread는 1-based
                
                print(f"  {target_date} (행{row_num}):")
                print(f"    total={data['total_cost']:,.0f}원 | meta={data['meta_cost']:,.0f}원 | naver={data['naver_search_cost']:,.0f}원")
                
                # batch update 데이터 추가
                batch_data.append({
                    'range': f'B{row_num}',
                    'values': [[f"₩ {data['total_cost']:,.0f}"]]
                })
                batch_data.append({'range': f'C{row_num}', 'values': [[data['total_imp']]]})
                batch_data.append({'range': f'D{row_num}', 'values': [[data['total_click']]]})
                batch_data.append({'range': f'G{row_num}', 'values': [[data['naver_search_cost']]]})
                batch_data.append({'range': f'H{row_num}', 'values': [[data['naver_search_imp']]]})
                batch_data.append({'range': f'I{row_num}', 'values': [[data['naver_search_click']]]})
                batch_data.append({'range': f'L{row_num}', 'values': [[data['naver_shopping_cost']]]})
                batch_data.append({'range': f'R{row_num}', 'values': [[data['meta_cost']]]})
                batch_data.append({'range': f'U{row_num}', 'values': [[data['meta_imp']]]})
                batch_data.append({'range': f'T{row_num}', 'values': [[data['meta_click']]]})
                batch_data.append({'range': f'AD{row_num}', 'values': [[data['gfa_cost']]]})
                
                break
    
    # batch update 실행
    if batch_data:
        ws.batch_update(batch_data)
        print(f"\n✅ {len(data_by_date)}개 날짜 업데이트 완료 (batch {len(batch_data)}개 셀)")
    else:
        print("\n업데이트할 데이터 없음")

if __name__ == "__main__":
    main()
