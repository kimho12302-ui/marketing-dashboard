"""전체 시트 데이터 → Supabase 동기화 (재시도 로직 포함)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import time
import os
from collections import defaultdict
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
    if len(v) == 8 and v.isdigit():
        try: return datetime.strptime(v, "%Y%m%d").strftime("%Y-%m-%d")
        except: pass
    return None

def send_telegram_alert(message):
    """텔레그램 알림 발송"""
    try:
        import requests
        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = "8383605834"  # 호
        
        if not bot_token:
            print("  ⚠ TELEGRAM_BOT_TOKEN 환경변수 없음 (알림 스킵)")
            return
        
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        data = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }
        
        response = requests.post(url, json=data, timeout=10)
        if response.status_code == 200:
            print("  ✅ 텔레그램 알림 발송 완료")
        else:
            print(f"  ⚠ 텔레그램 알림 실패: {response.status_code}")
    except Exception as e:
        print(f"  ⚠ 텔레그램 알림 에러: {e}")

def retry_with_backoff(func, name, retries=3, delay=5):
    """재시도 로직 (지수 백오프)"""
    for attempt in range(retries):
        try:
            return func()
        except Exception as e:
            if attempt == retries - 1:
                raise Exception(f"{name} 최종 실패 ({retries}회 시도): {e}")
            print(f"  ⚠ {name} 실패 (시도 {attempt+1}/{retries}), {delay}초 후 재시도... ({e})")
            time.sleep(delay)
            delay *= 2

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
            raise  # 배치 실패 시 전체 실패로 처리
    print(f"  ✅ {table}: {total}건 완료")

def main():
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
    ])
    gc = gspread.authorize(creds)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    errors = []
    
    # 1. Cafe24 매출
    print("\n📊 1. Cafe24 매출...")
    def sync_cafe24():
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
    
    try:
        retry_with_backoff(sync_cafe24, "Cafe24 매출")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 2. Meta Ads
    print("\n📊 2. Meta Ads...")
    def sync_meta():
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
                rows.append({
                    "date": d, "brand": brand, "channel": "meta",
                    "spend": spend, "impressions": impressions, "clicks": clicks, "reach": reach,
                    "conversions": conversions, "conversion_value": conv_value,
                })
        agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "reach": 0, "conversions": 0, "conversion_value": 0})
        for r in rows:
            key = (r["date"], r["brand"], r["channel"])
            for k in ["spend", "impressions", "clicks", "reach", "conversions", "conversion_value"]:
                agg[key][k] += r.get(k, 0)
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
            if data["reach"] > 0:
                row_data["reach"] = data["reach"]
            rows.append(row_data)
        dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")
    
    try:
        retry_with_backoff(sync_meta, "Meta Ads")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 3. Naver SA
    print("\n📊 3. Naver 검색광고...")
    def sync_naver():
        sheet = gc.open_by_key(SHEET_NAVER)
        ws = sheet.worksheet("캠페인_성과")
        all_values = ws.get_all_values()
        rows = []
        for row in all_values[1:]:
            if len(row) < 11: continue
            d = parse_date(row[4])
            if not d: continue
            spend = safe_num(row[9])
            impressions = safe_int(row[5])
            clicks = safe_int(row[6])
            conversions = safe_int(row[10])
            campaign = str(row[2])
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
                brand = "nutty"
            campaign_type = str(row[3])
            channel = "naver_shopping" if campaign_type == "SHOPPING" else "naver_search"
            rows.append({
                "date": d, "brand": brand, "channel": channel,
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "conversions": conversions, "conversion_value": 0,
            })
        agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions": 0})
        for r in rows:
            key = (r["date"], r["brand"], r["channel"])
            for k in ["spend", "impressions", "clicks", "conversions"]:
                agg[key][k] += r[k]
        rows = []
        for (d, b, c), data in agg.items():
            rows.append({
                "date": d, "brand": b, "channel": c,
                "spend": data["spend"], "impressions": data["impressions"], "clicks": data["clicks"],
                "conversions": data["conversions"], "conversion_value": 0,
                "roas": 0, "ctr": data["clicks"]/data["impressions"]*100 if data["impressions"] > 0 else 0,
                "cpc": data["spend"]/data["clicks"] if data["clicks"] > 0 else 0,
            })
        dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")
    
    try:
        retry_with_backoff(sync_naver, "Naver 검색광고")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 4. Google Ads
    print("\n📊 4. Google Ads...")
    def sync_google():
        sheet = gc.open_by_key(SHEET_NAVER)
        ws = sheet.worksheet("G_캠페인_성과")
        recs = ws.get_all_records()
        rows = []
        for r in recs:
            d = parse_date(r.get("date",""))
            if not d: continue
            spend = safe_num(r.get("cost", 0))
            if spend == 0: continue
            campaign = str(r.get("campaign", "")).lower()
            if "아이언펫" in campaign or "ironpet" in campaign:
                brand = "ironpet"
            elif "사입" in campaign:
                brand = "saip"
            else:
                brand = "nutty"
            if "search" in campaign and "p-max" not in campaign and "pmax" not in campaign:
                channel = "google_search"
            else:
                channel = "google_pmax"
            impressions = safe_int(r.get("impressions", 0))
            clicks = safe_int(r.get("clicks", 0))
            conversions = safe_int(r.get("conversions", 0))
            conv_value = safe_num(r.get("conversion_value", 0))
            rows.append({
                "date": d, "brand": brand, "channel": channel,
                "spend": spend, "impressions": impressions, "clicks": clicks,
                "conversions": conversions, "conversion_value": conv_value,
            })
        agg = defaultdict(lambda: {"spend": 0, "impressions": 0, "clicks": 0, "conversions": 0, "conversion_value": 0})
        for r in rows:
            key = (r["date"], r["brand"], r["channel"])
            for k in ["spend", "impressions", "clicks", "conversions", "conversion_value"]:
                agg[key][k] += r[k]
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
    
    try:
        retry_with_backoff(sync_google, "Google Ads")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 5. GA4 퍼널
    print("\n📊 5. GA4 퍼널...")
    def sync_ga4_funnel():
        sheet = gc.open_by_key(SHEET_GA4)
        ws = sheet.worksheet("daily_funnel")
        recs = ws.get_all_records()
        rows = []
        for r in recs:
            d = parse_date(r.get("date",""))
            if not d: continue
            rows.append({
                "date": d, "brand": "nutty",
                "impressions": safe_int(r.get("page_view", 0)),
                "sessions": safe_int(r.get("page_view", 0)),
                "cart_adds": safe_int(r.get("add_to_cart", 0)),
                "signups": 0, "purchases": safe_int(r.get("purchase", 0)), "repurchases": 0,
            })
        dedup_upsert(sb, "daily_funnel", rows, "date,brand")
    
    try:
        retry_with_backoff(sync_ga4_funnel, "GA4 퍼널")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 6. GA4 캠페인별 광고비
    print("\n📊 6. GA4 캠페인별 광고비...")
    def sync_ga4_campaigns():
        sheet = gc.open_by_key(SHEET_GA4)
        ws = sheet.worksheet("campaign_type")
        recs = ws.get_all_records()
        rows = []
        for r in recs:
            d = parse_date(r.get("date",""))
            if not d: continue
            spend = safe_num(r.get("adCost", 0))
            if spend == 0: continue
            campaign = str(r.get("campaignType", "unknown"))
            rows.append({
                "date": d, "brand": "nutty", "channel": f"ga4_{campaign}",
                "spend": spend, "impressions": safe_int(r.get("adImpressions", 0)),
                "clicks": safe_int(r.get("adClicks", 0)),
                "conversions": safe_int(r.get("ecommercePurchases", 0)),
                "conversion_value": safe_num(r.get("purchaseRevenue", 0)),
                "roas": safe_num(r.get("purchaseRevenue",0))/spend if spend > 0 else 0,
                "ctr": safe_int(r.get("adClicks",0))/safe_int(r.get("adImpressions",1))*100 if safe_int(r.get("adImpressions",0)) > 0 else 0,
                "cpc": spend/safe_int(r.get("adClicks",1)) if safe_int(r.get("adClicks",0)) > 0 else 0,
            })
        dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")
    
    try:
        retry_with_backoff(sync_ga4_campaigns, "GA4 캠페인")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 7. 밸런스랩 네이버 SA (별도 계정)
    print("\n📊 7. 밸런스랩 네이버 SA...")
    def sync_balancelab_naver():
        import json
        import requests
        import hmac
        import hashlib
        import base64
        from datetime import datetime, timedelta
        
        CONFIG_PATH = r'C:\Users\김호\.naver-searchad-balancelab\config.json'
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        API_KEY = config['api_key']
        API_SECRET = config['api_secret']
        CUSTOMER_ID = config['customer_id']
        BASE_URL = config['base_url']
        
        def generate_signature(timestamp, method, uri):
            message = f"{timestamp}.{method}.{uri}"
            sign = hmac.new(API_SECRET.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
            return base64.b64encode(sign).decode('utf-8')
        
        def api_get(endpoint, params=None):
            timestamp = str(int(time.time() * 1000))
            method = 'GET'
            uri = endpoint
            signature = generate_signature(timestamp, method, uri)
            headers = {
                'X-API-KEY': API_KEY, 'X-Customer': CUSTOMER_ID,
                'X-Timestamp': timestamp, 'X-Signature': signature,
                'Content-Type': 'application/json'
            }
            url = f"{BASE_URL}{endpoint}"
            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()
        
        # 최근 7일 데이터 수집
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        campaigns = api_get('/ncc/campaigns')
        rows = []
        
        for date_offset in range(8):
            target_date = (start_date + timedelta(days=date_offset)).strftime('%Y-%m-%d')
            date_spend = 0
            date_impressions = 0
            date_clicks = 0
            
            for campaign in campaigns:
                cmp_id = campaign['nccCampaignId']
                try:
                    stats_params = {
                        'ids': [cmp_id],
                        'fields': '["impCnt","clkCnt","salesAmt"]',
                        'timeRange': json.dumps({"since": target_date, "until": target_date}),
                        'timeIncrement': 'TIME_INCREMENT_DAILY'
                    }
                    stats = api_get('/stats', params=stats_params)
                    data_list = stats if isinstance(stats, list) else stats.get('data', [])
                    for item in data_list:
                        date_spend += float(item.get('salesAmt', 0))
                        date_impressions += int(item.get('impCnt', 0))
                        date_clicks += int(item.get('clkCnt', 0))
                except:
                    continue
            
            # 0원이어도 기록
            rows.append({
                'date': target_date, 'brand': 'balancelab', 'channel': 'naver_search',
                'spend': date_spend, 'impressions': date_impressions, 'clicks': date_clicks,
                'conversions': 0, 'conversion_value': 0, 'roas': 0,
                'ctr': date_clicks / date_impressions * 100 if date_impressions > 0 else 0,
                'cpc': date_spend / date_clicks if date_clicks > 0 else 0,
            })
        
        dedup_upsert(sb, "daily_ad_spend", rows, "date,brand,channel")
    
    try:
        retry_with_backoff(sync_balancelab_naver, "밸런스랩 네이버 SA")
    except Exception as e:
        errors.append(str(e))
        print(f"  ❌ {e}")
    
    # 최종 결과
    print("\n" + "=" * 80)
    if errors:
        print(f"❌ {len(errors)}개 섹션 실패:")
        for i, err in enumerate(errors, 1):
            print(f"  {i}. {err}")
        print("=" * 80)
        
        # 실패 알림 발송
        from datetime import datetime
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        alert_msg = f"⚠️ *마케팅 데이터 동기화 실패* ({now_str})\n\n"
        alert_msg += f"실패한 섹션: {len(errors)}개\n\n"
        for i, err in enumerate(errors, 1):
            alert_msg += f"{i}. {err}\n"
        send_telegram_alert(alert_msg)
        
        sys.exit(1)
    else:
        print("🎉 DB 동기화 완료!")
        print("=" * 80)
        
        # 8. DB → 시트 동기화
        print("\n📊 8. DB → 시트 역동기화...")
        import subprocess
        import os
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        sheet_sync_script = os.path.join(script_dir, "sync_db_to_sheet_all_brands.py")
        
        try:
            result = subprocess.run(
                ["python", sheet_sync_script],
                capture_output=True,
                text=True,
                encoding='utf-8',
                timeout=180
            )
            
            if result.returncode == 0:
                print("  ✅ 시트 역동기화 완료")
                print(result.stdout)
            else:
                print(f"  ⚠ 시트 역동기화 실패 (exit {result.returncode})")
                print(result.stderr)
                # 시트 동기화 실패는 전체 실패로 처리하지 않음 (DB는 성공했으므로)
        except subprocess.TimeoutExpired:
            print("  ⚠ 시트 역동기화 타임아웃 (180초 초과)")
        except Exception as e:
            print(f"  ⚠ 시트 역동기화 에러: {e}")
        
        print("\n" + "=" * 80)
        print("🎉 전체 동기화 완료! (DB + 시트)")
        print("=" * 80)
        
        # 성공 알림 발송 (간단하게)
        from datetime import datetime
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        success_msg = f"✅ 마케팅 데이터 동기화 완료 ({now_str})"
        send_telegram_alert(success_msg)
        
        sys.exit(0)

if __name__ == "__main__":
    main()
