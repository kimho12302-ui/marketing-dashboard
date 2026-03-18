"""
이상치 감지 → 텔레그램 알림
크론: 매일 10:00 KST
"""
import json, urllib.request, urllib.error, sys, os
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg")

def supabase_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    return json.loads(urllib.request.urlopen(req).read())

def main():
    today = datetime.now()
    # Current period: last 7 days
    to_date = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    from_date = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    # Previous period: 7 days before that
    prev_to = (today - timedelta(days=8)).strftime("%Y-%m-%d")
    prev_from = (today - timedelta(days=14)).strftime("%Y-%m-%d")

    # Fetch current period
    sales = supabase_get("daily_sales", f"select=revenue,orders&date=gte.{from_date}&date=lte.{to_date}")
    ads = supabase_get("daily_ad_spend", f"select=spend,conversion_value&date=gte.{from_date}&date=lte.{to_date}")

    # Fetch previous period
    prev_sales = supabase_get("daily_sales", f"select=revenue,orders&date=gte.{prev_from}&date=lte.{prev_to}")
    prev_ads = supabase_get("daily_ad_spend", f"select=spend,conversion_value&date=gte.{prev_from}&date=lte.{prev_to}")

    revenue = sum(r["revenue"] for r in sales)
    orders = sum(r["orders"] for r in sales)
    ad_spend = sum(r["spend"] for r in ads)
    roas = revenue / ad_spend if ad_spend > 0 else 0

    prev_revenue = sum(r["revenue"] for r in prev_sales)
    prev_orders = sum(r["orders"] for r in prev_sales)
    prev_ad_spend = sum(r["spend"] for r in prev_ads)
    prev_roas = prev_revenue / prev_ad_spend if prev_ad_spend > 0 else 0

    cac = ad_spend / orders if orders > 0 else 0
    prev_cac = prev_ad_spend / prev_orders if prev_orders > 0 else 0

    alerts = []

    # ROAS drop 30%+
    if prev_roas > 0 and roas < prev_roas * 0.7:
        drop = (1 - roas / prev_roas) * 100
        alerts.append(f"🔴 ROAS {drop:.0f}% 하락 ({prev_roas:.2f}x → {roas:.2f}x)")

    # Ad spend surge 50%+
    if prev_ad_spend > 0 and ad_spend > prev_ad_spend * 1.5:
        surge = (ad_spend / prev_ad_spend - 1) * 100
        alerts.append(f"🟡 광고비 {surge:.0f}% 급증 (₩{prev_ad_spend/10000:.0f}만 → ₩{ad_spend/10000:.0f}만)")

    # Revenue drop 20%+
    if prev_revenue > 0 and revenue < prev_revenue * 0.8:
        drop = (1 - revenue / prev_revenue) * 100
        alerts.append(f"🔴 매출 {drop:.0f}% 하락 (₩{prev_revenue/10000:.0f}만 → ₩{revenue/10000:.0f}만)")

    # CAC surge 40%+
    if prev_cac > 0 and cac > prev_cac * 1.4:
        surge = (cac / prev_cac - 1) * 100
        alerts.append(f"🟡 CAC {surge:.0f}% 상승 (₩{prev_cac:,.0f} → ₩{cac:,.0f})")

    # Orders drop 25%+
    if prev_orders > 0 and orders < prev_orders * 0.75:
        drop = (1 - orders / prev_orders) * 100
        alerts.append(f"🟡 주문수 {drop:.0f}% 감소 ({prev_orders}건 → {orders}건)")

    if alerts:
        msg = f"⚠️ 대시보드 이상치 감지 ({from_date}~{to_date})\n\n"
        msg += "\n".join(alerts)
        msg += f"\n\n📊 주간 요약: 매출 ₩{revenue/10000:.0f}만 | 광고비 ₩{ad_spend/10000:.0f}만 | ROAS {roas:.2f}x"
        msg += "\n\n👉 https://ppmi-dashboard-kappa.vercel.app/"
        print(msg)
    else:
        summary = f"✅ 이상치 없음 ({from_date}~{to_date})\n매출 ₩{revenue/10000:.0f}만 | ROAS {roas:.2f}x | 주문 {orders}건"
        print(summary)

if __name__ == "__main__":
    main()
