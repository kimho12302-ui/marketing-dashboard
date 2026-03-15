import sys; sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials

creds = Credentials.from_service_account_file(
    r'C:\Users\김호\.naver-searchad\google-service-account.json',
    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']
)
gc = gspread.authorize(creds)

# Ho's dashboard sheet - all tabs
sheet = gc.open_by_key('1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio')
for ws in sheet.worksheets():
    print(f'[{ws.title}]')
    try:
        vals = ws.get_all_values()
        print(f'  rows: {len(vals)}')
        if len(vals) > 0:
            print(f'  header: {vals[0][:20]}')
        if len(vals) > 1:
            print(f'  row1: {vals[1][:20]}')
        if len(vals) > 2:
            print(f'  row2: {vals[2][:20]}')
    except Exception as e:
        print(f'  error: {e}')
    print()
