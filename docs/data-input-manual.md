# 📋 PPMI 대시보드 데이터 입력 매뉴얼

> 2년차 마케터가 매일 5분 안에 완료할 수 있도록 설계

---

## 🔄 자동 수집 (건드릴 필요 없음)

| 데이터 | 소스 | 주기 | 크론 |
|--------|------|------|------|
| Meta 광고비/성과 | Meta Ads API | 매일 자동 | meta-ads-daily |
| 네이버 검색광고 | 네이버 SA API | 매일 자동 | naver-searchad-daily |
| Google Ads (P-Max, Search) | Google Ads API | 매일 자동 | google-ads-daily |
| GA4 퍼널 데이터 | GA4 Data API | 매일 자동 | sync cron |
| Google Search Console | GSC API | 매일 자동 | sync cron |
| 매출 데이터 (카페24) | Stats 시트 → DB | 매일 자동 | sync cron |

**→ 이것들은 자동이라 신경 안 써도 됨.**

---

## ✅ 매일 해야 할 것 (5분)

### Step 1: 쿠팡 광고비 (2분)
1. 쿠팡 광고센터 로그인 → 캠페인 관리
2. 어제 날짜 필터 → 엑셀 다운로드
3. 대시보드 Settings → 📋 일일 입력 → "쿠팡 광고비" 업로드

> 💡 **파일 위치**: 쿠팡 광고센터 → 보고서 → 캠페인별 실적 → XLSX 다운로드

### Step 2: GFA 광고비 (1분)
1. 네이버 GFA 광고 관리 → 보고서
2. 어제 날짜 → 총 비용 확인
3. 대시보드 Settings → 수동 광고비 → GFA 입력

> 💡 **GFA API가 없어서 수동 입력 필수**

### Step 3: 인플루언서/체험단 비용 (1분)
- 어제 집행한 인플루언서/체험단/공구 비용이 있으면 입력
- 없으면 스킵

### Step 4: 건별비용 (1분)
- 택배 추가 비용, 기타 마케팅 비용 등 건별 발생 비용
- 없으면 스킵

### Step 5: 대시보드 확인 (30초)
- Overview 페이지 → 어제 수치 정상인지 눈으로 확인
- 이상치 알림 배너가 뜨면 원인 확인

---

## 📅 매주 해야 할 것 (금요일, 10분)

### 주간 리뷰
1. Overview에서 이번 주 vs 지난주 비교
2. 채널별 ROAS 변화 확인
3. 크리에이티브 성과 확인 → 하위 소재 정리
4. Funnel 전환율 변화 확인

---

## 📅 매월 해야 할 것 (월초, 15분)

### 1. 배송비 입력 (3분)
- 택배사 정산 기준 전월 총 배송비
- Settings → 배송비 탭 → 월 총액 + 건수 입력

### 2. 목표 설정 (5분)
- Settings → 🎯 목표 설정 → 이번 달 목표 입력
- 매출, ROAS, 주문수, CAC, 전환율
- "추천 목표" 버튼 → 직전 3개월 평균 × 1.1

### 3. 제품 원가 업데이트 (해당 시)
- 신규 제품 추가됐으면 Settings → 제품 원가 → CSV 업로드 또는 인라인 입력
- 기존 제품 원가 변동 시 수정

---

## 🚨 트러블슈팅

### "데이터가 안 보여요"
1. Settings → 📊 데이터 현황 확인
2. ⚠️ 표시된 테이블이 있으면 → 해당 크론 확인
3. 넛봇에게 "데이터 상태 확인해줘" 메시지

### "매출이 이상하게 나와요"
- daily_sales는 카페24 기준 → 스마트스토어/쿠팡 매출 별도
- 정확한 전체 매출은 Sales 탭 확인

### "광고비가 실제보다 적어요"
- 자동 수집 안 되는 채널: GFA, 스마트스토어 광고, 인플루언서
- → 수동 입력 필요 (매일 Step 2-4)

### "ROAS가 0이에요"
- 네이버 검색/쇼핑: 전환매출 데이터가 시트에 없을 수 있음
- P-Max: 실제로 전환이 적을 수 있음 (GA4 Ads 탭에서 확인)

---

## ⏰ 추천 루틴

```
09:00  출근 → 대시보드 Overview 확인 (30초)
09:05  쿠팡 광고비 + GFA 입력 (3분)
09:10  이상치 있으면 원인 파악
...
17:00  퇴근 전 → 오늘 건별비용 정리 (있으면)
금요일  주간 리뷰
월초    배송비 + 목표 설정
```

---

## 📁 데이터 흐름도

```
[자동]
Meta API ──→ daily_ad_spend
Naver SA ──→ daily_ad_spend + keyword_performance
Google Ads ─→ daily_ad_spend
GA4 ───────→ daily_funnel
GSC ───────→ keyword_performance
Stats 시트 ─→ daily_sales + product_sales

[수동 (대시보드에서)]
쿠팡 XLSX ──→ daily_ad_spend
GFA 금액 ───→ daily_ad_spend
인플루언서 ─→ daily_ad_spend
건별비용 ───→ manual_monthly (misc_cost)
배송비 ────→ manual_monthly (shipping_cost)
제품원가 ───→ product_costs
목표 ──────→ manual_monthly (target)
```
