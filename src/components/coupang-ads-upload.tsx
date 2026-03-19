"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";

interface UploadResult {
  ok?: boolean;
  parsed?: number;
  dailyRows?: number;
  totalSpend?: number;
  totalConversionValue?: number;
  avgRoas?: string;
  dates?: { from: string; to: string } | null;
  drive?: { fileId?: string; fileName?: string; error?: string };
  error?: string;
}

export default function CoupangAdsUpload() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      setResult({ error: "엑셀 파일(.xlsx)만 업로드 가능합니다" });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-coupang-ads", { method: "POST", body: form });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "업로드 실패" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          🟠 쿠팡 광고비 업로드
        </CardTitle>
        <p className="text-xs text-gray-500 dark:text-zinc-400">
          쿠팡 광고센터 → 보고서 → 맞춤 보고서 다운로드(.xlsx) → 여기에 업로드
          <br />
          DB 적재 + Google Drive 아카이빙 자동 처리
        </p>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10" : "border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600"
          }`}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          <Upload className={`h-8 w-8 mx-auto mb-2 ${uploading ? "animate-bounce text-orange-500" : "text-gray-400"}`} />
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            {uploading ? "처리 중..." : "쿠팡 광고 보고서(.xlsx) 드래그 또는 클릭"}
          </p>
        </div>

        {result && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${result.error ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"}`}>
            {result.error ? (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span>{result.error}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">업로드 완료!</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">행: </span>
                    <span className="font-medium">{result.parsed}건</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">일별: </span>
                    <span className="font-medium">{result.dailyRows}일</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">광고비: </span>
                    <span className="font-medium">₩{formatCompact(result.totalSpend || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">ROAS: </span>
                    <span className="font-medium">{result.avgRoas}</span>
                  </div>
                </div>
                {result.dates && (
                  <p className="text-[10px] text-gray-400">기간: {result.dates.from} ~ {result.dates.to}</p>
                )}
                {result.drive?.fileId && (
                  <p className="text-[10px] text-green-500">📁 Google Drive 아카이빙 완료</p>
                )}
                {result.drive?.error && (
                  <p className="text-[10px] text-yellow-500">⚠️ Drive 아카이빙 실패 (DB는 정상 적재)</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
