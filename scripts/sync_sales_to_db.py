import os
# -*- coding: utf-8 -*-
"""Sales 시트 → Supabase product_sales 동기화"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client
from datetime import datetime

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

def parse_date(date_str):
    """'3월 24일 (화)' → '2026-03-24'"""
    if not date_str: return None
    try:
        parts = date_str.split()
        month = int(parts[0].replace("월", ""))
        day = int(parts[1].replace("일", ""))
        return f"2026-{month:02d}-{day:02d}"
    except:
        return None

def clean_revenue(rev_str):
    """'109,000' → 109000"""
    if not rev_str: return 0
    return int(str(rev_str).replace(",", "").replace("원", "").strip())

def map_brand(brand_str, category_str=None):
    """브랜드명/카테고리 → DB brand

    Sales 시트 구조상 밸런스랩 공동구매/자체판매는
    - 카테고리(D열): 밸런스랩
    - 브랜드명(E열): 공동구매 / 자체판매
    로 들어오므로 category도 같이 봐야 함.
    """
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
    """판매처 → DB channel"""
    ch = str(channel_str).lower()
    if "스마트" in ch:
        return "smartstore"
    elif "cafe24" in ch or "카페24" in ch:
        return "cafe24"
    elif "쿠팡" in ch:
        return "coupang"
    return ch

def main(target_date="2026-03-24"):
    print(f"📊 Sales 시트 → product_sales DB 동기화 ({target_date})\n")
    
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets.readonly'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    sheet = gc.open_by_key(SHEET_ID)
    
    # 1. 상품 목록 읽기 (제품명 → 품목코드)
    print("1️⃣ 상품 목록 로딩...")
    product_ws = sheet.worksheet("상품 목록")
    product_rows = product_ws.get_all_values()[3:]  # 행4부터
    
    product_map = {}  # {제품명: 품목코드}
    for row in product_rows:
        if len(row) >= 5 and row[0] and row[4]:
            product_code = row[0]  # A열
            product_name = row[4]  # E열
            product_map[product_name] = product_code
    
    print(f"   ✅ {len(product_map)}개 제품 로드\n")
    
    # 2. Sales 탭 읽기
    print("2️⃣ Sales 탭 로딩...")
    sales_ws = sheet.worksheet("Sales")
    sales_rows = sales_ws.get_all_values()[2:]  # 행3부터
    
    print(f"   ✅ {len(sales_rows)}행\n")
    
    # 3. 데이터 파싱 + 그룹핑 (날짜+브랜드+채널+제품별 합산)
    print("3️⃣ 데이터 파싱...")
    
    from collections import defaultdict
    grouped = defaultdict(lambda: {
        "revenue": 0,
        "quantity": 0,
        "buyers": 0,
        "lineup": None,
        "category": None,
    })
    
    for row in sales_rows:
        if len(row) < 11: continue
        
        date_str = row[1]  # B열
        date = parse_date(date_str)
        if not date: continue
        if date != target_date: continue  # 특정 날짜만 처리
        
        channel_raw = row[2]  # C열
        brand_raw = row[4]  # E열
        lineup = row[5]  # F열
        product_name = row[6]  # G열
        quantity_str = row[7]  # H열
        revenue_str = row[9]  # J열
        category = row[3] if len(row) > 3 else None  # D열
        
        # 변환
        brand = map_brand(brand_raw, category)
        channel = map_channel(channel_raw)
        revenue = clean_revenue(revenue_str)
        quantity = int(quantity_str) if quantity_str.isdigit() else 0
        buyers_str = row[8] if len(row) > 8 else "0"  # I열
        buyers = int(buyers_str) if buyers_str.isdigit() else 0
        avg_price = revenue // buyers if buyers > 0 else revenue
        
        if revenue == 0: continue
        
        key = (date, brand, channel, product_name)
        grouped[key]["revenue"] += revenue
        grouped[key]["quantity"] += quantity
        grouped[key]["buyers"] += buyers
        if not grouped[key]["lineup"]:
            grouped[key]["lineup"] = lineup
        if not grouped[key]["category"]:
            grouped[key]["category"] = category
    
    # 그룹핑된 데이터를 리스트로 변환
    rows_to_insert = []
    for (date, brand, channel, product), data in grouped.items():
        avg_price = data["revenue"] // data["buyers"] if data["buyers"] > 0 else data["revenue"]
        rows_to_insert.append({
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
    
    print(f"   ✅ {len(rows_to_insert)}건 파싱 완료\n")
    
    # 4. DB 삽입 (날짜별 삭제 후 재삽입)
    print("4️⃣ DB 작업...")
    
    if rows_to_insert:
        # 기존 데이터 삭제 (target_date만)
        print(f"   🗑️ {target_date} 기존 데이터 삭제...")
        try:
            sb.table('product_sales').delete().eq('date', target_date).execute()
        except Exception as e:
            print(f"      ⚠️ {e}")
        
        # 새 데이터 삽입 (하나씩)
        print(f"   ➕ {len(rows_to_insert)}건 삽입...")
        inserted = 0
        for row in rows_to_insert:
            try:
                sb.table('product_sales').insert(row).execute()
                inserted += 1
            except Exception as e:
                print(f"      ⚠️ {row['product']}: {e}")
        print(f"   ✅ {inserted}건 완료\n")
    else:
        print("   ⏭️ 삽입할 데이터 없음\n")
    
    print("✅ 전체 동기화 완료!")

if __name__ == "__main__":
    import sys
    target_date = sys.argv[1] if len(sys.argv) > 1 else "2026-03-24"
    main(target_date)
