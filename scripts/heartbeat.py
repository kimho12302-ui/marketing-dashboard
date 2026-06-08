"""수집 하트비트 기록.

원칙(사용자 정의):
- 수집 성공 → 행 기록 (값이 0이어도 기록 = "집행 0"). last_success 갱신.
- 수집 실패/미실행 → last_success를 건드리지 않음 (오래된 채로 둠 = "연결 끊김" 신호).

best-effort: 하트비트 기록 실패가 절대 sync 본체를 깨뜨리지 않는다.
sync_heartbeat 테이블이 아직 없으면 경고만 출력하고 넘어간다.
"""
import os
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://phcfydxgwkmjiogerqmm.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg",
)


def _now():
    return datetime.now(timezone.utc).isoformat()


def record(source, ok=True, rows=0, latest_date=None, note=""):
    """소스별 수집 결과 기록.

    ok=True  : 수집 성공 → last_run + last_success 둘 다 now, rows/latest_date 반영
    ok=False : 수집 실패 → last_run/ok/note 만 갱신, last_success는 보존(건드리지 않음)
    """
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        payload = {
            "source": source,
            "last_run": _now(),
            "ok": ok,
            "note": (note or "")[:500],
        }
        if ok:
            payload["last_success"] = _now()
            payload["rows_written"] = rows
            if latest_date:
                payload["latest_data_date"] = latest_date
        sb.table("sync_heartbeat").upsert(payload, on_conflict="source").execute()
        print(f"  💓 heartbeat[{source}] ok={ok} rows={rows}")
    except Exception as e:
        print(f"  ⚠ heartbeat[{source}] 기록 실패(무시): {e}")
