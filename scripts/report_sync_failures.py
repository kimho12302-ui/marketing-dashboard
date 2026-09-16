import os
# -*- coding: utf-8 -*-
"""daily-sync 워크플로의 실패 스텝을 1줄로 요약 → 텔레그램 + sync_heartbeat.

왜 필요한가
-----------
daily-sync 의 데이터 스텝은 전부 `continue-on-error: true` 다. 한 소스가 죽어도 나머지를
수집하려는 의도는 맞지만, 그 결과 워크플로는 **항상 success** 로 끝난다. 2026-07-29 조사에서
"최근 8회 전부 success" 인데 대시보드 일별 매출이 5주 연속 0원이던 것이 이 구조 때문이었다.
이 스크립트가 스텝별 outcome 을 모아 실패가 1건 이상일 때만 알린다. 0건이면 침묵한다.

입력
----
STEP_OUTCOMES : {"스텝이름": "success|failure|skipped|cancelled", ...} JSON
                워크플로가 `${{ steps.<id>.outcome }}` 로 채운다. 비밀값 없음.
RUN_URL       : 해당 런 URL (선택)

사용: python scripts/report_sync_failures.py
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# 텔레그램 발송기·채팅 ID 는 check_meta_token 것을 그대로 쓴다(시크릿은 env 에서만 읽는다).
from check_meta_token import telegram  # noqa: E402
import heartbeat  # noqa: E402

HEARTBEAT_SOURCE = "workflow"
FAILED = "failure"


def parse_outcomes(raw):
    """JSON 파싱 실패를 알림 자체의 실패로 만들지 않는다."""
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"STEP_OUTCOMES 파싱 실패: {e}")
        return {}
    return {k: str(v or "") for k, v in data.items() if isinstance(data, dict)}


def main():
    outcomes = parse_outcomes(os.environ.get("STEP_OUTCOMES", ""))
    if not outcomes:
        print("스텝 결과가 비어 있음 → 판정 불가, 알림 없음")
        return 0

    failed = [name for name, result in outcomes.items() if result == FAILED]
    total = len(outcomes)
    print(f"스텝 {total}개 중 실패 {len(failed)}개")
    for name, result in outcomes.items():
        print(f"  {result:<10} {name}")

    note = ", ".join(failed) if failed else "all ok"
    heartbeat.record(HEARTBEAT_SOURCE, ok=not failed, rows=total - len(failed),
                     note=note[:500])

    if not failed:
        print("실패 0건 → 텔레그램 침묵")
        return 0

    run_url = os.environ.get("RUN_URL", "")
    msg = (f"[PPMI 대시보드] daily-sync 실패 {len(failed)}/{total}: " + ", ".join(failed))
    if run_url:
        msg += f"\n{run_url}"
    telegram(msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
