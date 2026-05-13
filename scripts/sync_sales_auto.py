import os
# -*- coding: utf-8 -*-
"""Sales 시트 → DB 자동 동기화 (최근 7일)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime, timedelta
from collections import defaultdict

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

def parse_date(date_str):
    if not date_str: return None
    try:
        parts = date_str.split()
        month = int(parts[0].replace("월", ""))
        day = int(parts[1].replace("일", ""))
        return f"2026-{month:02d}-{day:02d}"
    except:
        return None

def clean_revenue(rev_str):
    if not rev_str: return 0
    return int(str(rev_str).replace(",", "").replace("원", "").strip())

def map_brand(brand_str, category_str=None):
    brand_lower = str(brand_str).lower()
    category_lower = str(category_str or '').lower()
    combined = f"{category_lower} {brand_lower}"
    if "너티" in combined or "nutty" in combined:
        return "nutty"
    elif "아이언펫" in combined or "ironpet" in combined:
        return "ironpet"
    elif "파미나" in combined or "닥터레이" in combined or "테라카니스" in combined or "고네이티브" in combined:
        return "saip"
    elif "밸런스랩" in combined or "자체판매" in combined or "공동구매" in combined or "큐모발" in combined:
        return "balancelab"
    return "unknown"

def map_channel(channel_str):
    ch = str(channel_str).lower()
    if "스마트" in ch:
        return "smartstore"
    elif "cafe24" in ch or "카페24" in ch:
        return "cafe24"
    elif "쿠팡" in ch:
        return "coupang"
    return ch

def main():
    print("📊 Sales 시트 → DB 자동 동기화 (최근 7일)\n")
    
    # 최근 7일 날짜 계산
    today = datetime.now()
    dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    print(f"대상 날짜: {dates[0]} ~ {dates[-1]}\n")
    
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets.readonly'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    sheet = gc.open_by_key(SHEET_ID)
    sales_ws = sheet.worksheet("Sales")
    sales_rows = sales_ws.get_all_values()[2:]  # 행3부터
    
    # 날짜별로 데이터 수집
    grouped = defaultdict(lambda: {
        "revenue": 0,
        "quantity": 0,
        "buyers": 0,
        "lineup": None,
        "category": None,
    })
    
    for row in sales_rows:
        if len(row) < 11: continue
        
        date = parse_date(row[1])
        if not date or date not in dates: continue
        
        channel_raw = row[2]
        brand_raw = row[4]
        lineup = row[5]
        product_name = row[6]
        quantity_str = row[7]
        revenue_str = row[9]
        category = row[3] if len(row) > 3 else None
        buyers_str = row[8] if len(row) > 8 else "0"
        
        brand = map_brand(brand_raw, category)
        channel = map_channel(channel_raw)
        revenue = clean_revenue(revenue_str)
        quantity = int(quantity_str) if quantity_str.isdigit() else 0
        buyers = int(buyers_str) if buyers_str.isdigit() else 0
        
        if revenue == 0: continue
        
        key = (date, brand, channel, product_name)
        grouped[key]["revenue"] += revenue
        grouped[key]["quantity"] += quantity
        grouped[key]["buyers"] += buyers
        if not grouped[key]["lineup"]:
            grouped[key]["lineup"] = lineup
        if not grouped[key]["category"]:
            grouped[key]["category"] = category
    
    if not grouped:
        print("⏭️ 처리할 데이터 없음")
        return
    
    # 날짜별로 삭제 후 삽입
    date_groups = defaultdict(list)
    for (date, brand, channel, product), data in grouped.items():
        avg_price = data["revenue"] // data["buyers"] if data["buyers"] > 0 else data["revenue"]
        date_groups[date].append({
            "date": date,
            "brand": brand,
            "product": product,
            "revenue": data["revenue"],
            "channel": channel,
            "lineup": data["lineup"],
            "quantity": data["quantity"],
            "category": data["category"],
            "buyers": data["buyers"],
            "avg_price": avg_price,
        })
    
    total_inserted = 0
    for date, rows_to_insert in date_groups.items():
        print(f"📅 {date}: {len(rows_to_insert)}건")
        
        # 기존 데이터 삭제
        try:
            sb.table('product_sales').delete().eq('date', date).execute()
        except Exception as e:
            print(f"   ⚠️ 삭제 에러: {e}")
        
        # 삽입
        try:
            result = sb.table('product_sales').insert(rows_to_insert).execute()
            print(f"   ✅ {len(result.data)}건 삽입")
            total_inserted += len(result.data)
        except Exception as e:
            print(f"   ❌ 삽입 에러: {e}")
    
    print(f"\n✅ 전체 {total_inserted}건 동기화 완료!")

if __name__ == "__main__":
    main()
