"""Create V2 tables via Supabase REST API (using service_role or direct SQL)"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import requests
import json

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

# Try creating tables by upserting a dummy row first, then deleting
# Actually, with just anon key we can't create tables.
# Let's check if we have psycopg2 or can connect directly

# Alternative: use supabase-py to see what's available
from supabase import create_client
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Check existing tables
tables_to_check = ['product_sales', 'keyword_performance', 'channel_sales', 'enhanced_funnel']
for t in tables_to_check:
    try:
        r = sb.table(t).select('*').limit(1).execute()
        print(f"✅ {t} exists ({len(r.data)} rows)")
    except Exception as e:
        err_str = str(e)
        if '404' in err_str or 'does not exist' in err_str or 'relation' in err_str:
            print(f"❌ {t} does NOT exist - needs creation via SQL Editor")
        else:
            print(f"⚠️ {t} error: {err_str[:100]}")

print("\n⚠️ Tables must be created via Supabase SQL Editor.")
print("📋 Copy migration_v2.sql content and run it at:")
print(f"   {SUPABASE_URL.replace('.co', '.co')}/project/phcfydxgwkmjiogerqmm/sql")
print("\nOR use the Supabase Dashboard → SQL Editor")
