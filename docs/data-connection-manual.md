# PPMI 대시보드 — 데이터 연결 & 입력 매뉴얼

> 최종 업데이트: 2026-03-20
> 대시보드 URL: https://ppmi-dashboard-kappa.vercel.app

---

## 1. 데이터 흐름 개요

```
[자동 수집]                    [수기 입력]
Meta Ads API ──┐               ┌── 쿠팡 광고 (파일)
Google Ads API ─┤               ├── GFA 광고비 (수기)
Naver SA API ──┤  ──→ DB ←──  ├── 스마트스토어 광고 (수기)
GA4 Data API ──┘               ├── 판매 실적 (이카운트 파일)
                               ├── 쿠팡 퍼널 (셀러인사이트 파일)
                               └── 건별비용 (수기)
                    │
                    ▼
              대시보드 표시
                    │
                    ▼
              Google Sheets (아카이빙)
```

---

## 2. 자동 수집 (API 연결)

### 2-1. Meta Ads (✅ 연결됨)
- **무엇을**: 너티 + 아이언펫 광고 계정의 일별 광고비/노출/클릭/ROAS
- **어떻게**: 싱크 버튼 클릭 시 Meta Graph API에서 직접 가져옴
- **토큰**: `META_ADS_TOKEN` (Vercel 환경변수)
- **만료**: 2026년 5월 17일 (60일마다 갱신 필요)
- **갱신 방법**:
  1. [Meta Business Settings](https://business.facebook.com/settings/system-users) 접속
  2. 시스템 사용자 → 토큰 생성 → `ads_read` 권한
  3. Vercel → Settings → Environment Variables → `META_ADS_TOKEN` 업데이트
  4. git push (재배포 필요)

### 2-2. Google Ads (✅ 연결됨)
- **무엇을**: P-Max 등 Google 광고 캠페인의 일별 성과
- **어떻게**: Google Ads API searchStream으로 가져옴
- **토큰**: `GOOGLE_ADS_REFRESH_TOKEN` (Vercel 환경변수)
- **만료**: 7일 (테스트 앱 상태)
- **영구 해결**: Google Cloud Console → OAuth 동의 화면 → "프로덕션"으로 게시
- **갱신 방법**:
  1. 아래 URL 접속 (구글 로그인):
  ```
  https://accounts.google.com/o/oauth2/v2/auth?client_id=175734610412-heq88vu5cvm4t5inkmlrtu24ql9dpvkk.apps.googleusercontent.com&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/adwords&access_type=offline&prompt=consent
  ```
  2. 인증 코드 복사
  3. 코드를 refresh token으로 교환 (넛에게 요청 또는 curl)
  4. Vercel 환경변수 업데이트 + 재배포

### 2-3. 네이버 검색광고 (⚠️ 시트 경유)
- **무엇을**: 네이버 검색/쇼핑 광고 일별 성과
- **어떻게**: 크론이 API → Google Sheets에 기록 → 싱크 버튼으로 DB에
- **크론**: `naver-searchad-daily` (매일 실행)
- **문제 시**: 크론 에러 확인 (`openclaw cron list`)

### 2-4. GA4 (✅ 연결됨)
- **무엇을**: 카페24 사이트 방문자/세션/페이지뷰/전환 퍼널
- **어떻게**: Service Account JWT → GA4 Data API → DB
- **인증**: `GOOGLE_SA_KEY` 환경변수 (서비스 계정 JSON)
- **만료 없음**: 서비스 계정은 영구

---

## 3. 수기 입력 방법

### 대시보드 접속 경로
Settings → 📋 일일 입력 탭

### 3-1. 🟠 쿠팡 광고비
1. [쿠팡 광고센터](https://advertising.coupang.com) 접속
2. 보고서 → 맞춤보고서 → 기간 설정 → 다운로드 (.xlsx)
3. 대시보드 → 쿠팡 데이터 → 📊 광고비 → 파일 업로드

### 3-2. 🟠 쿠팡 일별 퍼널
1. [쿠팡 셀러인사이트](https://wing.coupang.com) 접속
2. 셀러인사이트 → Daily Summary 다운로드
3. 대시보드 → 쿠팡 데이터 → 📈 일별 퍼널 → 파일 업로드

### 3-3. 🟠 쿠팡 상품별 실적
1. 셀러인사이트 → Vendor Item Metrics 다운로드
2. 대시보드 → 쿠팡 데이터 → 🏷️ 상품별 실적 → 파일 업로드
3. ⚠️ 상품 매핑: 통계시트 → 상품 목록 → F열에 쿠팡 옵션ID 등록 필요

### 3-4. 🟢 GFA 광고비
1. [네이버 GFA](https://manage.searchad.naver.com) 접속
2. 어제 비용/노출/클릭 확인
3. 대시보드 → 날짜 선택 → GFA 섹션에 입력 → 저장

### 3-5. 🟩 스마트스토어 광고비 + 알림받기 수
1. [스마트스토어 광고](https://adcenter.shopping.naver.com) 접속
2. 어제 비용/노출/클릭 확인
3. 스마트스토어 → 알림받기 관리 → 알림받기 수 확인
4. 대시보드 → 날짜 선택 → 스마트스토어 섹션에 입력 → 저장

### 3-6. 👥 인플루언서/체험단
1. 인플루언서 비용 발생 시만 입력
2. 대시보드 → 날짜 선택 → 인플루언서 섹션에 비용+건수 → 저장

### 3-7. 🧾 건별비용
1. 촬영비, 디자인비, 샘플비 등 발생 시
2. 대시보드 → 건별비용 섹션 → 구분(기타/인플루언서/촬영/디자인) 선택 → 금액+사유 입력 → 저장

### 3-8. 📤 판매 실적 (이카운트)
1. [이카운트 ERP](https://oapiaa.ecounterp.com) 접속
2. 판매입력 → 기간 설정 → 엑셀 다운로드
3. 대시보드 → 판매 실적 → 파일 업로드
4. ⚠️ `판매정리` 탭이 있어야 함 (이카운트 기본 출력 형식)

---

## 4. 싱크 버튼 사용

### 위치
- Overview 페이지 상단 (🔄 아이콘)
- Settings → 일일 입력 → 7번 싱크 & 확인

### 실행 내용
1. **광고비 싱크**: Meta + Google Ads + GA4 퍼널 → DB (최근 3일)
2. **시트 싱크**: Sales + Funnel + Product Sales 시트 → DB

### 언제 누르나
- 모든 수기 입력 완료 후
- API 데이터 최신화가 필요할 때
- 데이터 상태 패널에서 빨간등이 있을 때

---

## 5. 데이터 상태 확인

### 위치
Settings → 일일 입력 → 상단 패널

### 표시 내용
- 🟢 초록등: 전날 이후 데이터 있음 (정상)
- 🔴 빨간등 (깜빡): 데이터 없거나 오래됨 (입력 필요)

### 자동 수집 (4개)
| 항목 | 소스 | 빨간등이면 |
|---|---|---|
| Meta 광고비 | API | 싱크 버튼 클릭 |
| Google Ads | API | 토큰 만료 확인 |
| 네이버 검색광고 | 크론→시트 | 크론 상태 확인 |
| GA4 퍼널 | API | 싱크 버튼 클릭 |

### 수기 입력 (7개)
| 항목 | 소스 | 빨간등이면 |
|---|---|---|
| 쿠팡 광고비 | 파일 | 광고센터에서 다운→업로드 |
| GFA 광고비 | 수기 | GFA 확인→입력 |
| 스마트스토어 광고 | 수기 | 스마트스토어 확인→입력 |
| 매출 데이터 | 파일 | 이카운트 엑셀→업로드 |
| 상품별 매출 | 파일 | 이카운트 엑셀→업로드 |
| 쿠팡 퍼널 | 파일 | 셀러인사이트→업로드 |
| 건별비용 | 수기 | 비용 발생 시만 |

---

## 6. 문제 해결

### 싱크 버튼 눌러도 데이터 안 들어올 때
1. 데이터 상태 패널 확인 → 어떤 항목이 빨간등인지
2. API 토큰 만료 여부 확인:
   - Meta: 5월 17일 만료 (60일 주기)
   - Google Ads: 7일 만료 (테스트 앱이라)
3. 크론 에러 확인: 넛에게 "크론 상태 확인해줘" 요청

### 시트와 대시보드 숫자가 다를 때
1. 시트 데이터가 최신인지 확인
2. 싱크 버튼 클릭 (시트→DB 동기화)
3. 그래도 다르면: 시트에 수식이 있어서 값이 다를 수 있음

### 파일 업로드 에러
- **"판매정리 탭을 찾을 수 없습니다"**: 이카운트 엑셀이 아닌 다른 파일을 올림
- **"날짜 컬럼 없음"**: 쿠팡 파일 형식이 다름 — 셀러인사이트 Daily Summary인지 확인

---

## 7. Vercel 환경변수 목록

| 변수 | 용도 | 갱신 주기 |
|---|---|---|
| `META_ADS_TOKEN` | Meta 광고 API | 60일 |
| `GOOGLE_ADS_REFRESH_TOKEN` | Google Ads API | 7일 (프로덕션 전환 시 영구) |
| `GOOGLE_SA_KEY` | GA4 + Sheets API | 영구 |
| `NEXT_PUBLIC_SUPABASE_URL` | DB 연결 | 영구 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DB 인증 | 영구 |
| `META_NUTTY_AD_ACCOUNT` | 너티 광고 계정 ID | 영구 |
| `META_IRONPET_AD_ACCOUNT` | 아이언펫 광고 계정 ID | 영구 |
| `GOOGLE_ADS_CLIENT_ID` | OAuth 클라이언트 | 영구 |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth 시크릿 | 영구 |
| `GOOGLE_ADS_DEV_TOKEN` | 개발자 토큰 | 영구 |

---

## 8. 일일 루틴 체크리스트

### 평일 (5분)
- [ ] 쿠팡 광고센터 → 보고서 다운 → 업로드
- [ ] GFA 확인 → 수기 입력
- [ ] 스마트스토어 확인 → 수기 입력 (알림받기 수 포함)
- [ ] 이카운트 → 판매 엑셀 → 업로드
- [ ] 싱크 버튼 클릭
- [ ] 데이터 상태 패널 — 모두 초록등 확인

### 주간 (월요일)
- [ ] 주말 2일치 데이터 입력 (날짜 변경해서)
- [ ] 쿠팡 셀러인사이트 퍼널 파일 업로드
- [ ] Overview에서 주간 추이 확인
- [ ] 이상치 있으면 원인 파악

### 월간 (1일)
- [ ] 월별 요약 페이지 확인
- [ ] PDF 리포트 내보내기
- [ ] 다음 달 목표 설정 (Settings → 목표)
