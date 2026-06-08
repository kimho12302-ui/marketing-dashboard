"""Meta 토큰 만료 감시 → 7일 전부터 텔레그램 알림.

60일 장기 토큰은 만료되면 메타 광고 + 인스타 콘텐츠 수집이 동시에 끊긴다.
이 스크립트가 매일 토큰 잔여일을 확인하고, 7일 이하로 남으면 갱신하라고 알린다.

필요 env: META_ADS_TOKEN, META_APP_ID, META_APP_SECRET, TELEGRAM_BOT_TOKEN
사용: python check_meta_token.py
"""
import os
import sys
import datetime

import requests

sys.stdout.reconfigure(encoding="utf-8")

GRAPH = "https://graph.facebook.com/v19.0"
TOKEN = os.environ.get("META_ADS_TOKEN", "")
APP_ID = os.environ.get("META_APP_ID", "")
APP_SECRET = os.environ.get("META_APP_SECRET", "")
CHAT_ID = "8383605834"  # 호
ALERT_DAYS = 7

RENEW_GUIDE = (
    "갱신: developers.facebook.com/tools/explorer 에서 User Token 발급"
    "(ads_read, instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement) "
    "→ 호한테 토큰 전달 → 60일 교환 후 GitHub Secrets(META_ADS_TOKEN) 갱신."
)


def telegram(msg):
    bot = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not bot:
        print("  TELEGRAM_BOT_TOKEN 없음 (알림 스킵)")
        return
    try:
        requests.post(f"https://api.telegram.org/bot{bot}/sendMessage",
                      json={"chat_id": CHAT_ID, "text": msg}, timeout=20)
        print("  텔레그램 알림 전송")
    except Exception as e:
        print(f"  텔레그램 전송 실패(무시): {e}")


def main():
    if not (TOKEN and APP_ID and APP_SECRET):
        print("META_ADS_TOKEN/APP_ID/APP_SECRET 중 누락 → 체크 스킵")
        return
    app_token = f"{APP_ID}|{APP_SECRET}"
    try:
        d = requests.get(f"{GRAPH}/debug_token",
                         params={"input_token": TOKEN, "access_token": app_token},
                         timeout=30).json().get("data", {})
    except Exception as e:
        print(f"debug_token 호출 실패: {e}")
        return

    is_valid = d.get("is_valid")
    exp = d.get("expires_at", 0)

    if not is_valid:
        msg = f"🔴 [PPMI 대시보드] 메타 토큰이 무효(만료/취소)입니다. 수집 중단 상태.\n{RENEW_GUIDE}"
        print("INVALID TOKEN")
        telegram(msg)
        sys.exit(1)

    if not exp:  # 0 = 만료 없음 (System User 등)
        print("토큰 만료 없음(영구). OK")
        return

    expire_dt = datetime.datetime.fromtimestamp(exp, datetime.timezone.utc)
    days_left = (expire_dt - datetime.datetime.now(datetime.timezone.utc)).days
    print(f"메타 토큰 만료 {expire_dt.date()} (잔여 {days_left}일)")

    if days_left <= ALERT_DAYS:
        msg = (f"⚠️ [PPMI 대시보드] 메타 토큰 만료 {days_left}일 전 ({expire_dt.date()}).\n"
               f"만료되면 메타 광고 + 인스타 콘텐츠 수집이 끊깁니다.\n{RENEW_GUIDE}")
        telegram(msg)
    else:
        print(f"여유 있음(>{ALERT_DAYS}일). 알림 안 보냄.")


if __name__ == "__main__":
    main()
