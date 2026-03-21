"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface ExportReportProps {
  targetId: string;
  filename?: string;
}

export default function ExportReport({ targetId, filename = "report" }: ExportReportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const el = document.getElementById(targetId);
      if (!el) return;

      // Add export timestamp watermark
      const watermark = document.createElement("div");
      watermark.className = "text-xs text-gray-400 dark:text-zinc-500 py-2 px-4 border-t border-gray-200 dark:border-zinc-800 mt-4";
      const now = new Date();
      const kstStr = now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      watermark.textContent = `📊 PPMI 마케팅 대시보드 | 내보내기: ${kstStr} | ${filename}`;
      el.appendChild(watermark);

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: document.documentElement.classList.contains("dark") ? "#09090b" : "#ffffff",
      });

      // Remove watermark after capture
      el.removeChild(watermark);

      const imgData = canvas.toDataURL("image/png");
      const imgW = canvas.width;
      const imgH = canvas.height;

      // A4 landscape
      const pdf = new jsPDF({ orientation: imgW > imgH ? "landscape" : "portrait", unit: "px", format: [imgW, imgH] });
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
      pdf.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" />
      {exporting ? "내보내는 중..." : "PDF 보고서"}
    </button>
  );
}
