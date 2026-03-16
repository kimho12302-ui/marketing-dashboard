-- UTM Analytics 테이블
CREATE TABLE IF NOT EXISTS utm_analytics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    medium TEXT NOT NULL DEFAULT '',
    campaign TEXT NOT NULL DEFAULT '',
    sessions INTEGER DEFAULT 0,
    users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    engaged_sessions INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    revenue NUMERIC(12,2) DEFAULT 0,
    bounce_rate NUMERIC(5,1) DEFAULT 0,
    avg_session_duration NUMERIC(8,1) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, source, medium, campaign)
);

CREATE INDEX IF NOT EXISTS idx_utm_date ON utm_analytics(date);
CREATE INDEX IF NOT EXISTS idx_utm_source ON utm_analytics(source, medium);
