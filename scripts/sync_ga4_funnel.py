"""GA4 Data API → 통계 시트 Funnel 탭 자동 동기화"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from datetime import datetime, timedelta
from google.oauth2.service_account import Credentials
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Dimension, Metric
import gspread

# Config
SA_JSON = r'C:\Users\김호\.naver-searchad\google-service-account.json'
GA4_PROPERTY = 'properties/433673281'
STATS_SHEET_ID = '1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio'

def fetch_ga4_funnel_data(start_date, end_date):
    """GA4에서 Funnel용 기본 데이터 가져오기"""
    creds = Credentials.from_service_account_file(SA_JSON)
    client = BetaAnalyticsDataClient(credentials=creds)

    request = RunReportRequest(
        property=GA4_PROPERTY,
        dimensions=[Dimension(name='date')],
        metrics=[
            Metric(name='sessions'),
            Metric(name='totalUsers'),
            Metric(name='newUsers'),
            Metric(name='activeUsers'),
            Metric(name='screenPageViews'),
            Metric(name='averageSessionDuration'),
        ],
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
    )

    resp = client.run_report(request)
    
    results = []
    for row in resp.rows:
        date_raw = row.dimension_values[0].value  # YYYYMMDD
        date_obj = datetime.strptime(date_raw, '%Y%m%d')
        
        sessions = int(row.metric_values[0].value)
        total_users = int(row.metric_values[1].value)
        new_users = int(row.metric_values[2].value)
        active_users = int(row.metric_values[3].value)
        page_views = int(row.metric_values[4].value)
        avg_duration = int(float(row.metric_values[5].value))
        
        returning_users = total_users - new_users
        
        results.append({
            'date': date_obj,
            'page_views': page_views,         # T열: 유입
            'new_users': new_users,           # U열: 신규
            'returning_users': returning_users,  # V열: 재방문
            'active_users': active_users,     # W열: DAU
            'sessions': sessions,             # X열: 세션
            'avg_duration': avg_duration,     # Y열: 평균 체류시간(초)
        })
    
    return results


def write_to_funnel_tab(data_list):
    """통계 시트 Funnel 탭에 업데이트 (X,Y열만)"""
    creds = Credentials.from_service_account_file(
        SA_JSON,
        scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    gc = gspread.authorize(creds)
    
    sheet = gc.open_by_key(STATS_SHEET_ID)
    ws = sheet.worksheet('Funnel')
    all_values = ws.get_all_values()
    
    batch_data = []
    matched = 0
    
    for data in data_list:
        date_obj = data['date']
        date_label = f"{date_obj.month}월 {date_obj.day}일"
        
        # Funnel 탭에서 날짜 행 찾기
        for i, row in enumerate(all_values):
            if i == 0:
                continue  # 헤더 스킵
            cell_a = str(row[0]) if row else ""
            
            if date_label in cell_a:
                row_num = i + 1
                
                batch_data.extend([
                    {'range': f'X{row_num}', 'values': [[data['sessions']]]},
                    {'range': f'Y{row_num}', 'values': [[data['avg_duration']]]},
                ])
                
                matched += 1
                print(f"  ✅ {date_label} (행{row_num}): 세션={data['sessions']} | 체류={data['avg_duration']}")
                break
    
    if batch_data:
        ws.batch_update(batch_data)
        print(f"\n🎉 {matched}개 날짜, {len(batch_data)}개 셀 업데이트!")
        return matched
    else:
        print("\n❌ 매칭된 날짜 없음")
        return 0


def main():
    import argparse
    parser = argparse.ArgumentParser(description='GA4 Data API → Funnel 탭')
    parser.add_argument('--date', help='특정 날짜 (YYYY-MM-DD)')
    parser.add_argument('--days', type=int, default=1, help='N일치 (기본: 1)')
    args = parser.parse_args()
    
    # 날짜 범위 계산
    if args.date:
        end_date = datetime.strptime(args.date, '%Y-%m-%d')
    else:
        end_date = datetime.now() - timedelta(days=1)  # 어제
    
    start_date = end_date - timedelta(days=args.days - 1)
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    print(f'📊 GA4 API → Funnel 탭 동기화')
    print(f'Property: {GA4_PROPERTY}')
    print(f'기간: {start_str} ~ {end_str}\n')
    
    # GA4 데이터 수집
    data_list = fetch_ga4_funnel_data(start_str, end_str)
    print(f'✅ GA4 데이터 {len(data_list)}건 수집\n')
    
    # Funnel 탭 업데이트
    if data_list:
        write_to_funnel_tab(data_list)
    else:
        print('데이터 없음')


if __name__ == '__main__':
    main()
