"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";

// ─── Section wrapper ───
function Section({ num, title, emoji, desc, children, done, onToggleDone }: {
  num: number; title: string; emoji: string; desc: string;
  children: React.ReactNode; done: boolean; onToggleDone: () => void;
}) {
  const [open, setOpen] = useState(!done);

  return (
    <div className={`rounded-lg border transition-all ${done ? "border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-900/5" : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"}`}>
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setOpen(!open)}>
        <button onClick={e => { e.stopPropagation(); onToggleDone(); }}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 dark:border-zinc-600 hover:border-indigo-400"}`}>
          {done && <span className="text-sm">✓</span>}
        </button>
        <span className="text-lg">{emoji}</span>
        <div className="flex-1">
          <span className={`font-medium ${done ? "line-through text-gray-400" : "text-gray-800 dark:text-zinc-200"}`}>
            {num}. {title}
          </span>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500">{desc}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
      {open && <div className="px-4 pb-4 pt-0">{children}</div>}
    </div>
  );
}

// ─── File upload zone ───
function FileZone({ label, accept, uploading, onFile }: {
  label: string; accept?: string; uploading: boolean; onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        drag ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10" : "border-gray-200 dark:border-zinc-700 hover:border-gray-300"
      }`}
    >
      <input ref={ref} type="file" accept={accept || ".xlsx,.xls"} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      <Upload className={`h-6 w-6 mx-auto mb-1 ${uploading ? "animate-bounce text-indigo-500" : "text-gray-400"}`} />
      <p className="text-sm text-gray-500 dark:text-zinc-400">{uploading ? "처리 중..." : label}</p>
    </div>
  );
}

// ─── Result display ───
function ResultBox({ result }: { result: any }) {
  if (!result) return null;
  const isError = !!result.error;
  return (
    <div className={`mt-3 p-3 rounded-lg text-sm ${isError ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"}`}>
      {isError ? (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{result.error}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span>{result.message || "완료!"}</span>
        </div>
      )}
    </div>
  );
}

// ─── Event Input ───
const EVENT_COLORS = [
  { label: "보라", value: "#6366f1" }, { label: "파랑", value: "#3b82f6" },
  { label: "초록", value: "#22c55e" }, { label: "주황", value: "#f97316" },
  { label: "빨강", value: "#ef4444" }, { label: "핑크", value: "#ec4899" },
];

