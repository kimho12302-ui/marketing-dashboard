import sys; sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials

creds = Credentials.from_service_account_file(
    r'C:\Users\김호\.naver-searchad\google-service-account.json',
    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']
)
gc = gspread.authorize(creds)

# Meta Ads
print("=== META ADS ===")
sheet = gc.open_by_key('1JaKZBYsAhd7nsDzNZAYRC2bp66-K1Nd0noDr1JzOqBs')
for ws in sheet.worksheets():
    try:
        recs = ws.get_all_records()
        cols = list(recs[0].keys())[:10] if recs else []
        print(f"  [{ws.title}]: {len(recs)} rows | cols: {cols}")
    except Exception as e:
        print(f"  [{ws.title}]: error - {e}")

# Naver SA
print("\n=== NAVER SA ===")
sheet2 = gc.open_by_key('1ky1rAsa8draGigQixBRSNMOPIEYH0ygsXiF_mYhDwgo')
for ws in sheet2.worksheets():
    try:
        recs = ws.get_all_records()
        cols = list(recs[0].keys())[:10] if recs else []
        print(f"  [{ws.title}]: {len(recs)} rows | cols: {cols}")
    except Exception as e:
        print(f"  [{ws.title}]: error - {e}")

# GA4
print("\n=== GA4 ===")
sheet3 = gc.open_by_key('1iFhY2G9fm4wxDeG8D1mhSzEEmu428GQYcsCHbY2M66c')
for ws in sheet3.worksheets():
    try:
        recs = ws.get_all_records()
        cols = list(recs[0].keys())[:10] if recs else []
        print(f"  [{ws.title}]: {len(recs)} rows | cols: {cols}")
    except Exception as e:
        print(f"  [{ws.title}]: error - {e}")

# Cafe24
print("\n=== CAFE24 ===")
sheet4 = gc.open_by_key('1YT3_RMO8XJYVxf3i7kzb50cVGPU5fMChhqGCRaa6NTw')
for ws in sheet4.worksheets():
    try:
        recs = ws.get_all_records()
        cols = list(recs[0].keys())[:10] if recs else []
        print(f"  [{ws.title}]: {len(recs)} rows | cols: {cols}")
    except Exception as e:
        print(f"  [{ws.title}]: error - {e}")
