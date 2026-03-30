# -*- coding: utf-8 -*-
"""DB → [N]Paid, [I]Paid, [사입]Paid 시트 역동기화 (전체 브랜드)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta

SA_JSON = r"C:\Users\김호\.naver-searchad\google-service-account.json"
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
                'coupang_cost': 0, 'coupang_imp': 0, 'coupang_click': 0, 'coupang_revenue': 0,
                'gfa_cost': 0, 'gfa_imp': 0, 'gfa_click': 0,
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
        elif channel == 'google_pmax' or channel.startswith('ga4'):
            data_by_date[date]['google_pmax_cost'] += spend
            data_by_date[date]['google_pmax_imp'] += imp
            data_by_date[date]['google_pmax_click'] += click
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
                    {'range': f'B{row_num}', 'values': [[f"₩ {data['total_cost']:,.0f}"]]},
                    {'range': f'C{row_num}', 'values': [[data['total_imp']]]},
                    {'range': f'D{row_num}', 'values': [[data['total_click']]]},
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
                    {'range': f'AD{row_num}', 'values': [[data['gfa_cost']]]},
                    {'range': f'AE{row_num}', 'values': [[data['gfa_imp']]]},
                    {'range': f'AG{row_num}', 'values': [[data['gfa_click']]]},
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

def main():
    print("📊 DB → 브랜드별 Paid 시트 업데이트\n")
    
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    sheet = gc.open_by_key(SHEET_ID)
    
    # 어제부터 4일 (오늘 제외)
    yesterday = datetime.now() - timedelta(days=1)
    end_date = yesterday.strftime("%Y-%m-%d")
    start_date = (yesterday - timedelta(days=3)).strftime("%Y-%m-%d")  # 어제-3일 = 4일치
    
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
    
    print(f"✅ 전체 완료: {total_dates}개 날짜, {total_cells}개 셀 업데이트")

if __name__ == "__main__":
    main()
