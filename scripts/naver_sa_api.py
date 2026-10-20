# -*- coding: utf-8 -*-
"""네이버 검색광고 API 계정 순회 공용 모듈. 2026-10-20 sync_naver_keywords.py 에서 떼어냈다.

왜 떼어냈나
  sync_naver_keywords.py(키워드 성과)와 sync_naver_sa_keywords.py(등록 키워드 목록)가 같은
  두 계정 설정·서명·재시도를 쓴다. 스크립트 파일은 import 하는 순간 수집을 시작하므로
  계정 순회 부분만 여기 둔다.

쓰는 법
  for acct in ACCOUNTS:
      if not use_account(acct["cfg"]): ...   # 설정 파일이 없으면 False
      api_get("/ncc/campaigns")

★ 읽기(GET)만 있다. 쓰기(입찰·등록·잠금)는 일부러 넣지 않았다.
"""
import base64
import hashlib
import hmac
import json
import os
import time

import requests

# ★ 네이버 검색광고 계정이 둘이다. 펫(너티·아이언펫·사입)과 밸런스랩이 별도 계정이라
#   펫 설정 하나만 보면 밸런스랩 키워드가 영영 안 들어온다. 실제로 밸런스랩
#   keyword_performance 가 2026-05-04 에서 멈춰 있었다(2026-09-29 확인).
ACCOUNTS = [
    {"name": "pet", "cfg": "~/.naver-searchad/config.json"},
    {"name": "balancelab", "cfg": "~/.naver-searchad-balancelab/config.json"},
]

# api_get 이 지금 어느 계정으로 부르는지. use_account 가 갈아 끼운다.
API_KEY = API_SECRET = CUSTOMER_ID = None
BASE_URL = "https://api.searchad.naver.com"


def use_account(path):
    """계정 설정을 읽어 전역에 세팅. 파일이 없으면 False 를 돌려주고 호출부가 건너뛴다."""
    global API_KEY, API_SECRET, CUSTOMER_ID, BASE_URL
    full = os.path.expanduser(path)
    if not os.path.exists(full):
        return False
    c = json.load(open(full, encoding="utf-8"))
    API_KEY, API_SECRET, CUSTOMER_ID = c["api_key"], c["api_secret"], str(c["customer_id"])
    BASE_URL = c.get("base_url", "https://api.searchad.naver.com")
    return True


def api_get(endpoint, params=None, retry=3):
    """서명한 GET. 재시도 후에도 실패하면 예외를 그대로 올린다(호출부가 판단)."""
    for attempt in range(retry):
        try:
            ts = str(int(time.time() * 1000))
            sig = base64.b64encode(hmac.new(API_SECRET.encode(), f"{ts}.GET.{endpoint}".encode(), hashlib.sha256).digest()).decode()
            r = requests.get(BASE_URL + endpoint, headers={
                "X-API-KEY": API_KEY, "X-Customer": CUSTOMER_ID,
                "X-Timestamp": ts, "X-Signature": sig, "Content-Type": "application/json",
            }, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == retry - 1:
                raise
            time.sleep(1)
