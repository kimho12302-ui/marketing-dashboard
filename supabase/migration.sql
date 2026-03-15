-- Marketing Dashboard Schema
-- Run this in Supabase SQL Editor

-- daily_sales
CREATE TABLE IF NOT EXISTS daily_sales (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL DEFAULT 'nutty',
  channel TEXT NOT NULL,
  revenue NUMERIC DEFAULT 0,
  orders INTEGER DEFAULT 0,
  avg_order_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand, channel)
);

-- daily_ad_spend
CREATE TABLE IF NOT EXISTS daily_ad_spend (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL DEFAULT 'nutty',
  channel TEXT NOT NULL,
  spend NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand, channel)
);

-- daily_funnel
CREATE TABLE IF NOT EXISTS daily_funnel (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL DEFAULT 'nutty',
  impressions INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  cart_adds INTEGER DEFAULT 0,
  signups INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  repurchases INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand)
);

-- daily_content
CREATE TABLE IF NOT EXISTS daily_content (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL DEFAULT 'nutty',
  viral INTEGER DEFAULT 0,
  non_viral INTEGER DEFAULT 0,
  optimized_blog INTEGER DEFAULT 0,
  brand_content INTEGER DEFAULT 0,
  naver_blog INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand)
);

-- manual_monthly
CREATE TABLE IF NOT EXISTS manual_monthly (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'nutty',
  channel TEXT NOT NULL,
  category TEXT NOT NULL,
  metric TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, brand, channel, category, metric)
);

-- Disable RLS on all tables
ALTER TABLE daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_ad_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_funnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_monthly ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for anon access
CREATE POLICY "Allow all access" ON daily_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON daily_ad_spend FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON daily_funnel FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON daily_content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON manual_monthly FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_sales_date_brand ON daily_sales(date, brand);
CREATE INDEX IF NOT EXISTS idx_daily_ad_spend_date_brand ON daily_ad_spend(date, brand);
CREATE INDEX IF NOT EXISTS idx_daily_funnel_date_brand ON daily_funnel(date, brand);
CREATE INDEX IF NOT EXISTS idx_daily_content_date_brand ON daily_content(date, brand);
CREATE INDEX IF NOT EXISTS idx_manual_monthly_month_brand ON manual_monthly(month, brand);
