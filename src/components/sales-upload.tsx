"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";

interface UploadResult {
  ok?: boolean;
  parsed?: number;
  skipped?: number;
  productSales?: number;
  dailySales?: number;
  sheetAppended?: number;
  brandSummary?: Record<string, { count: number; revenue: number }>;
  dates?: { from: string; to: string } | null;
  error?: string;
}

const BRAND_LABELS: Record<string, string> = {
  nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩", unknown: "미분류",
};

export default function SalesUpload() {
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
      const res = await fetch("/api/upload-sales", { method: "POST", body: form });
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
          📤 판매 데이터 업로드
        </CardTitle>
        <p className="text-xs text-gray-500 dark:text-zinc-400">
          이카운트 판매입력 엑셀(.xlsx)을 업로드하면 자동으로 브랜드 분류 + DB 적재 + 시트 기록됩니다.
        </p>
      </CardHeader>
      <CardContent>
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10" : "border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600"
          }`}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          <Upload className={`h-8 w-8 mx-auto mb-2 ${uploading ? "animate-bounce text-indigo-500" : "text-gray-400"}`} />
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            {uploading ? "처리 중..." : "판매입력_YYMMDD.xlsx 드래그 또는 클릭"}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">
            판매정리 탭 → X2:AP 영역 자동 파싱 | YSIET* = 밸런스랩
          </p>
        </div>

        {/* Result */}
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
                    <span className="text-gray-500 dark:text-zinc-400">파싱: </span>
                    <span className="font-medium">{result.parsed}건</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">상품매출: </span>
                    <span className="font-medium">{result.productSales}건</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">일별매출: </span>
                    <span className="font-medium">{result.dailySales}건</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400">시트: </span>
                    <span className="font-medium">{result.sheetAppended}건</span>
                  </div>
                </div>
                {result.dates && (
                  <p className="text-[10px] text-gray-400">기간: {result.dates.from} ~ {result.dates.to}</p>
                )}
                {result.brandSummary && (
                  <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                    <p className="text-[10px] text-gray-500 dark:text-zinc-400 mb-1">브랜드별 요약:</p>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(result.brandSummary).map(([brand, info]) => (
                        <div key={brand} className="text-xs">
                          <span className="font-medium">{BRAND_LABELS[brand] || brand}</span>
                          <span className="text-gray-400 ml-1">{info.count}건 ₩{formatCompact(info.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
