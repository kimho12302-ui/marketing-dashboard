import os
"""GA4 Data API → Supabase daily_funnel (channel=cafe24)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from datetime import datetime, timedelta
from google.oauth2.service_account import Credentials
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Dimension, Metric
from supabase import create_client

# Config
SA_JSON = os.path.expanduser("~/.naver-searchad/google-service-account.json")
GA4_PROPERTY = 'properties/433673281'
SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_ga4_data(start_date, end_date):
    creds = Credentials.from_service_account_file(SA_JSON)
    client = BetaAnalyticsDataClient(credentials=creds)

    request = RunReportRequest(
        property=GA4_PROPERTY,
        dimensions=[Dimension(name='date')],
        metrics=[
            Metric(name='sessions'),
            Metric(name='totalUsers'),
            Metric(name='newUsers'),
            Metric(name='activeUsers'),  # 재방문 근사치 (totalUsers - newUsers로도 계산 가능)
            Metric(name='screenPageViews'),
            Metric(name='averageSessionDuration'),
        ],
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
    )

    resp = client.run_report(request)
    results = []
    for row in resp.rows:
        date_str       = datetime.strptime(row.dimension_values[0].value, '%Y%m%d').strftime('%Y-%m-%d')
        sessions       = int(row.metric_values[0].value)
        total_users    = int(row.metric_values[1].value)
        new_users      = int(row.metric_values[2].value)
        active_users   = int(row.metric_values[3].value)
        returning_users = total_users - new_users  # 재방문 = 총방문 - 신규
        page_views     = int(row.metric_values[4].value)
        _ = active_users  # suppress unused warning
        avg_duration   = float(row.metric_values[5].value)  # 초 단위

        results.append({
            "date": date_str,
            "brand": "nutty",
            "channel": "cafe24",
            "impressions": page_views,
            "sessions": sessions,
            "signups": new_users,
            "returning_users": returning_users,
            "total_users": total_users,
            "avg_duration": round(avg_duration),  # 초 단위, integer
            "cart_adds": 0,
            "purchases": 0,
            "repurchases": 0,
        })
    return results


def upsert_to_db(sb, rows):
    if not rows:
        return 0
    # subscribers 컬럼에 total_users(DAU) 저장 — cafe24 채널은 subscribers가 항상 0
    for r in rows:
        r["subscribers"] = r.pop("total_users", 0)

    # GA4가 수집하는 필드만 업데이트 (수기입력 필드인 cart_adds, purchases, repurchases는 절대 덮어쓰지 않음)
    GA4_COLS = {"date", "brand", "channel", "impressions", "sessions", "signups",
                "avg_duration", "returning_users", "subscribers"}

    for r in rows:
        ga4_data = {k: v for k, v in r.items() if k in GA4_COLS}
        date, brand, channel = ga4_data["date"], ga4_data["brand"], ga4_data["channel"]

        # 기존 레코드 확인
        existing = sb.table("daily_funnel").select("id,cart_adds,purchases,repurchases") \
            .eq("date", date).eq("brand", brand).eq("channel", channel).execute()

        if existing.data:
            # 기존 레코드가 있으면 GA4 필드만 UPDATE (수기입력 필드 보존)
            sb.table("daily_funnel").update(ga4_data) \
                .eq("date", date).eq("brand", brand).eq("channel", channel).execute()
        else:
            # 신규 레코드면 전체 INSERT (cart_adds 등 0으로 초기화)
            insert_data = {**ga4_data, "cart_adds": 0, "purchases": 0, "repurchases": 0}
            sb.table("daily_funnel").insert(insert_data).execute()

    return len(rows)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='GA4 → Supabase daily_funnel')
    parser.add_argument('--date', help='특정 날짜 (YYYY-MM-DD)')
    parser.add_argument('--days', type=int, default=4, help='N일치 백필 (기본: 4 = D-3)')
    args = parser.parse_args()

    if args.date:
        end_date = datetime.strptime(args.date, '%Y-%m-%d')
    else:
        end_date = datetime.now() - timedelta(days=1)  # 어제

    start_date = end_date - timedelta(days=args.days - 1)
    start_str = start_date.strftime('%Y-%m-%d')
    end_str   = end_date.strftime('%Y-%m-%d')

    print(f'📊 GA4 → Supabase daily_funnel (cafe24)')
    print(f'기간: {start_str} ~ {end_str}\n')

    data = fetch_ga4_data(start_str, end_str)
    print(f'✅ GA4 데이터 {len(data)}건 수집')
    for r in data:
        print(f"  {r['date']}: sessions={r['sessions']} new={r['signups']} returning={r['returning_users']} duration={r['avg_duration']}s")

    if data:
        sb = get_supabase()
        n = upsert_to_db(sb, data)
        print(f'\n🎉 {n}건 DB upsert 완료')
    else:
        print('데이터 없음')


if __name__ == '__main__':
    main()
