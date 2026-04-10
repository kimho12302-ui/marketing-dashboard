"""OKR 시트 → Supabase monthly_targets 동기화"""
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import re
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
SHEET_ID = "1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio"
SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

YEAR = 2026  # OKR 시트 기준 연도

BRAND_MAP = {
    "너티": "nutty",
    "사입": "saip",
    "아이언펫": "ironpet",
    "밸런스랩(모발)": "balancelab",
    "밸런스랩": "balancelab",
}


def safe_num(v):
    if not v or str(v).strip() in ("", "-", "₩ -", "₩-"):
        return 0.0
    v = str(v).strip()
    v = re.sub(r'[₩,\s%]', '', v)
    try:
        return float(v)
    except:
        return 0.0


def main():
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    sheet = gc.open_by_key(SHEET_ID)
    ws = sheet.worksheet("OKR")
    vals = ws.get_all_values()

    # 헤더 행(행4)에서 월 컬럼 인덱스 추출
    # 행4: ["", "1월", "2월", "3월(기준)", "4월", ..., "12월"]
    header_row = vals[4]
    month_cols = {}  # month_int → col_index
    for col_idx, cell in enumerate(header_row):
        m = re.match(r'(\d+)월', cell.strip())
        if m:
            month_cols[int(m.group(1))] = col_idx

    print(f"월 컬럼 매핑: { {k: v for k, v in sorted(month_cols.items())} }")

    # 매출 목표 (행5~8)
    revenue_data = {}  # brand_key → {month → value}
    for row_idx in range(5, 12):
        row = vals[row_idx]
        brand_raw = str(row[0]).strip()
        if brand_raw in ("합계", ""):
            continue
        brand_key = BRAND_MAP.get(brand_raw)
        if not brand_key:
            continue
        if brand_key not in revenue_data:
            revenue_data[brand_key] = {}
        for month, col_idx in month_cols.items():
            if col_idx < len(row):
                val = safe_num(row[col_idx])
                if val > 0:
                    revenue_data[brand_key][month] = val

    # 광고비 목표 (행16~19)
    ad_data = {}  # brand_key → {month → value}
    for row_idx in range(16, 21):
        row = vals[row_idx]
        brand_raw = str(row[0]).strip()
        if brand_raw in ("합계", ""):
            continue
        brand_key = BRAND_MAP.get(brand_raw)
        if not brand_key:
            continue
        if brand_key not in ad_data:
            ad_data[brand_key] = {}
        for month, col_idx in month_cols.items():
            if col_idx < len(row):
                val = safe_num(row[col_idx])
                if val > 0:
                    ad_data[brand_key][month] = val

    # ROAS 목표 (행24~)
    roas_data = {}
    for row_idx in range(24, 30):
        row = vals[row_idx]
        brand_raw = str(row[0]).strip()
        brand_key = BRAND_MAP.get(brand_raw)
        if not brand_key:
            continue
        if brand_key not in roas_data:
            roas_data[brand_key] = {}
        for month, col_idx in month_cols.items():
            if col_idx < len(row):
                raw = str(row[col_idx]).strip()
                # ROAS는 "154.29%" 형식 → 1.5429 배수로 저장
                pct = safe_num(raw)
                if pct > 0:
                    roas_data[brand_key][month] = round(pct / 100, 4)

    # monthly_targets 테이블에 upsert
    rows = []
    all_brands = set(list(revenue_data.keys()) + list(ad_data.keys()))
    for brand in all_brands:
        all_months = set(
            list(revenue_data.get(brand, {}).keys()) +
            list(ad_data.get(brand, {}).keys())
        )
        for month in sorted(all_months):
            month_str = f"{YEAR}-{month:02d}"
            rev = revenue_data.get(brand, {}).get(month, 0)
            ad = ad_data.get(brand, {}).get(month, 0)
            roas = roas_data.get(brand, {}).get(month, 0)
            rows.append({
                "month": month_str,
                "brand": brand,
                "revenue_target": round(rev),
                "ad_budget_target": round(ad),
                "roas_target": roas,
                "note": "OKR 시트 자동 동기화",
            })

    # 전체 합계 행
    total_rev = {}
    total_ad = {}
    for month in range(1, 13):
        total_rev[month] = sum(revenue_data.get(b, {}).get(month, 0) for b in revenue_data)
        total_ad[month] = sum(ad_data.get(b, {}).get(month, 0) for b in ad_data)
    for month in sorted(set(total_rev.keys()) | set(total_ad.keys())):
        rev = total_rev.get(month, 0)
        ad = total_ad.get(month, 0)
        if rev > 0 or ad > 0:
            rows.append({
                "month": f"{YEAR}-{month:02d}",
                "brand": "all",
                "revenue_target": round(rev),
                "ad_budget_target": round(ad),
                "roas_target": round(rev / ad, 4) if ad > 0 else 0,
                "note": "OKR 시트 자동 동기화",
            })

    print(f"\n📊 총 {len(rows)}건 upsert 예정")
    for r in rows[:5]:
        print(f"  {r}")

    # Upsert
    for i in range(0, len(rows), 100):
        batch = rows[i:i+100]
        try:
            sb.table("monthly_targets").upsert(batch, on_conflict="month,brand").execute()
        except Exception as e:
            print(f"  ❌ batch {i}: {e}")

    print(f"\n🎉 monthly_targets {len(rows)}건 동기화 완료!")


if __name__ == "__main__":
    main()
