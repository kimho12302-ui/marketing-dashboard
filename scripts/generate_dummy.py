# -*- coding: utf-8 -*-
"""
Marketing Dashboard V2 — Dummy Data Generator
새 테이블 3개(product_sales, keyword_performance, content_performance)에 더미 데이터 삽입
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import random
import json
from datetime import date, timedelta
from urllib import request as urllib_request

SUPABASE_URL = "https://phcfydxgwkmjiogerqmm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"

START_DATE = date(2025, 12, 1)
END_DATE = date(2026, 3, 15)

BRANDS = ["nutty", "ironpet"]
CHANNELS = ["cafe24", "smartstore", "coupang", "ably"]

PRODUCTS = {
    "nutty": [
        {"product": "너티 사운드 냠단호박", "category": "간식", "base_price": 12900, "base_qty": (15, 45)},
        {"product": "너티 사운드 바삭닭가슴살", "category": "간식", "base_price": 13900, "base_qty": (12, 40)},
        {"product": "너티 하루루틴", "category": "영양제", "base_price": 29900, "base_qty": (5, 20)},
        {"product": "파미나 N&D", "category": "사료", "base_price": 45000, "base_qty": (3, 12)},
        {"product": "테라카니스", "category": "사료", "base_price": 38000, "base_qty": (2, 8)},
    ],
    "ironpet": [
        {"product": "아이언펫 반려견 영양분석키트", "category": "검사키트", "base_price": 89000, "base_qty": (1, 6)},
        {"product": "아이언펫 반려묘 영양분석키트", "category": "검사키트", "base_price": 89000, "base_qty": (1, 4)},
    ],
}

KEYWORDS = {
    "nutty": [
        "강아지간식", "반려견영양제", "펫푸드", "너티간식", "강아지사료 추천",
        "동결건조간식", "강아지 건강간식", "강아지 단호박", "닭가슴살 간식",
        "강아지 하루루틴", "파미나사료", "테라카니스사료", "프리미엄 강아지간식",
        "강아지 영양보충제", "반려견 식품",
    ],
    "ironpet": [
        "반려견 건강검사", "강아지 영양분석", "반려묘 건강검사", "펫 혈액검사",
        "아이언펫", "반려동물 영양검사", "강아지 체성분분석", "고양이 영양검사",
        "반려견 모발검사", "펫 건강체크",
    ],
}

AD_PLATFORMS = ["naver_search", "naver_shopping", "google_search"]
CONTENT_PLATFORMS_TYPES = [
    ("blog", "블로그"),
    ("instagram", "피드"),
    ("instagram", "릴스"),
    ("instagram", "스토리"),
]


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def supabase_upsert(table, rows, batch_size=500):
    """Upsert rows in batches using Supabase REST API."""
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        req = urllib_request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
        )
        try:
            with urllib_request.urlopen(req) as resp:
                total += len(batch)
        except Exception as e:
            body_text = ""
            if hasattr(e, 'read'):
                body_text = e.read().decode('utf-8', errors='replace')
            print(f"  ⚠ Error on batch {i//batch_size + 1}: {e}")
            if body_text:
                print(f"    Response: {body_text[:300]}")
    return total


def gen_product_sales():
    """Generate product_sales dummy data."""
    rows = []
    for d in daterange(START_DATE, END_DATE):
        day_of_week = d.weekday()
        # Weekend boost
        weekend_mult = 1.3 if day_of_week >= 5 else 1.0
        # Monthly trend (slight growth)
        month_offset = (d - START_DATE).days / 30
        growth = 1.0 + month_offset * 0.03

        for brand, products in PRODUCTS.items():
            for prod in products:
                for channel in CHANNELS:
                    # Channel weight
                    ch_weight = {"cafe24": 0.35, "smartstore": 0.30, "coupang": 0.25, "ably": 0.10}
                    w = ch_weight.get(channel, 0.2)

                    base_min, base_max = prod["base_qty"]
                    qty = max(0, int(random.gauss(
                        (base_min + base_max) / 2 * w * weekend_mult * growth,
                        (base_max - base_min) / 4
                    )))

                    if qty == 0 and random.random() < 0.3:
                        continue  # Skip some zero entries

                    price_var = prod["base_price"] * random.uniform(0.95, 1.05)
                    revenue = int(qty * price_var)
                    buyers = max(1, int(qty * random.uniform(0.7, 0.95))) if qty > 0 else 0

                    rows.append({
                        "date": d.isoformat(),
                        "brand": brand,
                        "category": prod["category"],
                        "product": prod["product"],
                        "channel": channel,
                        "revenue": revenue,
                        "quantity": qty,
                        "buyers": buyers,
                        "avg_price": int(price_var),
                    })
    return rows


def gen_keyword_performance():
    """Generate keyword_performance dummy data."""
    rows = []
    for d in daterange(START_DATE, END_DATE):
        growth = 1.0 + (d - START_DATE).days / 30 * 0.02

        for brand, keywords in KEYWORDS.items():
            for keyword in keywords:
                for platform in AD_PLATFORMS:
                    # Base impressions vary by keyword popularity
                    base_imp = random.randint(500, 5000)
                    impressions = int(base_imp * growth * random.uniform(0.8, 1.2))

                    # CTR varies: brand keywords higher
                    is_brand_kw = brand[:3] in keyword or "아이언펫" in keyword or "너티" in keyword
                    base_ctr = random.uniform(0.03, 0.08) if is_brand_kw else random.uniform(0.01, 0.04)
                    ctr = round(base_ctr * random.uniform(0.8, 1.2), 4)

                    clicks = max(0, int(impressions * ctr))
                    cpc = int(random.uniform(200, 1500) if platform != "google_search" else random.uniform(300, 2000))
                    cost = clicks * cpc
                    conv_rate = random.uniform(0.01, 0.05)
                    conversions = max(0, int(clicks * conv_rate))

                    rows.append({
                        "date": d.isoformat(),
                        "brand": brand,
                        "platform": platform,
                        "keyword": keyword,
                        "impressions": impressions,
                        "clicks": clicks,
                        "ctr": round(ctr, 4),
                        "cpc": cpc,
                        "cost": cost,
                        "conversions": conversions,
                    })
    return rows


def gen_content_performance():
    """Generate content_performance dummy data."""
    rows = []
    for d in daterange(START_DATE, END_DATE):
        growth = 1.0 + (d - START_DATE).days / 30 * 0.04

        for brand in BRANDS:
            base_followers = 5200 if brand == "nutty" else 1800
            followers = int(base_followers * growth)

            for platform, content_type in CONTENT_PLATFORMS_TYPES:
                # Not every type every day
                if content_type in ("릴스", "스토리") and random.random() < 0.3:
                    continue
                if content_type == "블로그" and random.random() < 0.2:
                    continue

                posts = random.randint(0, 3) if content_type == "블로그" else random.randint(0, 2)
                if posts == 0:
                    posts = 1 if random.random() < 0.5 else 0
                if posts == 0:
                    continue

                imp_base = {"블로그": 2000, "피드": 3000, "릴스": 8000, "스토리": 1500}
                impressions = int(imp_base.get(content_type, 2000) * posts * random.uniform(0.5, 2.0) * growth)

                ctr = round(random.uniform(0.02, 0.08), 4)
                clicks = int(impressions * ctr)
                engagement = round(random.uniform(0.02, 0.12), 4)

                rows.append({
                    "date": d.isoformat(),
                    "brand": brand,
                    "platform": platform,
                    "content_type": content_type,
                    "posts": posts,
                    "impressions": impressions,
                    "clicks": clicks,
                    "ctr": round(ctr, 4),
                    "followers": followers,
                    "engagement": round(engagement, 4),
                })
    return rows


def main():
    print("🚀 Marketing Dashboard V2 — Dummy Data Generator")
    print(f"📅 Range: {START_DATE} ~ {END_DATE}")
    print()

    # Product Sales
    print("📦 Generating product_sales...")
    ps_rows = gen_product_sales()
    print(f"  Generated {len(ps_rows)} rows")
    count = supabase_upsert("product_sales", ps_rows)
    print(f"  ✅ Inserted {count} rows into product_sales")
    print()

    # Keyword Performance
    print("🔍 Generating keyword_performance...")
    kw_rows = gen_keyword_performance()
    print(f"  Generated {len(kw_rows)} rows")
    count = supabase_upsert("keyword_performance", kw_rows)
    print(f"  ✅ Inserted {count} rows into keyword_performance")
    print()

    # Content Performance
    print("📝 Generating content_performance...")
    ct_rows = gen_content_performance()
    print(f"  Generated {len(ct_rows)} rows")
    count = supabase_upsert("content_performance", ct_rows)
    print(f"  ✅ Inserted {count} rows into content_performance")
    print()

    print("🎉 Done! All dummy data inserted successfully.")


if __name__ == "__main__":
    main()
