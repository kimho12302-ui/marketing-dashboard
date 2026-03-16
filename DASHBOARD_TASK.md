# 대시보드 개선 작업 지시서

## 프로젝트
- Next.js 15 + Tailwind + Recharts
- Supabase backend (direct REST API calls)
- Vercel 배포 (auto-deploy on push)

## Supabase 접속 정보
- URL: https://phcfydxgwkmjiogerqmm.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg

## Supabase 테이블
- `daily_sales`: date, brand, channel, orders, revenue, aov
- `daily_ad_spend`: date, brand, channel, spend, impressions, clicks, conversions, conversion_value, roas, ctr, cpc
- `daily_funnel`: date, brand, sessions, users, page_views, add_to_cart, begin_checkout, purchases, purchase_revenue
- `product_sales`: date, brand, channel, category, lineup, product, quantity, buyers, revenue, aov
- `keyword_performance`: date, brand, channel, campaign, keyword, impressions, clicks, spend, conversions, conversion_value, ctr, cpc, roas
- `content_performance`: date, brand, platform, content_type, title, views, likes, comments, shares, saves, engagement_rate, reach, impressions
- `utm_analytics`: date, source, medium, campaign, sessions, users, new_users, bounce_rate, pages_per_session, avg_session_duration, conversions, revenue

## 브랜드 매핑
- nutty: 너티 (간식)
- ironpet: 아이언펫 (헬스케어)
- saip: 사입 (파미나/닥터레이/고네이티브/테라카니스)
- balancelab: 밸런스랩 (아직 데이터 없음)

## 채널 매핑
- smartstore, cafe24, coupang, ably, petfriends, pp
- 광고: meta, naver_search, naver_shopping, google_search, ga4_Performance Max, coupang

## ===== 작업 목록 (우선순위순) =====

### Phase 1: 데이터 연결 수정 (최우선)

1. **채널별 매출 트렌드 차트 데이터 연결** — Sales 탭과 각 브랜드 탭에서 채널별 매출 트렌드가 비어있음. daily_sales 테이블에서 channel별 시계열 데이터를 가져와서 차트에 연결.

2. **구매자 수(buyers) 연결** — product_sales 테이블에 buyers 컬럼 있음. TOP10 상품 등에서 0으로 나옴. 제대로 연결.

3. **퍼널 유입 데이터** — daily_funnel에 sessions, users 있는데 차트에서 0으로 나옴. 제대로 연결.

4. **장바구니 이탈률** — daily_funnel에 add_to_cart, begin_checkout 있는데 이탈률이 0. cart_abandonment_rate = 1 - (begin_checkout / add_to_cart) 계산해서 표시.

5. **키워드 탭 데이터 연결** — keyword_performance 테이블에 478건 있는데 화면에 안 나옴. API route와 프론트 확인 후 수정. 키워드별 impressions, clicks, spend, conversions, roas 보여줘야 함.

6. **google_search 채널 확인** — 구글 검색 광고를 진행 안 하는데 데이터가 잡혀있음. 이게 P-Max에서 잘못 분류된 건지 확인. ga4_Performance Max와 google_search가 따로 있음.

### Phase 2: UI/UX 개선

7. **KPI 카드 클릭 → 드릴다운** — 각 카드 클릭 시 아래에 상세 패널 표시:
   - 매출 클릭 → 브랜드별 매출 바차트
   - 광고비 클릭 → 채널별 광고비 바차트  
   - 영업이익 클릭 → "원가 데이터 필요" placeholder
   - ROAS 클릭 → 채널별 ROAS
   - 주문수 클릭 → 브랜드별 주문수
   - AOV 클릭 → 브랜드별 AOV
   - CAC 클릭 → 채널별 CAC

8. **채널별 광고비 & ROAS 분리** — 현재 같은 섹션에 ROAS가 작은 태그로 표시됨. ROAS를 별도 차트(수평 바)로 크게 표시. 광고비 차트와 ROAS 차트 나란히 또는 상하로.

9. **그래프 색상 다양화** — 현재 파란색 일색. 채널/브랜드별 구분되는 색상 팔레트 적용. 
   - 브랜드: nutty=#6366f1, ironpet=#22c55e, saip=#f97316, balancelab=#ec4899
   - 채널: meta=#3b82f6, naver_search=#00c73c, naver_shopping=#00c73c, google=#ea4335, coupang=#e44d2e

10. **광고비 트렌드 그래프 디자인 개선** — Ads 탭에서 더 깔끔하게. 영역 그래프(AreaChart)나 스택 바 등 고려. 축 라벨, 범례 정리.

11. **퍼널 깔때기 시각화** — 현재 바차트 → 세로 깔때기(funnel) 모양으로 변경. 노출→유입→장바구니→결제→구매 순서. 각 단계별 전환율 표시.

12. **TOP10 상품에 그래프 추가** — 표만 있지 말고 수평 바차트도 같이 보여주기.

13. **CAC/ROAS 사분면 설명 추가** — "High ROAS / Low CAC = 효율적" 등 각 사분면 의미 라벨 추가.

14. **개요 탭 보강** — 현재 너무 심플함. 추가할 것:
    - 퍼널 요약 (세션→구매 전환율, 미니 깔때기)
    - 광고 성과 요약 (총 광고비, 평균 ROAS)
    - 너티 매출 구성 (제품별 파이차트)
    - 밸런스랩 공간 확보 (데이터 없으면 "데이터 없음" placeholder)

15. **Gross Margin ROAS → 오버뷰로 이동** — 현재 Ads 탭에 있는데 Overview에 있는 게 맞음.

16. **CAC 기준 명시** — 카드 또는 툴팁에 "기준: 구매 전환" 표시

### Phase 3: 구조 변경

17. **사입 전용 탭 추가** — sidebar에 "사입" 탭 추가. 내용:
    - 사입 브랜드별 매출 (파미나/닥터레이/고네이티브/테라카니스 각각)
    - 사입 제품별 매출 순위
    - 사입 채널별 매출
    - 일별 트렌드
    - product_sales에서 brand='saip'인 데이터를 lineup(=사입 브랜드명)으로 그룹핑

18. **Sales 전체 → 모든 브랜드 포함** — 현재 너티+아이언펫만 보임. saip, balancelab도 포함해서 전체 브랜드 매출 보여줘야 함. 브랜드별 매출 차트 추가.

19. **브랜드 탭 → 제품별 매출** — 각 브랜드 탭 들어가면 "브랜드별 매출 비교"가 아닌 "제품별 매출 비교"가 나와야 함. 한 depth 더 깊게.

20. **너티/아이언펫 각 탭에서 카테고리 매출 → 제품별 매출로 변경** — 너티는 카테고리가 하나(간식)뿐. 카테고리별 차트 의미없음 → 제품별 매출로 변경.

## 디자인 가이드
- 다크 테마 (bg-zinc-950)
- Tailwind CSS
- Recharts 사용
- 카드: bg-zinc-900 border-zinc-800
- 테마 색상: indigo-500 기본, 브랜드/채널별 구분 색상
- 모바일 반응형 필수

## 검증
- 작업 후 반드시 `npm run build`로 빌드 확인
- 빌드 에러 0개 상태로 마무리할 것
- 가능하면 Supabase에서 직접 데이터 쿼리해서 화면 표시 값과 일치하는지 확인

## 작업 순서
Phase 1 (데이터 연결) → Phase 2 (UI) → Phase 3 (구조) 순서로 진행.
한 항목 수정할 때마다 빌드 확인.
