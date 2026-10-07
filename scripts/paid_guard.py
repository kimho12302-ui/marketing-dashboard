"""Paid 탭 Total(B·C·D) 쓰기 차단.

통계시트 [N]Paid·[I]Paid·[사입]Paid 의 B·C·D 는 김호가 건 채널 합 수식(=sum(G,L,R,AD,...))이다.
스크립트가 여기에 숫자를 쓰면 수식이 깨지고, DB 에 아직 안 들어온 채널(GFA 등)이 빠진 틀린 합이 남는다.
그 숫자는 매일 00:27 날짜 추가 Apps Script 가 어제 줄을 복사하면서 새 날짜로 번진다.
2026-09-28·10-02·10-04 에 실제로 덮였다(세션로그 2026-10-07).

이 모듈을 import 하면 gspread Worksheet 의 쓰기 메서드가 감싸져서,
탭 이름이 'Paid' 로 끝나면 B·C·D 에 걸리는 쓰기를 버리고 경고만 찍는다. 나머지 칸은 그대로 쓴다.
"""
import re

import gspread

TOTAL_FIRST, TOTAL_LAST = 2, 4  # B..D


def _col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def _span(a1):
    """'G5' / 'B5:D5' / "'[사입]Paid'!B5" → (첫 열, 끝 열). 열이 없으면 None."""
    a1 = a1.split("!")[-1].replace("$", "")
    cols = re.findall(r"([A-Z]+)\d*", a1)
    if not cols:
        return None
    first, last = _col_index(cols[0]), _col_index(cols[-1])
    return min(first, last), max(first, last)


def _hits_total(a1):
    s = _span(a1)
    return bool(s) and s[0] <= TOTAL_LAST and s[1] >= TOTAL_FIRST


def _is_paid(ws):
    return ws.title.endswith("Paid")


def _warn(ws, n):
    print(f"  ⚠ {ws.title}: Total(B·C·D) 쓰기 {n}건 차단 (시트 수식 보호, paid_guard)")


_orig_batch_update = gspread.Worksheet.batch_update
_orig_update_cell = gspread.Worksheet.update_cell
_orig_update = gspread.Worksheet.update


def _batch_update(self, data, *args, **kwargs):
    if _is_paid(self):
        kept = [d for d in data if not _hits_total(d.get("range", ""))]
        if len(kept) != len(data):
            _warn(self, len(data) - len(kept))
        if not kept:
            return None
        data = kept
    return _orig_batch_update(self, data, *args, **kwargs)


def _update_cell(self, row, col, value):
    if _is_paid(self) and TOTAL_FIRST <= col <= TOTAL_LAST:
        _warn(self, 1)
        return None
    return _orig_update_cell(self, row, col, value)


def _update(self, *args, **kwargs):
    # gspread 6: update(values, range_name) / 5: update(range_name, values). 문자열 인자가 범위다.
    if _is_paid(self):
        rng = kwargs.get("range_name") or next((a for a in args if isinstance(a, str)), None)
        values = kwargs.get("values") or next((a for a in args if isinstance(a, list)), None) or [[]]
        width = max((len(r) for r in values if isinstance(r, list)), default=1)
        s = _span(rng or "A1")
        # 한 칸 주소에 여러 열을 쓰면 오른쪽으로 번지므로 실제 폭으로 판정한다
        if s is None or (s[0] <= TOTAL_LAST and s[0] + max(width, s[1] - s[0] + 1) - 1 >= TOTAL_FIRST):
            _warn(self, 1)
            return None
    return _orig_update(self, *args, **kwargs)


gspread.Worksheet.batch_update = _batch_update
gspread.Worksheet.update_cell = _update_cell
gspread.Worksheet.update = _update