function EventInput({ date }: { date: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("all");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [evDate, setEvDate] = useState(date);

  useEffect(() => { setEvDate(date); }, [date]);

  // Load existing events for this date
  useEffect(() => {
    fetch(`/api/events?from=${evDate}&to=${evDate}`)
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {});
  }, [evDate]);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: evDate, brand, title: title.trim(), description: desc.trim() || null, color }),
      });
      const d = await res.json();
      if (d.ok) {
        setEvents(prev => [...prev, d.event]);
        setTitle(""); setDesc("");
      }
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    await fetch(`/api/events?id=${id}`, { method: "DELETE" });
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const brandLabels: Record<string, string> = { all: "전체", nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500">날짜</label>
          <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500">브랜드</label>
          <select value={brand} onChange={e => setBrand(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600">
            <option value="all">전체</option>
            <option value="nutty">너티</option>
            <option value="ironpet">아이언펫</option>
            <option value="saip">사입</option>
            <option value="balancelab">밸런스랩</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-500">이벤트명 *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="프로모션 시작, 신제품 출시 등"
          className="w-full text-xs border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600" />
      </div>
      <div>
        <label className="text-[10px] text-gray-500">설명 (선택)</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="상세 내용"
          className="w-full text-xs border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-500">색상</label>
        {EVENT_COLORS.map(c => (
          <button key={c.value} onClick={() => setColor(c.value)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${color === c.value ? "border-gray-800 dark:border-white scale-110" : "border-transparent"}`}
            style={{ background: c.value }} title={c.label} />
        ))}
      </div>
      <button onClick={save} disabled={saving || !title.trim()}
        className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
        {saving ? "저장 중..." : "📌 이벤트 추가"}
      </button>

      {events.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] text-gray-400">등록된 이벤트</p>
          {events.map(e => (
            <div key={e.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-zinc-800/50 rounded px-2 py-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
              <span className="text-gray-500">{e.date.slice(5)}</span>
              <span className="text-gray-400">[{brandLabels[e.brand] || e.brand}]</span>
              <span className="font-medium flex-1">{e.title}</span>
              {e.description && <span className="text-gray-400 truncate max-w-32">{e.description}</span>}
              <button onClick={() => remove(e.id)} className="text-gray-400 hover:text-red-500 px-1">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Manual ad spend input (batch style) ───
let _manualRowId = 0;
type ManualRow = { id: number; date: string; values: Record<string, string>; status: "pending" | "saving" | "done" | "error"; result?: string };

function ManualAdInput({ channel, label, fields, onSave, date }: {
  channel: string; label: string; date: string;
  fields: { key: string; label: string; placeholder: string; type?: string; options?: string[] }[];
  onSave: (data: any) => Promise<any>;
}) {
  const makeRow = (d: string): ManualRow => ({ id: ++_manualRowId, date: d, values: {}, status: "pending" });
  const [rows, setRows] = useState<ManualRow[]>([makeRow(date)]);

  const updateRow = (id: number, patch: Partial<ManualRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };
  const updateRowValue = (id: number, key: string, val: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, values: { ...r.values, [key]: val } } : r));
  };
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));

  const handleSaveAll = async () => {
    for (const row of rows) {
      if (row.status === "done") continue;
      // Validate required fields
      const requiredFields = fields.filter(f => f.type === "select" || f.key === "spend");
      const missingField = requiredFields.find(f => !row.values[f.key]);
      if (missingField) {
        updateRow(row.id, { status: "error", result: `${missingField.label} 입력 필요` });
        continue;
      }
      if (!row.date) {
        updateRow(row.id, { status: "error", result: "날짜 입력 필요" });
        continue;
      }
      updateRow(row.id, { status: "saving" });
      try {
        const parsed: Record<string, any> = {};
        for (const f of fields) {
          if (f.type === "select" || f.type === "text") {
            parsed[f.key] = row.values[f.key] || "";
          } else {
            parsed[f.key] = Number(row.values[f.key] || 0);
          }
        }
        const res = await onSave({ date: row.date, channel, ...parsed });
        if (res.error) {
          updateRow(row.id, { status: "error", result: res.error });
        } else {
          updateRow(row.id, { status: "done", result: res.message || "완료" });
        }
      } catch {
        updateRow(row.id, { status: "error", result: "저장 실패" });
      }
    }
  };

  // Header labels
  const fieldLabels = (
    <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500 mb-1 px-0.5">
      <span className="w-28 shrink-0">날짜</span>
      {fields.map(f => <span key={f.key} className="flex-1 min-w-0 truncate">{f.label}</span>)}
      <span className="w-6 shrink-0"></span>
    </div>
  );

  return (
    <div className="space-y-2">
      {fieldLabels}
      {rows.map(row => (
        <div key={row.id} className="flex items-center gap-1">
          <input type="date" value={row.date} onChange={e => updateRow(row.id, { date: e.target.value })}
            className="text-xs border rounded px-1.5 py-1 bg-white dark:bg-zinc-800 dark:border-zinc-600 w-28 shrink-0"
            disabled={row.status !== "pending"} />
          {fields.map(f => (
            f.type === "select" && f.options ? (
              <select key={f.key} value={row.values[f.key] || ""} onChange={e => updateRowValue(row.id, f.key, e.target.value)}
                className="flex-1 min-w-0 text-xs border rounded px-1 py-1 bg-white dark:bg-zinc-800 dark:border-zinc-600"
                disabled={row.status !== "pending"}>
                <option value="">{f.placeholder || "선택"}</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input key={f.key} type={f.type || "number"} placeholder={f.placeholder}
                value={row.values[f.key] || ""} onChange={e => updateRowValue(row.id, f.key, e.target.value)}
                className="flex-1 min-w-0 text-xs border rounded px-1.5 py-1 bg-white dark:bg-zinc-800 dark:border-zinc-600"
                disabled={row.status !== "pending"} />
            )
          ))}
          <div className="w-6 shrink-0 flex items-center justify-center">
            {row.status === "pending" && (
              <button onClick={() => removeRow(row.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
            )}
            {row.status === "saving" && <span className="text-xs text-blue-500 animate-pulse">⏳</span>}
            {row.status === "done" && <span className="text-xs text-green-500" title={row.result}>✅</span>}
            {row.status === "error" && <span className="text-xs text-red-500" title={row.result}>❌</span>}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button onClick={() => setRows(prev => [...prev, makeRow(date)])}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">+ 날짜 추가</button>
        {rows.some(r => r.status === "pending") && (
          <button onClick={handleSaveAll}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium">
            💾 저장 ({rows.filter(r => r.status === "pending").length}건)
          </button>
        )}
      </div>
      {rows.some(r => r.result) && (
        <div className="text-[11px] text-gray-500 space-y-0.5">
          {rows.filter(r => r.result).map(r => <div key={r.id}>{r.result}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Data Status Panel ───
// ─── Missing dates gap panel (toggle per date) ───
const ALL_SOURCES = ["판매실적", "메타광고", "구글광고", "네이버SA", "쿠팡광고", "GFA", "쿠팡퍼널", "카페24퍼널", "스마트스토어퍼널"];

function MissingDatesPanel({ refreshKey }: { refreshKey: number }) {
  const [gaps, setGaps] = useState<{ date: string; missing: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/missing-dates?days=7")
      .then(r => r.json())
      .then(d => setGaps(d.gaps || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return null;
  if (gaps.length === 0) return null;

  const dayName = (d: string) => {
    const day = new Date(d + "T00:00:00").getDay();
    return ["일", "월", "화", "수", "목", "금", "토"][day];
  };
  const shortDate = (d: string) => {
    const p = d.split("-");
    return `${parseInt(p[1])}/${parseInt(p[2])}(${dayName(d)})`;
  };

  return (
    <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-amber-100 dark:border-amber-800/50">
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">⚠️ 미입력 데이터</span>
        <span className="text-[10px] text-gray-400 ml-2">최근 7일</span>
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-800/30">
        {gaps.map(g => {
          const okCount = ALL_SOURCES.length - g.missing.length;
          const missCount = g.missing.length;
          const isOpen = expanded === g.date;
          const filled = ALL_SOURCES.filter(s => !g.missing.includes(s));

          return (
            <div key={g.date}>
              <button
                onClick={() => setExpanded(isOpen ? null : g.date)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              >
                <span className="font-medium text-gray-700 dark:text-zinc-300">{shortDate(g.date)}</span>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px]">
                    ✅ {okCount}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px]">
                    ❌ {missCount}
                  </span>
                  <span className="text-gray-400 text-[10px]">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-3 flex flex-wrap gap-1">
                  {filled.map(s => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-[10px]">
                      ✅ {s}
                    </span>
                  ))}
                  {g.missing.map(m => (
                    <span key={m} className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px]">
                      ❌ {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DataStatusPanel({ refreshKey }: { refreshKey: number }) {
  const [sources, setSources] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [refDate, setRefDate] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStatus = () => {
    setLoading(true);
    fetch("/api/data-status")
      .then(r => r.json())
      .then(d => {
        setSources(d.sources || []);
        setSummary(d.summary || {});
        setRefDate(d.referenceDate || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStatus(); }, [refreshKey]);

  if (loading) return <div className="text-center text-xs text-gray-400 py-4">데이터 상태 로딩...</div>;

  const autoSources = sources.filter(s => s.type === "auto");
  const manualSources = sources.filter(s => s.type === "manual");

  const formatDate = (d: string | null) => {
    if (!d) return "없음";
    const parts = d.split("-");
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-zinc-200">📡 데이터 수집 현황</span>
          <span className="text-[11px] text-gray-400">기준: {refDate}</span>
        </div>
        <div className="flex items-center gap-2">
          {summary?.ok > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              ✅ {summary.ok}
            </span>
          )}
          {summary?.stale > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              ❌ {summary.stale}
            </span>
          )}
        </div>
      </div>

      {/* Only show stale/missing sources */}
      {(() => {
        const staleAuto = autoSources.filter(s => !s.ok);
        const staleManual = manualSources.filter(s => !s.ok);
        if (staleAuto.length === 0 && staleManual.length === 0) {
          return (
            <div className="px-4 py-3 text-center text-xs text-green-600 dark:text-green-400">
              ✅ 모든 데이터 최신 상태
            </div>
          );
        }
        return (
          <div className="p-4 space-y-3">
            {staleAuto.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2 font-semibold">🔄 자동 수집 (API)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {staleAuto.map(s => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-500 animate-pulse" />
                      <div className="min-w-0">
                        <p className="font-medium truncate text-red-700 dark:text-red-400">{s.label}</p>
                        <p className="text-[10px] text-gray-400">{formatDate(s.latestDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {staleManual.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2 font-semibold">✍️ 수기 입력</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {staleManual.map(s => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-500 animate-pulse" />
                      <div className="min-w-0">
                        <p className="font-medium truncate text-red-700 dark:text-red-400">{s.label}</p>
                        <p className="text-[10px] text-gray-400">{formatDate(s.latestDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main DailyInput ───
export default function DailyInput() {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const refreshStatus = () => setStatusRefreshKey(k => k + 1);

  useEffect(() => {
    const saved = localStorage.getItem("daily-input-" + today);
    if (saved) setCompleted(new Set(JSON.parse(saved)));
  }, [today]);

  const toggle = (n: number) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      localStorage.setItem("daily-input-" + today, JSON.stringify([...next]));
      return next;
    });
  };

  // File upload handlers
  const [coupangAdsResult, setCoupangAdsResult] = useState<any>(null);
  const [coupangAdsUploading, setCoupangAdsUploading] = useState(false);
  const [coupangDailyResult, setCoupangDailyResult] = useState<any>(null);
  const [coupangDailyUploading, setCoupangDailyUploading] = useState(false);
  const [coupangItemResult, setCoupangItemResult] = useState<any>(null);
  const [coupangItemUploading, setCoupangItemUploading] = useState(false);

  // Batch upload state for coupang daily & item
  type BatchRow = { id: number; date: string; file: File | null; status: "pending" | "uploading" | "done" | "error"; result?: string };
  const [dailyBatch, setDailyBatch] = useState<BatchRow[]>([]);
  const [itemBatch, setItemBatch] = useState<BatchRow[]>([]);
  const [salesBatch, setSalesBatch] = useState<BatchRow[]>([]);

  const batchIdRef = useRef(0);

  // Auto-populate batch rows with missing dates
  useEffect(() => {
    fetch("/api/missing-dates?days=7")
      .then(r => r.json())
      .then((missing: Record<string, string[]>) => {
        const makeBatch = (dates: string[]) => dates.map(d => ({ id: ++batchIdRef.current, date: d, file: null, status: "pending" as const }));
        if (missing.coupang_item?.length) setItemBatch(makeBatch(missing.coupang_item));
        if (missing.sales?.length) setSalesBatch(makeBatch(missing.sales));
      })
      .catch(() => {});
  }, []);

  const addBatchRow = (setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, defaultDate: string) => {
    setter(prev => [...prev, { id: ++batchIdRef.current, date: defaultDate, file: null, status: "pending" }]);
  };
  const removeBatchRow = (setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, id: number) => {
    setter(prev => prev.filter(r => r.id !== id));
  };
  const updateBatchRow = (setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, id: number, patch: Partial<BatchRow>) => {
    setter(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const uploadSalesBatch = async () => {
    for (const row of salesBatch) {
      if (!row.file || row.status === "done") continue;
      updateBatchRow(setSalesBatch, row.id, { status: "uploading" });
      try {
        const form = new FormData();
        form.append("file", row.file);
        form.append("date", row.date);
        const res = await fetch("/api/upload-sales", { method: "POST", body: form });
        const data = await res.json();
        if (data.ok) {
          const brands = data.brandSummary ? Object.entries(data.brandSummary)
            .map(([b, info]: [string, any]) => `${({"nutty":"너티","ironpet":"아이언펫","saip":"사입","balancelab":"밸런스랩"} as any)[b]||b} ${info.count}건`)
            .join(", ") : "";
          updateBatchRow(setSalesBatch, row.id, { status: "done", result: `✅ ${row.date} ${data.parsed}건 | ${brands}` });
        } else {
          updateBatchRow(setSalesBatch, row.id, { status: "error", result: data.error || "실패" });
        }
      } catch {
        updateBatchRow(setSalesBatch, row.id, { status: "error", result: "업로드 실패" });
      }
    }
    refreshStatus();
  };

  const uploadBatch = async (batch: BatchRow[], setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, type: "daily" | "item") => {
    for (const row of batch) {
      if (!row.file || row.status === "done") continue;
      updateBatchRow(setter, row.id, { status: "uploading" });
      try {
        const form = new FormData();
        form.append("file", row.file);
        form.append("type", type);
        form.append("date", row.date);
        const res = await fetch("/api/upload-coupang-funnel", { method: "POST", body: form });
        const data = await res.json();
        if (data.ok) {
          const msg = type === "daily"
            ? `✅ ${row.date} 퍼널 ${data.funnel}건`
            : `✅ ${row.date} 상품 ${data.items}개`;
          updateBatchRow(setter, row.id, { status: "done", result: msg });
        } else {
          updateBatchRow(setter, row.id, { status: "error", result: data.error || "실패" });
        }
      } catch {
        updateBatchRow(setter, row.id, { status: "error", result: "업로드 실패" });
      }
    }
    refreshStatus();
  };
  const [salesResult, setSalesResult] = useState<any>(null);
  const [salesUploading, setSalesUploading] = useState(false);

  const uploadCoupangAds = async (file: File) => {
    setCoupangAdsUploading(true); setCoupangAdsResult(null);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/upload-coupang-ads", { method: "POST", body: form });
      const data = await res.json();
      setCoupangAdsResult(data.ok
        ? { message: `✅ ${data.dailyRows}일 광고비 ₩${formatCompact(data.totalSpend || 0)} / ROAS ${data.avgRoas}` }
        : data
      );
      if (data.ok) refreshStatus();
    } catch { setCoupangAdsResult({ error: "업로드 실패" }); }
    setCoupangAdsUploading(false);
  };

  const uploadCoupangDaily = async (file: File) => {
    setCoupangDailyUploading(true); setCoupangDailyResult(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("type", "daily"); form.append("date", selectedDate);
      const res = await fetch("/api/upload-coupang-funnel", { method: "POST", body: form });
      const data = await res.json();
      setCoupangDailyResult(data.ok
        ? { message: `✅ ${data.funnel}일 퍼널 + ${data.sales}일 매출 반영 (${selectedDate})` }
        : data
      );
      if (data.ok) refreshStatus();
    } catch { setCoupangDailyResult({ error: "업로드 실패" }); }
    setCoupangDailyUploading(false);
  };

  const uploadCoupangItem = async (file: File) => {
    setCoupangItemUploading(true); setCoupangItemResult(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("type", "item"); form.append("date", selectedDate);
      const res = await fetch("/api/upload-coupang-funnel", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        const mappedCount = data.mapped || 0;
        const unmappedCount = data.unmapped || 0;
        setCoupangItemResult({
          message: `✅ ${data.items}개 상품 | 매핑 ${mappedCount}개 / 미매핑 ${unmappedCount}개`,
          items: data.itemSummary,
        });
        refreshStatus();
      } else {
        setCoupangItemResult(data);
      }
    } catch { setCoupangItemResult({ error: "업로드 실패" }); }
    setCoupangItemUploading(false);
  };

  const uploadSales = async (file: File) => {
    setSalesUploading(true); setSalesResult(null);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/upload-sales", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        const brands = data.brandSummary ? Object.entries(data.brandSummary)
          .map(([b, info]: [string, any]) => `${({nutty:"너티",ironpet:"아이언펫",saip:"사입",balancelab:"밸런스랩"} as any)[b]||b} ${info.count}건`)
          .join(", ") : "";
        setSalesResult({ message: `✅ ${data.parsed}건 파싱 | ${brands} | 시트+DB 적재 완료` });
        toggle(6);
        refreshStatus();
      } else {
        setSalesResult(data);
      }
    } catch { setSalesResult({ error: "업로드 실패" }); }
    setSalesUploading(false);
  };

  // Ad spend save handler
  const saveAdSpend = async (data: any) => {
    const { date, channel, brand, spend, impressions, clicks, conversions, conversion_value, subscribers } = data;
    const row: any = {
      date, channel, brand: brand || "all",
      spend: spend || 0,
      impressions: impressions || 0,
      clicks: clicks || 0,
      conversions: conversions || 0,
      conversion_value: conversion_value || 0,
    };
    // For smartstore, save subscribers to a separate field or manual_monthly
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "manual_ad_spend",
        data: row,
        ...(subscribers ? { extra: { subscribers } } : {}),
      }),
    });
    const result = await res.json();
    if (res.ok) { refreshStatus(); return { message: `✅ ${channel} ${date} 저장 완료` }; }
    if (res.status === 409) {
      // Duplicate data — auto-override with confirmation
      if (window.confirm(`⚠️ 중복 데이터\n\n${result.message}\n\n덮어쓰시겠습니까?`)) {
        const res2 = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "manual_ad_spend", data: row, forceOverride: true }),
        });
        if (res2.ok) { refreshStatus(); return { message: `✅ ${channel} ${date} 덮어쓰기 완료` }; }
        return { error: "덮어쓰기 실패" };
      }
      return { error: "취소됨" };
    }
    return { error: result.error || result.message || "저장 실패" };
  };

  // Misc cost save handler
  const saveMiscCost = async (data: any) => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "misc_cost", data }),
    });
    const result = await res.json();
    if (res.ok) { refreshStatus(); return { message: `✅ 비용 저장 완료` }; }
    if (res.status === 409) {
      if (window.confirm(`⚠️ 중복 데이터\n\n${result.message}\n\n덮어쓰시겠습니까?`)) {
        const res2 = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "misc_cost", data, forceOverride: true }),
        });
        if (res2.ok) { refreshStatus(); return { message: `✅ 비용 덮어쓰기 완료` }; }
        return { error: "덮어쓰기 실패" };
      }
      return { error: "취소됨" };
    }
    return { error: result.error || result.message || "저장 실패" };
  };

  // Date selector - default yesterday (KST)
  const getYesterday = () => {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const selectedLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const progress = completed.size;
  const total = 6;

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-800 dark:text-zinc-200">📋 일일 데이터 입력</h3>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="text-sm border border-gray-200 dark:border-zinc-600 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-200" />
                <span className="text-xs text-gray-400">{selectedLabel}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">위에서 아래로 순서대로. 해당 없으면 체크만 하고 넘어가세요.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(progress / total) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 font-medium">{progress}/{total}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Status Panel */}
      <MissingDatesPanel refreshKey={statusRefreshKey} />
      <DataStatusPanel refreshKey={statusRefreshKey} />

      {/* 1. 쿠팡 데이터 */}
      <Section num={1} emoji="🟠" title="쿠팡 데이터" desc="광고비 + 일별 퍼널 + 상품별 실적"
        done={completed.has(1)} onToggleDone={() => toggle(1)}>
        <div className="space-y-4">
          {/* 1-A: 광고비 */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-zinc-300 mb-2">📊 광고비 <span className="text-gray-400 font-normal">— 광고센터 → 보고서 → 맞춤보고서</span></p>
            <FileZone label="쿠팡 광고 보고서(.xlsx)" uploading={coupangAdsUploading} onFile={uploadCoupangAds} />
            <ResultBox result={coupangAdsResult} />
          </div>

          <hr className="border-gray-100 dark:border-zinc-800" />

          {/* 1-B: 일별 퍼널 */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-zinc-300 mb-2">📈 일별 퍼널 <span className="text-gray-400 font-normal">— 셀러인사이트 → Daily Summary</span></p>
            <FileZone label="SELLER_INSIGHTS_DAILY_SUMMARY(.xlsx)" uploading={coupangDailyUploading} onFile={uploadCoupangDaily} />
            <ResultBox result={coupangDailyResult} />
          </div>

          <hr className="border-gray-100 dark:border-zinc-800" />

          {/* 1-C: 상품별 실적 (배치) */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-zinc-300 mb-2">🏷️ 상품별 실적 <span className="text-gray-400 font-normal">— 셀러인사이트 → Vendor Item Metrics (날짜별 파일)</span></p>
            <div className="space-y-2">
              {itemBatch.map(row => (
                <div key={row.id} className="flex items-center gap-2">
                  <input type="date" value={row.date} onChange={e => updateBatchRow(setItemBatch, row.id, { date: e.target.value })}
                    className="text-xs border rounded px-2 py-1 bg-white dark:bg-zinc-800 dark:border-zinc-600 w-36" disabled={row.status !== "pending"} />
                  <label className="flex-1 text-xs border rounded px-2 py-1.5 bg-gray-50 dark:bg-zinc-800 dark:border-zinc-600 cursor-pointer truncate hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) updateBatchRow(setItemBatch, row.id, { file: e.target.files[0] }); }}
                      disabled={row.status !== "pending"} />
                    {row.file ? row.file.name : "파일 선택..."}
                  </label>
                  {row.status === "pending" && (
                    <button onClick={() => removeBatchRow(setItemBatch, row.id)} className="text-gray-400 hover:text-red-500 text-sm px-1">✕</button>
                  )}
                  {row.status === "uploading" && <span className="text-xs text-blue-500 animate-pulse">⏳</span>}
                  {row.status === "done" && <span className="text-xs text-green-500" title={row.result}>✅</span>}
                  {row.status === "error" && <span className="text-xs text-red-500" title={row.result}>❌</span>}
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => addBatchRow(setItemBatch, selectedDate)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">+ 날짜 추가</button>
                {itemBatch.some(r => r.file && r.status === "pending") && (
                  <button onClick={() => uploadBatch(itemBatch, setItemBatch, "item")}
                    className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    한번에 업로드 ({itemBatch.filter(r => r.file && r.status === "pending").length}개)
                  </button>
                )}
              </div>
              {itemBatch.some(r => r.result) && (
                <div className="text-[11px] text-gray-500 space-y-0.5">
                  {itemBatch.filter(r => r.result).map(r => <div key={r.id}>{r.result}</div>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* 2. GFA 광고비 */}
      <Section num={2} emoji="🟢" title="GFA 광고비" desc="네이버 성과형 디스플레이 광고 → 브랜드별 입력"
        done={completed.has(2)} onToggleDone={() => toggle(2)}>
        <ManualAdInput channel="gfa" label="GFA" date={selectedDate} fields={[
          { key: "brand", label: "브랜드", placeholder: "선택", type: "select", options: ["아이언펫", "너티", "사입", "밸런스랩"] },
          { key: "spend", label: "비용 (원)", placeholder: "50000" },
          { key: "impressions", label: "노출수", placeholder: "10000" },
          { key: "clicks", label: "클릭수", placeholder: "100" },
          { key: "conversions", label: "구매건수", placeholder: "5" },
          { key: "conversion_value", label: "매출액 (원)", placeholder: "200000" },
        ]} onSave={async (data) => {
          const brandMap: Record<string, string> = { "아이언펫": "ironpet", "너티": "nutty", "사입": "saip", "밸런스랩": "balancelab" };
          const r = await saveAdSpend({ ...data, brand: brandMap[data.brand] || data.brand });
          if (!r.error) toggle(2);
          return r;
        }} />
      </Section>

      {/* 3. 스마트스토어 지표 */}
      <Section num={3} emoji="🟩" title="스마트스토어 지표" desc="아이언펫 + 밸런스랩(큐모발검사) 스마트스토어 지표"
        done={completed.has(3)} onToggleDone={() => toggle(3)}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">🐾 아이언펫 스마트스토어</p>
            <ManualAdInput channel="smartstore_funnel" label="아이언펫 스마트스토어" date={selectedDate} fields={[
              { key: "subscribers", label: "알림받기 수", placeholder: "12" },
              { key: "sessions", label: "유입 (토탈)", placeholder: "300" },
              { key: "avg_duration", label: "체류시간 (초)", placeholder: "120" },
              { key: "repurchases", label: "재구매", placeholder: "3" },
            ]} onSave={async (data) => {
              const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "smartstore_funnel", data: { date: selectedDate, brand: "ironpet", ...data } }),
              });
              const result = await res.json();
              if (res.ok) { return { message: `✅ 아이언펫 스마트스토어 ${selectedDate} 저장 완료` }; }
              return { error: result.error || "저장 실패" };
            }} />
          </div>
          <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">🧬 밸런스랩(큐모발검사) 스마트스토어</p>
            <ManualAdInput channel="balancelab_smartstore_funnel" label="밸런스랩 스마트스토어" date={selectedDate} fields={[
              { key: "subscribers", label: "알림받기 수", placeholder: "5" },
              { key: "sessions", label: "유입 (토탈)", placeholder: "100" },
              { key: "avg_duration", label: "체류시간 (초)", placeholder: "90" },
              { key: "repurchases", label: "재구매", placeholder: "1" },
            ]} onSave={async (data) => {
              const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "smartstore_funnel", data: { date: selectedDate, brand: "balancelab", ...data } }),
              });
              const result = await res.json();
              if (res.ok) { refreshStatus(); toggle(3); return { message: `✅ 밸런스랩 스마트스토어 ${selectedDate} 저장 완료` }; }
              return { error: result.error || "저장 실패" };
            }} />
          </div>
        </div>
      </Section>

      {/* 4. 카페24 퍼널 지표 */}
      <Section num={4} emoji="🛒" title="카페24 퍼널" desc="카페24 → 장바구니 / 회원가입 / 재구매"
        done={completed.has(4)} onToggleDone={() => toggle(4)}>
        <ManualAdInput channel="cafe24_funnel" label="카페24" date={selectedDate} fields={[
          { key: "cart_adds", label: "장바구니", placeholder: "15" },
          { key: "signups", label: "회원가입", placeholder: "3" },
          { key: "repurchases", label: "재구매", placeholder: "2" },
        ]} onSave={async (data) => {
          const res = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "cafe24_funnel", data: { date: selectedDate, ...data } }),
          });
          const result = await res.json();
          if (res.ok) { refreshStatus(); toggle(4); return { message: `✅ 카페24 ${selectedDate} 저장 완료` }; }
          return { error: result.error || "저장 실패" };
        }} />
      </Section>

      {/* 5. 판매 실적 (배치) */}
      <Section num={5} emoji="📤" title="판매 실적 (이카운트)" desc="이카운트 → 판매입력 엑셀 날짜별 업로드"
        done={completed.has(5)} onToggleDone={() => toggle(5)}>
        <div className="space-y-2">
          {salesBatch.map(row => (
            <div key={row.id} className="flex items-center gap-2">
              <input type="date" value={row.date} onChange={e => updateBatchRow(setSalesBatch, row.id, { date: e.target.value })}
                className="text-xs border rounded px-2 py-1 bg-white dark:bg-zinc-800 dark:border-zinc-600 w-36" disabled={row.status !== "pending"} />
              <label className="flex-1 text-xs border rounded px-2 py-1.5 bg-gray-50 dark:bg-zinc-800 dark:border-zinc-600 cursor-pointer truncate hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) updateBatchRow(setSalesBatch, row.id, { file: e.target.files[0] }); }}
                  disabled={row.status !== "pending"} />
                {row.file ? row.file.name : "판매입력 엑셀(.xlsx)"}
              </label>
              {row.status === "pending" && (
                <button onClick={() => removeBatchRow(setSalesBatch, row.id)} className="text-gray-400 hover:text-red-500 text-sm px-1">✕</button>
              )}
              {row.status === "uploading" && <span className="text-xs text-blue-500 animate-pulse">⏳</span>}
              {row.status === "done" && <span className="text-xs text-green-500" title={row.result}>✅</span>}
              {row.status === "error" && <span className="text-xs text-red-500" title={row.result}>❌</span>}
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => addBatchRow(setSalesBatch, selectedDate)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">+ 날짜 추가</button>
            {salesBatch.some(r => r.file && r.status === "pending") && (
              <button onClick={() => uploadSalesBatch()}
                className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                한번에 업로드 ({salesBatch.filter(r => r.file && r.status === "pending").length}개)
              </button>
            )}
          </div>
          {salesBatch.some(r => r.result) && (
            <div className="text-[11px] text-gray-500 space-y-0.5">
              {salesBatch.filter(r => r.result).map(r => <div key={r.id}>{r.result}</div>)}
            </div>
          )}
        </div>
      </Section>

      {/* 5.5 마케팅 이벤트 */}
      <Section num={7} emoji="📌" title="마케팅 이벤트" desc="캠페인, 프로모션, 신제품 출시 등 — 차트에 표시됩니다"
        done={completed.has(7)} onToggleDone={() => toggle(7)}>
        <EventInput date={selectedDate} />
      </Section>

      {/* 6. 건별 비용 */}
      <Section num={6} emoji="🧾" title="건별 비용" desc="인플루언서/체험단/공구/촬영비/디자인비 등 건별 비용"
        done={completed.has(6)} onToggleDone={() => toggle(6)}>
        <ManualAdInput channel="misc_cost" label="건별비용" date={selectedDate} fields={[
          { key: "brand", label: "브랜드", placeholder: "선택", type: "select", options: ["아이언펫", "너티", "사입", "밸런스랩"] },
          { key: "category", label: "구분", placeholder: "선택", type: "select", options: ["인플루언서", "협찬", "공구", "체험단", "촬영비", "디자인비", "샘플비", "배송비", "수수료", "기타"] },
          { key: "description", label: "사유", placeholder: "광고비 정산 등", type: "text" },
          { key: "spend", label: "비용 (원)", placeholder: "100000" },
          { key: "note", label: "비고", placeholder: "업체명 등", type: "text" },
        ]} onSave={async (data) => {
          const brandMap: Record<string, string> = { "아이언펫": "ironpet", "너티": "nutty", "사입": "saip", "밸런스랩": "balancelab" };
          const r = await saveMiscCost({ ...data, brand: brandMap[data.brand] || data.brand });
          if (!r.error) toggle(6);
          return r;
        }} />
      </Section>

      {/* Auto status */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🤖 자동 수집 (입력 불필요)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-zinc-400">
            {["Meta 광고비 (너티+아이언펫+밸런스랩)", "네이버 검색/쇼핑 광고", "Google Ads", "GA4 퍼널", "카페24 매출"].map(name => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="text-green-500">✓</span> {name}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Misc cost sub-component ───
function MiscCostInput({ onSave, date }: { onSave: (data: any) => Promise<any>; date: string }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("기타");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSave = async () => {
    if (!amount) { setResult({ error: "금액을 입력하세요" }); return; }
    setSaving(true); setResult(null);
    const r = await onSave({ date, description: description || category, amount: Number(amount), category });
    setResult(r);
    if (!r.error) { setDescription(""); setAmount(""); }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-gray-500">구분</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600">
            <option>촬영비</option><option>디자인비</option><option>샘플비</option>
            <option>배송비</option><option>수수료</option><option>기타</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500">내용</label>
          <input type="text" placeholder="상세 내용" value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">금액 (원)</label>
          <input type="number" placeholder="50000" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600" />
        </div>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">
        {saving ? "저장 중..." : "저장"}
      </button>
      <ResultBox result={result} />
    </div>
  );
}
