# marketing-dashboard — 데이터 파이프라인 전용 레포

**이 레포에는 웹앱이 없습니다.** PPMI 마케팅 대시보드의 **수집·동기화 파이썬 스크립트**만 있습니다.

- 웹앱(화면·API)은 별도 레포: **[ppmi-dashboard-v2](https://github.com/kimho12302-ui/ppmi-dashboard-v2)** → 실서비스 https://ppmi-dashboard-kappa.vercel.app
- 이 레포는 **배포하지 않습니다.** Vercel 배포 워크플로는 2026-08 제거했습니다.

## 왜 웹앱 코드를 지웠나 (2026-08)

이 레포에 2026-04에서 멈춘 Next.js 앱 사본(`src/` 63파일)이 남아 있었고,
`.github/workflows/deploy.yml` 이 실서비스와 **동일한 Vercel 프로젝트 ID**
(`prj_RzWsMM8p2gBSxhH5aC37cZIspGWX`)를 가리키고 있었습니다.

- 2026-06: 이 워크플로가 push마다 실행되어 **구버전이 실서비스를 덮어쓰는 사고**가 났습니다.
  당시 push 트리거만 제거하고 `workflow_dispatch` 는 남겨둬서, GitHub Actions의
  "Run workflow" 버튼 한 번이면 같은 사고가 재현되는 상태였습니다.
- 구버전 앱은 신버전과 이미 941줄 diff 로 갈라져 있었고(`src/lib/gonggu.ts`·`brand-groups.ts` 자체가 없음),
  grep 할 때마다 라우트가 두 벌씩 잡혀 엉뚱한 파일을 고치기 쉬웠습니다.

→ 웹앱 사본·빌드 설정·deploy.yml 을 전부 삭제했습니다. 복원이 필요하면 git 히스토리에 있습니다.

## 구성

| 경로 | 내용 |
|---|---|
| `scripts/` | 수집·동기화 파이썬 (Meta/네이버 SA/Google Ads/GA4 API, 시트↔DB 양방향) |
| `.github/workflows/daily-sync.yml` | 매일 09:00·21:00 KST 수집 + DB→시트 정방향 싱크 |
| `.github/workflows/sheet-sync.yml` | DB→통계시트 역동기화만 (대시보드 폼 저장 시 dispatch) |
| `requirements.txt` | 파이썬 의존성 |
| `supabase/` | 스키마 마이그레이션 SQL |
| `docs/` | 데이터 연결·입력 매뉴얼 |

## 주의

- 새 수집기를 붙일 때는 **구 수집기를 반드시 제거**할 것. 낡은 시트 기반 수집기가 정확한 API 수집기보다
  먼저 돌면서 전 기간을 덮어쓰는 사고가 반복됐습니다(2026-07 3건).
- 시트 쓰기는 `SHEET_FREEZE_DATE`(기본 2026-06-01) 이후 날짜만. 과거는 동결입니다.
- DB→시트 기록 시 **0으로 덮어쓰기 금지** (수기 입력값이 날아갑니다).
