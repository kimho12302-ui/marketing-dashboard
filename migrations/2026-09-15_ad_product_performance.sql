-- 광고 성과의 제품(상품) 축.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행.
--   anon key 로는 DDL 이 안 되고(PGRST202/PGRST205), 이 저장소에 service role key 가 없다.
--   기존 테이블도 create_tables_v2.py 주석대로 SQL Editor 수동 실행으로 만들었다.
--
-- 왜 daily_ad_spend 에 컬럼을 추가하지 않고 별도 테이블인가:
--   /api/ads 가 daily_ad_spend 를 행 단위로 합산한다(route.ts:25 select * → 합산).
--   같은 (date, channel, brand) 에 '브랜드 합계 행'과 '상품별 분해 행'이 공존하면
--   무조건 이중계상된다. 그리고 기존 upsert 4곳이 전부 on_conflict='date,channel,brand'
--   로 하드코딩돼 있어 충돌키를 바꾸면 같이 깨진다.
--   별도 테이블이면 기존 코드 변경이 0곳이고, 이중계상이 구조적으로 불가능하다.
--   덤으로 SUM(상품) vs daily_ad_spend 대조가 상시 데이터 품질 점검이 된다.

create table if not exists ad_product_performance (
  id bigint generated always as identity primary key,
  date date not null,
  channel text not null,              -- 'gfa' 로 시작. 다른 매체로 확장 가능
  brand text not null,                -- daily_ad_spend.brand 와 같은 값 체계
  product_id text not null,           -- 플랫폼 상품 ID (네이버 GFA 는 스마트스토어 상품번호)
  product_name text not null,
  lineup text,                        -- 밸런스랩 검사 라인업(큐모발검사 등). 펫 브랜드는 null
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions bigint not null default 0,
  conversion_value numeric(14,2) not null default 0,
  roas numeric(10,4) not null default 0,
  ctr numeric(10,4) not null default 0,
  cpc numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint ad_product_performance_unique unique (date, channel, brand, product_id)
);

create index if not exists idx_app_brand_date on ad_product_performance (brand, date);
create index if not exists idx_app_date       on ad_product_performance (date);
create index if not exists idx_app_product    on ad_product_performance (product_id);
