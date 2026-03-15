import sys; sys.stdout.reconfigure(encoding='utf-8')
import gspread
from google.oauth2.service_account import Credentials

creds = Credentials.from_service_account_file(
    r'C:\Users\김호\.naver-searchad\google-service-account.json',
    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']
)
gc = gspread.authorize(creds)
sheet = gc.open_by_key('1FzxDCyR9FyAIduf7Q0lfUIOzvSqVlod21eOFqaPrXio')

# Total tab - check actual date values
ws = sheet.worksheet("Total")
vals = ws.get_all_values()
print("=== Total ===")
for i, row in enumerate(vals[:8]):
    print(f"  row{i}: [{row[0]}] [{row[1]}] [{row[2]}] [{row[3]}] [{row[4]}]")

# Sales tab
ws2 = sheet.worksheet("Sales")
vals2 = ws2.get_all_values()
print("\n=== Sales ===")
for i, row in enumerate(vals2[:5]):
    print(f"  row{i}: [{row[0]}] [{row[1]}] [{row[2]}] [{row[3]}] [{row[4]}] [{row[5]}]")
# Find first data row
for i, row in enumerate(vals2):
    if row[1] and row[1] not in ['주문일시', '']:
        print(f"\n  first data row{i}: {row[:11]}")
        break

# Paid tab
ws3 = sheet.worksheet("Paid")
vals3 = ws3.get_all_values()
print("\n=== Paid ===")
for i, row in enumerate(vals3[:5]):
    print(f"  row{i}: [{row[0]}] [{row[1]}]")
for i, row in enumerate(vals3[2:7], start=2):
    print(f"  data row{i}: DATE=[{row[0]}] COST=[{row[1]}]")
