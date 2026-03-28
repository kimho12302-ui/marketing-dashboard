"""전체 시트 데이터 → Supabase 동기화 (올해 전체)"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
SA_JSON = r"C:\Users\김호\.naver-searchad\google-service-account.json"

SHEET_SALES = "1YT3_RMO8XJYVxf3i7kzb50cVGPU5fMChhqGCRaa6NTw"
SHEET_META = "1JaKZBYsAhd7nsDzNZAYRC2bp66-K1Nd0noDr1JzOqBs"
SHEET_NAVER = "1ky1rAsa8draGigQixBRSNMOPIEYH0ygsXiF_mYhDwgo"
SHEET_GA4 = "1iFhY2G9fm4wxDeG8D1mhSzEEmu428GQYcsCHbY2M66c"

def safe_num(v, d=0):
    if v is None or v == "" or v == "-": return d
    try: return float(str(v).replace(",","").replace("₩","").replace("원","").replace(" ",""))
    except: return d

def safe_int(v, d=0):
    return int(safe_num(v, d))

def parse_date(v):
    if not v: return None
    v = str(v).strip()
    from datetime import datetime
    for fmt in ["%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%m/%d/%Y", "%Y년 %m월 %d일"]:
        try: return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except: continue
    # Try YYYYMMDD
    if len(v) == 8 and v.isdigit():
        try: return datetime.strptime(v, "%Y%m%d").strftime("%Y-%m-%d")
        except: pass
    return None

def dedup_upsert(sb, table, rows, conflict):
    if not rows:
        print(f"  ⏭ {table}: 데이터 없음")
        return
    fields = [f.strip() for f in conflict.split(",")]
    seen = {}
    for r in rows:
        key = tuple(r.get(f, "") for f in fields)
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

    # 1. Cafe24 매출
    print("\n📊 1. Cafe24 매출...")
    sheet = gc.open_by_key(SHEET_SALES)
    ws = sheet.worksheet("카페24_일별매출")
    recs = ws.get_all_records()
    rows = []
    for r in recs:
        d = parse_date(r.get("날짜",""))
        if not d: continue
        revenue = safe_num(r.get("결제금액", r.get("매출", 0)))
        orders = safe_int(r.get("주문수", 0))
        rows.append({
            "date": d, "brand": "nutty", "channel": "cafe24",
            "revenue": revenue, "orders": orders,
            "avg_order_value": revenue/orders if orders > 0 else 0
        })
    dedup_upsert(sb, "daily_sales", rows, "date,brand,channel")

    # 2. Meta Ads — 캠페인 레벨 (v2 + v1 탭 모두)
    print("\n📊 2. Meta Ads...")
    sheet = gc.open_by_key(SHEET_META)
    meta_tabs = {
        "너티_campaign_v2": "nutty", "너티_campaign": "nutty",
        "아이언펫_campaign_v2": "ironpet", "아이언펫_campaign": "ironpet",
        "큐모발검사_campaign_v2": "balancelab", "큐모발검사_campaign": "balancelab",
    }
    rows = []
    for tab, brand in meta_tabs.items():
        try:
            ws = sheet.worksheet(tab)
            recs = ws.get_all_records()
        except: continue
        for r in recs:
            d = parse_date(r.get("날짜",""))
            if not d: continue
            spend = safe_num(r.get("지출금액", r.get("지출 금액", r.get("지출액", r.get("비용", 0)))))
            impressions = safe_int(r.get("노출수", r.get("노출", 0)))
            clicks = safe_int(r.get("인라인링크클릭", r.get("클릭수", r.get("클릭", 0))))
            reach = safe_int(r.get("도달", 0))
            conversions = safe_int(r.get("구매수", r.get("구매", r.get("전환수", r.get("전환", 0)))))
            conv_value = safe_num(r.get("전환값", r.get("구매전환값", r.get("구매 전환 값", 0))))
            if spend == 0 and impressions == 0: continue
            rows.append({
                "date": d, "brand": brand, "channel": "meta",
                "spend": spend, "impressions": impressions, "clicks": clicks, "reach": reach,
                "conversions": conversions, "conversion_value": conv_value,
            })
    # 날짜+브랜드+채널별 합계 계산
    from collections import defaultdict
    agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "reach": 0, "conversions": 0, "conversion_value": 0})
    for r in rows:
        key = (r["date"], r["brand"], r["channel"])
        agg[key]["spend"] += r["spend"]
        agg[key]["impressions"] += r["impressions"]
        agg[key]["clicks"] += r["clicks"]
        agg[key]["reach"] += r.get("reach", 0)  # reach가 없을 수도 있음
        agg[key]["conversions"] += r["conversions"]
        agg[key]["conversion_value"] += r["conversion_value"]
    rows = []
    for (d, b, c), data in agg.items():
        row_data = {
            "date": d, "brand": b, "channel": c,
            "spend": data["spend"], "impressions": data["impressions"], "clicks": data["clicks"],
            "conversions": data["conversions"], "conversion_value": data["conversion_value"],
            "roas": data["conversion_value"]/data["spend"] if data["spend"] > 0 else 0,
            "ctr": data["clicks"]/data["impressions"]*100 if data["impressions"] > 0 else 0,
            "cpc": data["spend"]/data["clicks"] if data["clicks"] > 0 else 0,
        }
        # reach가 0이 아닐 때만 추가
        if data["reach"] > 0:
            row_data["reach"] = data["reach"]
        rows.append(row_data)
    dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")

    # 3. Naver SA — 캠페인 성과
    print("\n📊 3. Naver 검색광고...")
    sheet = gc.open_by_key(SHEET_NAVER)
    rows = []
    try:
        ws = sheet.worksheet("캠페인_성과")
        all_values = ws.get_all_values()
        # 헤더(행1) 스킵
        for row in all_values[1:]:
            if len(row) < 11: continue  # 컬럼 부족
            
            # 0: 수집일시, 1: 캠페인ID, 2: 캠페인명, 3: 캠페인유형, 4: 날짜
            # 5: 노출수, 6: 클릭수, 7: CTR, 8: CPC, 9: 총비용, 10: 전환수
            d = parse_date(row[4])  # 날짜
            if not d: continue
            spend = safe_num(row[9])  # 총비용
            if spend == 0: continue
            impressions = safe_int(row[5])  # 노출수
            clicks = safe_int(row[6])  # 클릭수
            conversions = safe_int(row[10])  # 전환수
            conv_value = 0  # 네이버 시트에는 전환매출 없음
            
            # 캠페인명으로 브랜드 판별
            campaign = str(row[2])  # 캠페인명
            campaign_lower = campaign.lower()
            
            if "아이언펫" in campaign_lower:
                brand = "ironpet"
            elif "너티" in campaign_lower:
                brand = "nutty"
            elif "사입" in campaign_lower:
                brand = "saip"
            elif "밸런스" in campaign or "큐모발" in campaign or "balancelab" in campaign_lower:
                brand = "balancelab"
            else:
                brand = "nutty"  # 기본값
            
            # 캠페인유형으로 채널 판별
            campaign_type = str(row[3])  # 캠페인유형
            if campaign_type == "SHOPPING":
                channel = "naver_shopping"
            else:
                channel = "naver_search"
            
            rows.append({
                "date": d, "brand": brand, "channel": channel,
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "conversions": conversions, "conversion_value": conv_value,
            })
    except Exception as e:
        print(f"  ⚠ 캠페인_성과: {e}")
    
    # 날짜+브랜드+채널별 합계 계산
    from collections import defaultdict
    agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions": 0, "conversion_value": 0})
    for r in rows:
        key = (r["date"], r["brand"], r["channel"])
        agg[key]["spend"] += r["spend"]
        agg[key]["impressions"] += r["impressions"]
        agg[key]["clicks"] += r["clicks"]
        agg[key]["conversions"] += r["conversions"]
        agg[key]["conversion_value"] += r["conversion_value"]
    rows = []
    for (d, b, c), data in agg.items():
        rows.append({
            "date": d, "brand": b, "channel": c,
            "spend": data["spend"], "impressions": data["impressions"], "clicks": data["clicks"],
            "conversions": data["conversions"], "conversion_value": data["conversion_value"],
            "roas": data["conversion_value"]/data["spend"] if data["spend"] > 0 else 0,
            "ctr": data["clicks"]/data["impressions"]*100 if data["impressions"] > 0 else 0,
            "cpc": data["spend"]/data["clicks"] if data["clicks"] > 0 else 0,
        })
    dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")

    # 4. Google Ads — G_캠페인_성과
    print("\n📊 4. Google Ads...")
    rows = []
    try:
        ws = sheet.worksheet("G_캠페인_성과")
        recs = ws.get_all_records()
        for r in recs:
            d = parse_date(r.get("date",""))
            if not d: continue
            spend = safe_num(r.get("cost", 0))
            if spend == 0: continue
            
            # 캠페인명으로 브랜드 + 채널 판별
            campaign = str(r.get("campaign", "")).lower()
            
            # 브랜드 판별
            if "아이언펫" in campaign or "ironpet" in campaign:
                brand = "ironpet"
            elif "사입" in campaign:
                brand = "saip"
            else:
                brand = "nutty"  # 기본값
            
            # 채널 판별 (P-Max가 기본, 명시적으로 search 있을 때만 분리)
            if "search" in campaign and "p-max" not in campaign and "pmax" not in campaign:
                channel = "google_search"
            else:
                channel = "google_pmax"  # 기본값 (대부분 P-Max)
            
            impressions = safe_int(r.get("impressions", 0))
            clicks = safe_int(r.get("clicks", 0))
            conversions = safe_int(r.get("conversions", 0))
            conv_value = safe_num(r.get("conversion_value", 0))
            
            rows.append({
                "date": d, "brand": brand, "channel": channel,
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "conversions": conversions, "conversion_value": conv_value,
            })
    except Exception as e:
        print(f"  ⚠ G_캠페인_성과: {e}")
    
    # 날짜+브랜드+채널별 합계 계산
    from collections import defaultdict
    agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions": 0, "conversion_value": 0})
    for r in rows:
        key = (r["date"], r["brand"], r["channel"])
        agg[key]["spend"] += r["spend"]
        agg[key]["impressions"] += r["impressions"]
        agg[key]["clicks"] += r["clicks"]
        agg[key]["conversions"] += r["conversions"]
        agg[key]["conversion_value"] += r["conversion_value"]
    rows = []
    for (d, b, c), data in agg.items():
        rows.append({
            "date": d, "brand": b, "channel": c,
            "spend": data["spend"], "impressions": data["impressions"], "clicks": data["clicks"],
            "conversions": data["conversions"], "conversion_value": data["conversion_value"],
            "roas": data["conversion_value"]/data["spend"] if data["spend"] > 0 else 0,
            "ctr": data["clicks"]/data["impressions"]*100 if data["impressions"] > 0 else 0,
            "cpc": data["spend"]/data["clicks"] if data["clicks"] > 0 else 0,
        })
    dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")

    # 5. GA4 퍼널 — daily_funnel
    print("\n📊 5. GA4 퍼널...")
    sheet = gc.open_by_key(SHEET_GA4)
    rows = []
    try:
        ws = sheet.worksheet("daily_funnel")
        recs = ws.get_all_records()
        for r in recs:
            d = parse_date(r.get("date",""))
            if not d: continue
            rows.append({
                "date": d, "brand": "nutty",
                "impressions": safe_int(r.get("page_view", 0)),
                "sessions": safe_int(r.get("page_view", 0)),
                "cart_adds": safe_int(r.get("add_to_cart", 0)),
                "signups": 0,
                "purchases": safe_int(r.get("purchase", 0)),
                "repurchases": 0,
            })
    except Exception as e:
        print(f"  ⚠ daily_funnel: {e}")
    dedup_upsert(sb, "daily_funnel", rows, "date,brand")

    # 6. GA4 세션/매출 — ga_daily_data → daily_sales 보조
    # ❌ 제외: 매출은 엑셀에서만 추가 (사용자 요청)
    print("\n📊 6. GA4 세션 데이터... (매출 제외, 스킵)")

    # 7. GA4 campaign_type → 광고비
    print("\n📊 7. GA4 캠페인별 광고비...")
    rows = []
    try:
        ws = sheet.worksheet("campaign_type")
        recs = ws.get_all_records()
        for r in recs:
            d = parse_date(r.get("date",""))
            if not d: continue
            spend = safe_num(r.get("adCost", 0))
            if spend == 0: continue
            campaign = str(r.get("campaignType", "unknown"))
            rows.append({
                "date": d, "brand": "nutty", "channel": f"ga4_{campaign}",
                "spend": spend,
                "impressions": safe_int(r.get("adImpressions", 0)),
                "clicks": safe_int(r.get("adClicks", 0)),
                "conversions": safe_int(r.get("ecommercePurchases", 0)),
                "conversion_value": safe_num(r.get("purchaseRevenue", 0)),
                "roas": safe_num(r.get("purchaseRevenue",0))/spend if spend > 0 else 0,
                "ctr": safe_int(r.get("adClicks",0))/safe_int(r.get("adImpressions",1))*100 if safe_int(r.get("adImpressions",0)) > 0 else 0,
                "cpc": spend/safe_int(r.get("adClicks",1)) if safe_int(r.get("adClicks",0)) > 0 else 0,
            })
    except Exception as e:
        print(f"  ⚠ campaign_type: {e}")
    dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")

    # 8. 호의 월별 통계 시트 데이터 (수동 대시보드)
    print("\n📊 8. 호 월별 통계 (수동 대시보드)...")
    try:
        manual_sheet = gc.open_by_key("1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio")
        ws = manual_sheet.get_worksheet(0)
        all_vals = ws.get_all_values()
        # 월별 행: 12월, 1월, 2월, 3월 (row index 3~6 based on CSV)
        months_map = {"2025년 12월": "2025-12", "12월": "2025-12", 
                      "1월": "2026-01", "2월": "2026-02", "3월": "2026-03"}
        rows = []
        for row in all_vals:
            if len(row) < 20: continue
            month_str = str(row[1]).strip()
            if month_str not in months_map: continue
            month = months_map[month_str]
            total_rev = safe_num(row[5])
            ironpet_rev = safe_num(row[6])
            nutty_rev = safe_num(row[7])
            total_cost = safe_num(row[10])
            ironpet_cost = safe_num(row[11])
            nutty_cost = safe_num(row[12])
            
            # Revenue entries
            if nutty_rev > 0:
                rows.append({"month": month, "brand": "nutty", "channel": "total",
                            "category": "revenue", "metric": "monthly_revenue", "value": nutty_rev})
            if ironpet_rev > 0:
                rows.append({"month": month, "brand": "ironpet", "channel": "total",
                            "category": "revenue", "metric": "monthly_revenue", "value": ironpet_rev})
            # Cost entries
            if nutty_cost > 0:
                rows.append({"month": month, "brand": "nutty", "channel": "total",
                            "category": "ad_spend", "metric": "monthly_cost", "value": nutty_cost})
            if ironpet_cost > 0:
                rows.append({"month": month, "brand": "ironpet", "channel": "total",
                            "category": "ad_spend", "metric": "monthly_cost", "value": ironpet_cost})
            # Channel spend
            channels = [
                (14, "naver_search"), (15, "naver_shopping"), (16, "meta"),
                (17, "gfa"), (18, "google_search"), (19, "gdn"),
                (20, "coupang"), (21, "influencer"), (22, "etc")
            ]
            for idx, ch in channels:
                if idx < len(row):
                    val = safe_num(row[idx])
                    if val > 0:
                        rows.append({"month": month, "brand": "nutty", "channel": ch,
                                    "category": "ad_spend", "metric": "channel_spend", "value": val})
            # Funnel
            funnel_fields = [
                (24, "impressions"), (25, "sessions"), (26, "cart_adds"),
                (27, "signups"), (28, "purchases"), (29, "repurchases")
            ]
            for idx, metric in funnel_fields:
                if idx < len(row):
                    val = safe_num(row[idx])
                    if val > 0:
                        rows.append({"month": month, "brand": "nutty", "channel": "total",
                                    "category": "funnel", "metric": metric, "value": val})
        dedup_upsert(sb, "manual_monthly", rows, "month,brand,channel,category,metric")
    except Exception as e:
        print(f"  ⚠ 월별 통계: {e}")

    print("\n🎉 전체 동기화 완료!")

if __name__ == "__main__":
    main()
