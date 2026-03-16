"""GA4 UTM 데이터 → 구글시트 + Supabase 자동 동기화"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from datetime import datetime, timedelta
from google.oauth2.service_account import Credentials
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Dimension, Metric, OrderBy
from googleapiclient.discovery import build
from supabase import create_client

# Config
SA_JSON = r'C:\Users\김호\.naver-searchad\google-service-account.json'
GA4_PROPERTY = 'properties/433673281'
GA4_SHEET_ID = '1iFhY2G9fm4wxDeG8D1mhSzEEmu428GQYcsCHbY2M66c'
UTM_TAB = 'UTM_유입분석'
SUPABASE_URL = 'https://phcfydxgwkmjiogerqmm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg'


def fetch_utm_data(start_date, end_date):
    """GA4에서 UTM별 데이터 가져오기"""
    creds = Credentials.from_service_account_file(SA_JSON)
    client = BetaAnalyticsDataClient(credentials=creds)

    request = RunReportRequest(
        property=GA4_PROPERTY,
        dimensions=[
            Dimension(name='date'),
            Dimension(name='sessionSource'),
            Dimension(name='sessionMedium'),
            Dimension(name='sessionCampaignName'),
        ],
        metrics=[
            Metric(name='sessions'),
            Metric(name='totalUsers'),
            Metric(name='newUsers'),
            Metric(name='engagedSessions'),
            Metric(name='conversions'),
            Metric(name='totalRevenue'),
            Metric(name='bounceRate'),
            Metric(name='averageSessionDuration'),
        ],
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        order_bys=[
            OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name='date'), desc=True),
            OrderBy(metric=OrderBy.MetricOrderBy(metric_name='sessions'), desc=True),
        ],
        limit=10000
    )

    resp = client.run_report(request)
    rows = []
    for row in resp.rows:
        date_raw = row.dimension_values[0].value  # YYYYMMDD
        date = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}"
        source = row.dimension_values[1].value
        medium = row.dimension_values[2].value
        campaign = row.dimension_values[3].value

        sessions = int(row.metric_values[0].value)
        users = int(row.metric_values[1].value)
        new_users = int(row.metric_values[2].value)
        engaged = int(row.metric_values[3].value)
        conversions = int(float(row.metric_values[4].value))
        revenue = float(row.metric_values[5].value)
        bounce_rate = round(float(row.metric_values[6].value) * 100, 1)
        avg_duration = round(float(row.metric_values[7].value), 1)

        rows.append({
            'date': date,
            'source': source,
            'medium': medium,
            'campaign': campaign,
            'sessions': sessions,
            'users': users,
            'new_users': new_users,
            'engaged_sessions': engaged,
            'conversions': conversions,
            'revenue': revenue,
            'bounce_rate': bounce_rate,
            'avg_session_duration': avg_duration,
        })

    return rows


def upload_to_sheets(data):
    """구글시트에 업로드"""
    creds = Credentials.from_service_account_file(SA_JSON, scopes=[
        'https://www.googleapis.com/auth/spreadsheets'
    ])
    sheets = build('sheets', 'v4', credentials=creds)

    # 탭 확인/생성
    meta = sheets.spreadsheets().get(spreadsheetId=GA4_SHEET_ID).execute()
    tabs = [s['properties']['title'] for s in meta['sheets']]
    if UTM_TAB not in tabs:
        sheets.spreadsheets().batchUpdate(spreadsheetId=GA4_SHEET_ID, body={
            'requests': [{'addSheet': {'properties': {'title': UTM_TAB}}}]
        }).execute()
        print(f'  탭 생성: {UTM_TAB}')

    # 기존 데이터의 날짜 범위 확인
    header = ['날짜', '소스', '매체', '캠페인', '세션', '유저', '신규유저',
              '참여세션', '전환', '매출', '이탈률(%)', '평균체류시간(초)']

    # 기존 데이터 읽기
    try:
        existing = sheets.spreadsheets().values().get(
            spreadsheetId=GA4_SHEET_ID, range=f'{UTM_TAB}!A:D'
        ).execute().get('values', [])
        existing_keys = set()
        for row in existing[1:]:
            if len(row) >= 4:
                existing_keys.add(tuple(row[:4]))
    except:
        existing_keys = set()

    new_rows = []
    for d in data:
        key = (d['date'], d['source'], d['medium'], d['campaign'])
        if key not in existing_keys:
            new_rows.append([
                d['date'], d['source'], d['medium'], d['campaign'],
                d['sessions'], d['users'], d['new_users'],
                d['engaged_sessions'], d['conversions'], d['revenue'],
                d['bounce_rate'], d['avg_session_duration']
            ])

    if not existing_keys:
        values = [header] + new_rows
        sheets.spreadsheets().values().update(
            spreadsheetId=GA4_SHEET_ID, range=f'{UTM_TAB}!A1',
            valueInputOption='RAW', body={'values': values}
        ).execute()
    elif new_rows:
        sheets.spreadsheets().values().append(
            spreadsheetId=GA4_SHEET_ID, range=f'{UTM_TAB}!A1',
            valueInputOption='RAW', body={'values': new_rows}
        ).execute()

    return len(new_rows)


def upload_to_supabase(data):
    """Supabase utm_analytics에 upsert"""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # dedup
    seen = set()
    deduped = []
    for d in data:
        key = (d['date'], d['source'], d['medium'], d['campaign'])
        if key not in seen:
            seen.add(key)
            deduped.append(d)

    batch_size = 50
    total = 0
    for i in range(0, len(deduped), batch_size):
        batch = deduped[i:i+batch_size]
        sb.table('utm_analytics').upsert(
            batch, on_conflict='date,source,medium,campaign'
        ).execute()
        total += len(batch)

    return total


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=7)
    parser.add_argument('--start', type=str, default=None)
    parser.add_argument('--end', type=str, default=None)
    args = parser.parse_args()

    end_date = args.end or datetime.now().strftime('%Y-%m-%d')
    start_date = args.start or (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')

    print(f'=== GA4 UTM 데이터 동기화 ===')
    print(f'기간: {start_date} ~ {end_date}\n')

    data = fetch_utm_data(start_date, end_date)
    print(f'GA4에서 {len(data)}행 수집')

    if data:
        cnt = upload_to_sheets(data)
        print(f'✅ 구글시트: {cnt}건 추가')

        try:
            cnt = upload_to_supabase(data)
            print(f'✅ Supabase: {cnt}건 upsert')
        except Exception as e:
            print(f'⚠️ Supabase 실패 (테이블 없을 수 있음): {e}')

    print('\n=== 완료 ===')


if __name__ == '__main__':
    main()
