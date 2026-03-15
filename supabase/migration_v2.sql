-- ============================================
-- Marketing Dashboard V2 — Migration
-- 새 테이블 3개: product_sales, keyword_performance, content_performance
-- ============================================

-- 1. product_sales
CREATE TABLE IF NOT EXISTS product_sales (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  product TEXT NOT NULL,
  channel TEXT NOT NULL,
  revenue NUMERIC(12,0) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  buyers INTEGER NOT NULL DEFAULT 0,
  avg_price NUMERIC(10,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand, product, channel)
);

-- 2. keyword_performance
CREATE TABLE IF NOT EXISTS keyword_performance (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL,
  platform TEXT NOT NULL,
  keyword TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4) NOT NULL DEFAULT 0,
  cpc NUMERIC(10,0) NOT NULL DEFAULT 0,
  cost NUMERIC(12,0) NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand, platform, keyword)
);

-- 3. content_performance
CREATE TABLE IF NOT EXISTS content_performance (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  brand TEXT NOT NULL,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  posts INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4) NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0,
  engagement NUMERIC(6,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, brand, platform, content_type)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_sales_date_brand ON product_sales(date, brand);
CREATE INDEX IF NOT EXISTS idx_product_sales_channel ON product_sales(channel);
CREATE INDEX IF NOT EXISTS idx_product_sales_category ON product_sales(category);

CREATE INDEX IF NOT EXISTS idx_keyword_perf_date_brand ON keyword_performance(date, brand);
CREATE INDEX IF NOT EXISTS idx_keyword_perf_platform ON keyword_performance(platform);
CREATE INDEX IF NOT EXISTS idx_keyword_perf_keyword ON keyword_performance(keyword);

CREATE INDEX IF NOT EXISTS idx_content_perf_date_brand ON content_performance(date, brand);
CREATE INDEX IF NOT EXISTS idx_content_perf_platform ON content_performance(platform);

-- ============================================
-- RLS (Row Level Security)
-- ============================================
ALTER TABLE product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;

-- Public read access (anon key)
CREATE POLICY "Allow public read product_sales" ON product_sales
  FOR SELECT USING (true);

CREATE POLICY "Allow public read keyword_performance" ON keyword_performance
  FOR SELECT USING (true);

CREATE POLICY "Allow public read content_performance" ON content_performance
  FOR SELECT USING (true);

-- Insert/Update for service role or anon (for dummy data insertion)
CREATE POLICY "Allow public insert product_sales" ON product_sales
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public insert keyword_performance" ON keyword_performance
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public insert content_performance" ON content_performance
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update product_sales" ON product_sales
  FOR UPDATE USING (true);

CREATE POLICY "Allow public update keyword_performance" ON keyword_performance
  FOR UPDATE USING (true);

CREATE POLICY "Allow public update content_performance" ON content_performance
  FOR UPDATE USING (true);
