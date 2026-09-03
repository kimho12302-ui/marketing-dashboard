#!/usr/bin/env python3
"""메타 광고 토큰 교체. 토큰 하나만 물어본다.

배경
----
2026-08-18 에 1~2시간짜리 토큰을 그대로 저장해서 그날 저녁에 죽었고,
광고 데이터 사흘치가 비었다. 그래서 이 스크립트는 **60일 이상 남은 토큰만** 받는다.
짧은 토큰이면 저장하지 않고 멈춘다.

쓰는 법
-------
    python scripts/rotate_meta_token.py

앱 ID 나 앱 시크릿은 묻지 않는다. 토큰 하나면 된다.
"""

from __future__ import annotations

import getpass
import subprocess
import sys
from datetime import datetime, timezone

import requests

GRAPH = "https://graph.facebook.com/v19.0"
SECRET_NAME = "META_ADS_TOKEN"
MIN_DAYS = 30

GUIDE = """
토큰 받는 곳 (2분)

  1. https://developers.facebook.com/tools/explorer/ 접속
  2. 오른쪽 위에서 앱 선택, 권한에 ads_read 체크
  3. [Generate Access Token] 누르고 로그인
  4. 토큰 옆 파란 느낌표(i) 아이콘 클릭
  5. [Open in Access Token Tool] 클릭
  6. 아래쪽 [Extend Access Token] 클릭      <- 이게 핵심이다
  7. 새로 나온 긴 토큰을 복사

6번을 건너뛰면 1~2시간짜리라 오늘 저녁에 또 죽는다.
이 스크립트가 그걸 확인해서 짧으면 거부한다.
"""


def fail(msg: str) -> None:
    print(f"\n중단: {msg}")
    sys.exit(1)


def main() -> None:
    print(GUIDE)
    token = getpass.getpass("토큰 붙여넣기 (화면에 안 보입니다): ").strip()
    if not token:
        fail("아무것도 입력되지 않았습니다.")

    print("\n확인 중...")

    # 자기 자신으로 토큰을 조회한다. 앱 시크릿이 없어도 만료일과 권한을 볼 수 있다.
    try:
        d = requests.get(
            f"{GRAPH}/debug_token",
            params={"input_token": token, "access_token": token},
            timeout=30,
        ).json()
    except Exception as e:  # noqa: BLE001
        fail(f"메타에 연결하지 못했습니다: {e}")

    if "error" in d:
        fail(f"메타가 거부했습니다: {d['error'].get('message', d['error'])}")

    info = d.get("data", {})
    if not info.get("is_valid"):
        fail("유효하지 않은 토큰입니다. 복사할 때 잘렸는지 확인하세요.")

    scopes = info.get("scopes", [])
    if "ads_read" not in scopes:
        fail(f"ads_read 권한이 없습니다. 지금 권한: {', '.join(scopes) or '(없음)'}")

    exp = info.get("expires_at", 0)
    if exp == 0:
        print("  만료: 없음 (무기한)")
        days = 9999
    else:
        when = datetime.fromtimestamp(exp, tz=timezone.utc).astimezone()
        days = (when - datetime.now(tz=timezone.utc).astimezone()).days
        print(f"  만료: {when:%Y-%m-%d %H:%M}  (약 {days}일 남음)")

    if days < MIN_DAYS:
        fail(
            f"{days}일짜리 짧은 토큰입니다. 저장하지 않았습니다.\n"
            "  위 안내 6번 [Extend Access Token] 을 누른 뒤 나온 토큰으로 다시 하세요."
        )

    print(f"\nGitHub 시크릿 {SECRET_NAME} 갱신 중...")
    p = subprocess.run(
        ["gh", "secret", "set", SECRET_NAME, "--repo", "kimho12302-ui/marketing-dashboard"],
        input=token,
        text=True,
        capture_output=True,
    )
    if p.returncode != 0:
        fail(f"시크릿 등록 실패: {p.stderr.strip()[:300]}")

    print("완료.\n")
    print("이제 수집을 다시 돌립니다...")
    r = subprocess.run(
        ["gh", "workflow", "run", "daily-sync.yml", "--repo", "kimho12302-ui/marketing-dashboard"],
        capture_output=True,
        text=True,
    )
    if r.returncode == 0:
        print("  실행 요청됨. 10분쯤 뒤 대시보드에 8/19 이후 데이터가 채워집니다.")
    else:
        print(f"  자동 실행 실패. 직접 돌리세요: gh workflow run daily-sync.yml")
        print(f"  ({r.stderr.strip()[:200]})")

    print(f"\n다음 교체는 약 {days}일 뒤입니다. 7일 전에 텔레그램으로 알려줍니다.")


if __name__ == "__main__":
    main()
