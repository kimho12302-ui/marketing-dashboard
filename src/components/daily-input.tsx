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

// ─── Manual ad spend input ───
function ManualAdInput({ channel, label, fields, onSave, date }: {
  channel: string; label: string; date: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  onSave: (data: any) => Promise<any>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const numValues: Record<string, number> = {};
      for (const f of fields) {
        numValues[f.key] = Number(values[f.key] || 0);
      }
      const res = await onSave({ date, channel, ...numValues });
      setResult(res);
      if (!res.error) setValues({});
    } catch {
      setResult({ error: "저장 실패" });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-[11px] text-gray-500 dark:text-zinc-400">{f.label}</label>
            <input type={f.type || "number"} placeholder={f.placeholder}
              value={values[f.key] || ""}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:border-zinc-600" />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving}
        className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">
        {saving ? "저장 중..." : "저장"}
      </button>
      <ResultBox result={result} />
    </div>
  );
}

// ─── Data Status Panel ───
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

      <div className="p-4 space-y-3">
        {/* Auto sources */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2 font-semibold">🔄 자동 수집 (API)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {autoSources.map(s => (
              <div key={s.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${s.ok
                ? "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
              }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.ok ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                <div className="min-w-0">
                  <p className={`font-medium truncate ${s.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-gray-400">{formatDate(s.latestDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manual sources */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2 font-semibold">✍️ 수기 입력</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {manualSources.map(s => (
              <div key={s.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${s.ok
                ? "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
              }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.ok ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
                <div className="min-w-0">
                  <p className={`font-medium truncate ${s.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-gray-400">{formatDate(s.latestDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main DailyInput ───
export default function DailyInput() {
  const today = new Date().toISOString().slice(0, 10);
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
  const batchIdRef = useRef(0);

  const addBatchRow = (setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, defaultDate: string) => {
    setter(prev => [...prev, { id: ++batchIdRef.current, date: defaultDate, file: null, status: "pending" }]);
  };
  const removeBatchRow = (setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, id: number) => {
    setter(prev => prev.filter(r => r.id !== id));
  };
  const updateBatchRow = (setter: React.Dispatch<React.SetStateAction<BatchRow[]>>, id: number, patch: Partial<BatchRow>) => {
    setter(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
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
    const { date, channel, spend, impressions, clicks, conversions, conversion_value, subscribers } = data;
    const row: any = {
      date, channel, brand: "all",
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
    return { error: result.error || "저장 실패" };
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
    return { error: result.error || "저장 실패" };
  };

  // Date selector - default yesterday
  const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const selectedLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const progress = completed.size;
  const total = 7;

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
      <Section num={2} emoji="🟢" title="GFA 광고비" desc="네이버 성과형 디스플레이 광고 → 어제 비용 확인"
        done={completed.has(2)} onToggleDone={() => toggle(2)}>
        <ManualAdInput channel="gfa" label="GFA" date={selectedDate} fields={[
          { key: "spend", label: "광고비 (원)", placeholder: "50000" },
          { key: "impressions", label: "노출수", placeholder: "10000" },
          { key: "clicks", label: "클릭수", placeholder: "100" },
        ]} onSave={async (data) => {
          const r = await saveAdSpend(data);
          if (!r.error) toggle(2);
          return r;
        }} />
      </Section>

      {/* 3. 스마트스토어 광고비 */}
      <Section num={3} emoji="🟩" title="스마트스토어 광고비" desc="스마트스토어 광고 → 어제 비용 + 알림받기 수 확인"
        done={completed.has(3)} onToggleDone={() => toggle(3)}>
        <ManualAdInput channel="smartstore_ads" label="스마트스토어" date={selectedDate} fields={[
          { key: "spend", label: "광고비 (원)", placeholder: "30000" },
          { key: "impressions", label: "노출수", placeholder: "5000" },
          { key: "clicks", label: "클릭수", placeholder: "50" },
          { key: "subscribers", label: "알림받기 수", placeholder: "12" },
        ]} onSave={async (data) => {
          const r = await saveAdSpend(data);
          if (!r.error) toggle(3);
          return r;
        }} />
      </Section>

      {/* 4. 인플루언서/체험단 비용 */}
      <Section num={4} emoji="👥" title="인플루언서/체험단 비용" desc="어제 집행한 인플루언서/체험단/공구 비용"
        done={completed.has(4)} onToggleDone={() => toggle(4)}>
        <ManualAdInput channel="influencer" label="인플루언서" date={selectedDate} fields={[
          { key: "spend", label: "비용 (원)", placeholder: "100000" },
          { key: "conversions", label: "건수", placeholder: "1" },
        ]} onSave={async (data) => {
          const r = await saveAdSpend(data);
          if (!r.error) toggle(4);
          return r;
        }} />
      </Section>

      {/* 5. 건별 비용 */}
      <Section num={5} emoji="🧾" title="건별 비용" desc="촬영비, 디자인비, 샘플비, 기타 비용"
        done={completed.has(5)} onToggleDone={() => toggle(5)}>
        <MiscCostInput date={selectedDate} onSave={async (data) => {
          const r = await saveMiscCost(data);
          if (!r.error) toggle(5);
          return r;
        }} />
      </Section>

      {/* 6. 판매 실적 */}
      <Section num={6} emoji="📤" title="판매 실적 (이카운트)" desc="이카운트 → 판매입력 엑셀 다운로드 → 업로드"
        done={completed.has(6)} onToggleDone={() => toggle(6)}>
        <FileZone label="판매입력 엑셀(.xlsx) 드래그 또는 클릭" uploading={salesUploading} onFile={uploadSales} />
        <ResultBox result={salesResult} />
      </Section>

      {/* 7. 싱크 & 확인 */}
      <Section num={7} emoji="🔄" title="싱크 & 대시보드 확인" desc="싱크 버튼 누르고 Overview에서 데이터 확인"
        done={completed.has(7)} onToggleDone={() => toggle(7)}>
        <div className="flex gap-3">
          <button onClick={async () => {
            await Promise.all([
              fetch("/api/sync", { method: "POST" }),
              fetch("/api/sync-ads", { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" }),
            ]);
            toggle(7);
            refreshStatus();
          }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
            🔄 싱크 후 대시보드 보기
          </button>
        </div>
      </Section>

      {/* Auto status */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🤖 자동 수집 (입력 불필요)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-zinc-400">
            {["Meta 광고비 (너티+아이언펫)", "네이버 검색/쇼핑 광고", "Google Ads", "GA4 퍼널", "카페24 매출"].map(name => (
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
