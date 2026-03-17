import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

// Parse CSV text into rows
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

// Parse XLSX buffer into rows
function parseXLSX(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
  // Convert all values to strings for consistent processing
  return jsonData.map(row => {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      mapped[k] = String(v);
    }
    return mapped;
  });
}

function safeNum(v: string): number {
  const n = Number(String(v).replace(/,/g, "").replace(/₩/g, "").replace(/원/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function parseDate(v: string): string | null {
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // Try YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v.replace(/\//g, "-");
  // Try MM/DD/YYYY
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const channel = formData.get("channel") as string || "manual";
    const brand = formData.get("brand") as string || "nutty";
    
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    
    const fileName = file.name.toLowerCase();
    let rows: Record<string, string>[];
    
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      rows = parseXLSX(buffer);
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }
    
    if (rows.length === 0) {
      return NextResponse.json({ error: "빈 파일이거나 CSV 형식이 아닙니다" }, { status: 400 });
    }
    
    // Detect format and map columns
    const headers = Object.keys(rows[0]);
    const headerStr = headers.join(",").toLowerCase();
    
    let dbRows: any[] = [];
    
    // Auto-detect: Coupang ads format
    if (headerStr.includes("광고비") || headerStr.includes("노출수") || headerStr.includes("클릭수")) {
      // Korean ad data format
      const dateKey = headers.find(h => /날짜|일자|date/i.test(h)) || headers[0];
      const spendKey = headers.find(h => /광고비|비용|spend/i.test(h));
      const impKey = headers.find(h => /노출|impression/i.test(h));
      const clickKey = headers.find(h => /클릭|click/i.test(h));
      const convKey = headers.find(h => /전환매출|매출|revenue|conversion/i.test(h));
      const orderKey = headers.find(h => /전환수|주문|order|conversion.*수/i.test(h));
      
      for (const row of rows) {
        const date = parseDate(row[dateKey]);
        if (!date) continue;
        
        dbRows.push({
          date,
          brand,
          channel,
          spend: safeNum(row[spendKey || ""]),
          impressions: safeNum(row[impKey || ""]),
          clicks: safeNum(row[clickKey || ""]),
          conversion_value: safeNum(row[convKey || ""]),
          conversions: safeNum(row[orderKey || ""]),
          roas: 0, // will be calculated
        });
      }
    } else {
      // Generic format: try to map date + numeric columns
      const dateKey = headers.find(h => /date|날짜/i.test(h)) || headers[0];
      const numericHeaders = headers.filter(h => h !== dateKey);
      
      for (const row of rows) {
        const date = parseDate(row[dateKey]);
        if (!date) continue;
        
        dbRows.push({
          date,
          brand,
          channel,
          spend: safeNum(row[numericHeaders.find(h => /spend|광고비|비용/i.test(h)) || ""]),
          impressions: safeNum(row[numericHeaders.find(h => /impression|노출/i.test(h)) || ""]),
          clicks: safeNum(row[numericHeaders.find(h => /click|클릭/i.test(h)) || ""]),
          conversion_value: safeNum(row[numericHeaders.find(h => /revenue|매출|전환매출/i.test(h)) || ""]),
          conversions: 0,
          roas: 0,
        });
      }
    }
    
    // Calculate ROAS
    for (const row of dbRows) {
      row.roas = row.spend > 0 ? Math.round((row.conversion_value / row.spend) * 100) / 100 : 0;
    }
    
    if (dbRows.length === 0) {
      return NextResponse.json({ error: "유효한 데이터 행이 없습니다. 날짜 형식을 확인하세요." }, { status: 400 });
    }
    
    // Dedup before upsert
    const seen = new Set<string>();
    const deduped = dbRows.filter(r => {
      const key = `${r.date}-${r.brand}-${r.channel}`;
      if (seen.has(key)) {
        // Merge: sum spend etc.
        const existing = deduped.find(d => `${d.date}-${d.brand}-${d.channel}` === key);
        if (existing) {
          existing.spend += r.spend;
          existing.impressions += r.impressions;
          existing.clicks += r.clicks;
          existing.conversion_value += r.conversion_value;
          existing.roas = existing.spend > 0 ? Math.round((existing.conversion_value / existing.spend) * 100) / 100 : 0;
        }
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Upsert in batches
    const batchSize = 50;
    let total = 0;
    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const { error } = await supabase.from("daily_ad_spend").upsert(batch, { onConflict: "date,brand,channel" });
      if (error) throw error;
      total += batch.length;
    }
    
    return NextResponse.json({
      ok: true,
      message: `${total}건 업로드 완료`,
      summary: {
        rows: total,
        dateRange: `${deduped[0]?.date} ~ ${deduped[deduped.length - 1]?.date}`,
        totalSpend: deduped.reduce((s, r) => s + r.spend, 0),
        channel,
        brand,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}
