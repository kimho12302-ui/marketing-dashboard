# REQUIRED_DATA.md — 마케팅 대시보드 V2.1 필요 데이터 목록

## 기존 테이블 (이미 존재)
| 테이블 | 설명 | 사용 탭 |
|--------|------|---------|
| `daily_sales` | 일별 매출 (브랜드/채널별) | Overview, Sales |
| `daily_ad_spend` | 일별 광고비 (채널별 상세) | Overview, Ads |
| `daily_funnel` | 일별 퍼널 지표 | Overview, Funnel |
| `daily_content` | 일별 콘텐츠 발행 | (legacy) |
| `manual_monthly` | 수동 입력 월간 데이터 | — |

## 신규 테이블 (V2 추가)
| 테이블 | 설명 | 사용 탭 |
|--------|------|---------|
| `product_sales` | 상품별 매출 (브랜드/카테고리/채널) | Sales |
| `keyword_performance` | 키워드별 성과 (네이버/구글) | Keywords |
| `content_performance` | 콘텐츠 종류별 성과 | Content |

## 상세 컬럼

### product_sales
- `date` DATE — 날짜
- `brand` TEXT — nutty / ironpet
- `category` TEXT — 간식 / 사료 / 영양제 / 검사키트
- `product` TEXT — 개별 상품명
- `channel` TEXT — cafe24 / smartstore / coupang / ably
- `revenue` NUMERIC — 매출
- `quantity` INTEGER — 판매 수량
- `buyers` INTEGER — 구매자 수
- `avg_price` NUMERIC — 평균 판매가

### keyword_performance
- `date` DATE — 날짜
- `brand` TEXT — nutty / ironpet
- `platform` TEXT — naver_search / naver_shopping / google_search
- `keyword` TEXT — 검색 키워드
- `impressions` INTEGER — 노출수
- `clicks` INTEGER — 클릭수
- `ctr` NUMERIC — 클릭률
- `cpc` NUMERIC — 클릭당 비용
- `cost` NUMERIC — 총 비용
- `conversions` INTEGER — 전환수

### content_performance
- `date` DATE — 날짜
- `brand` TEXT — nutty / ironpet
- `platform` TEXT — blog / instagram
- `content_type` TEXT — 블로그 / 피드 / 릴스 / 스토리
- `posts` INTEGER — 발행 수
- `impressions` INTEGER — 노출수
- `clicks` INTEGER — 클릭수
- `ctr` NUMERIC — 클릭률
- `followers` INTEGER — 팔로워 수
- `engagement` NUMERIC — 참여율

## 대시보드 탭별 데이터 소스

| 탭 | 데이터 소스 |
|----|-------------|
| 📊 Overview | daily_sales + daily_ad_spend |
| 💰 Sales | product_sales + 4분면 ScatterChart (더미) |
| 📢 Ads Performance | daily_ad_spend + 크리에이티브 분석 (더미) |
| 🔄 Funnel | daily_funnel + 장바구니 이탈률 |
| 🔍 Keywords | keyword_performance |
| 📝 Content | content_performance |
| 💡 Insights | 정적 텍스트 (우선순위별 인사이트 카드) |

## 더미 데이터 범위
- 날짜: 2025-12-01 ~ 2026-03-15
- 브랜드: nutty, ironpet
- 판매채널: cafe24, smartstore, coupang, ably
- 광고채널: meta, naver_search, naver_shopping, google_search, gdn
- 키워드: 25개 (너티 15, 아이언펫 10)
- 콘텐츠: 블로그, 피드, 릴스, 스토리

---

## V2.1 더미 데이터 (실제 데이터로 교체 필요)

### 🔴 호가 직접 입력/설정해야 할 데이터

| 항목 | 현재 상태 | 교체 방법 |
|------|-----------|-----------|
| **COGS (매출원가)** | 매출 × 40% 일괄 적용 | 상품별 원가 데이터 필요. 상품DB에 원가 컬럼 추가 |
| **LTV (고객생애가치)** | AOV × 2.5 더미 계수 | 재구매 데이터 축적 후 코호트 분석으로 실제 LTV 계산 |
| **크리에이티브별 성과** | 8개 더미 크리에이티브 | Meta Ads → Creative 탭에서 API 동기화 가능 |
| **벤치마크 목표값** | revenue 5000만, ROAS 300%, MER 3.0, AOV 20만 | 호가 월별/분기별 목표 설정 |
| **4분면 ScatterChart 데이터** | 15개 더미 포인트 | 실제 상품/채널별 CAC/ROAS 계산 후 교체 |
| **장바구니 이탈률** | daily_funnel 테이블 기반 | GA4 이커머스 이벤트 연동 시 정확도 향상 |

### 🟢 이미 있는 데이터 (동기화만 하면 됨)

| 항목 | 소스 | 연동 방법 |
|------|------|-----------|
| 키워드 성과 | Naver SA 시트 | keyword_performance 테이블에 CSV/API 동기화 |
| 콘텐츠 성과 | Content 탭 | content_performance 테이블에 수동 입력 |
| 채널별 매출 | 호 대시보드 시트 | daily_sales 테이블에 CSV 업로드 |

### 🔵 향후 연동 가능한 소스

| 소스 | 가져올 데이터 | 난이도 |
|------|---------------|--------|
| Meta Ads API | 크리에이티브별 CTR/CPC/ROAS, 광고비 | 중 |
| Google Ads API | 키워드/디스플레이 성과 | 중 |
| 네이버 검색광고 API | 키워드 성과, 입찰가 | 중 |
| GA4 (BigQuery) | 퍼널, 장바구니 이탈, 페이지뷰 | 고 |
| 카페24 API | 주문/매출/상품별 데이터 | 중 |
| 쿠팡 Wing API | 쿠팡 매출/주문 데이터 | 고 |

## 실제 데이터 연동 시
1. product_sales → 카페24/스마트스토어/쿠팡 API or 수동 CSV
2. keyword_performance → 네이버 검색광고 API, Google Ads API
3. content_performance → 네이버 블로그 통계, Instagram Graph API
