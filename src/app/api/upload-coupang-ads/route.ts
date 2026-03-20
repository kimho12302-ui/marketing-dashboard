import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const DRIVE_FOLDER_ID = "1WOGhcIrTMx6t7X3VmgA1453WQGzXNsRh";

function getAuth() {
  const saKey = process.env.GOOGLE_SA_KEY;
  if (!saKey) throw new Error("GOOGLE_SA_KEY not set");
  const creds = JSON.parse(saKey);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

interface CoupangRow {
  date: string;
  campaign: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  conversionValue: number;
  roas: number;
}

function parseDate(val: any): string {
  if (!val) return "";
  const s = String(val).replace(/\.0$/, "");
  // Format: YYYYMMDD (number like 20260309)
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s.slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    if (allData.length < 2) {
      return NextResponse.json({ error: "데이터가 없습니다" }, { status: 400 });
    }

    const headers = allData[0] as string[];
    const colMap: Record<string, number> = {};
    headers.forEach((h, i) => { if (h) colMap[String(h).trim()] = i; });

    const dateCol = colMap["날짜"] ?? -1;
    const campaignCol = colMap["캠페인 이름"] ?? -1;
    const impCol = colMap["노출수"] ?? -1;
    const clickCol = colMap["클릭수"] ?? -1;
    const spendCol = colMap["광고비(원)"] ?? -1;
    const ordersCol = colMap["총 주문수 (1일)"] ?? -1;
    const convCol = colMap["총 전환 매출액 (1일)(원)"] ?? -1;
    const roasCol = colMap["총 광고 수익률 (1일)"] ?? -1;

    if (dateCol < 0 || spendCol < 0) {
      return NextResponse.json({
        error: `필수 컬럼 누락: 날짜(${dateCol}), 광고비(${spendCol})`,
      }, { status: 400 });
    }

    // Parse rows
    const rows: CoupangRow[] = [];
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row || !row[dateCol]) continue;

      const dateStr = parseDate(row[dateCol]);
      if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

      rows.push({
        date: dateStr,
        campaign: campaignCol >= 0 ? String(row[campaignCol] || "") : "",
        impressions: impCol >= 0 ? Number(row[impCol] || 0) : 0,
        clicks: clickCol >= 0 ? Number(row[clickCol] || 0) : 0,
        spend: Number(row[spendCol] || 0),
        orders: ordersCol >= 0 ? Number(row[ordersCol] || 0) : 0,
        conversionValue: convCol >= 0 ? Number(row[convCol] || 0) : 0,
        roas: roasCol >= 0 ? Number(row[roasCol] || 0) : 0,
      });
    }

    // Aggregate by date for daily_ad_spend
    const dailyAgg = new Map<string, {
      spend: number; impressions: number; clicks: number;
      conversions: number; conversion_value: number;
    }>();
    for (const r of rows) {
      const ex = dailyAgg.get(r.date);
      if (ex) {
        ex.spend += r.spend;
        ex.impressions += r.impressions;
        ex.clicks += r.clicks;
        ex.conversions += r.orders;
        ex.conversion_value += r.conversionValue;
      } else {
        dailyAgg.set(r.date, {
          spend: r.spend, impressions: r.impressions, clicks: r.clicks,
          conversions: r.orders, conversion_value: r.conversionValue,
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const dbRows = Array.from(dailyAgg.entries()).map(([date, d]) => ({
      date,
      channel: "coupang_ads",
      brand: "nutty",
      spend: Math.round(d.spend),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      conversion_value: Math.round(d.conversion_value),
      roas: d.spend > 0 ? d.conversion_value / d.spend : 0,
    }));

    let dbResult: any = {};
    for (let i = 0; i < dbRows.length; i += 500) {
      const chunk = dbRows.slice(i, i + 500);
      const { error } = await supabase.from("daily_ad_spend").upsert(chunk, {
        onConflict: "date,channel,brand",
      });
      if (error) dbResult.error = error.message;
    }

    // Archive to Google Drive
    let driveResult: any = {};
    try {
      const auth = getAuth();
      const drive = google.drive({ version: "v3", auth });
      const fileBuffer = Buffer.from(buffer);

      const driveRes = await drive.files.create({
        requestBody: {
          name: file.name,
          parents: [DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: require("stream").Readable.from(fileBuffer),
        },
        fields: "id,name",
      });
      driveResult = { fileId: driveRes.data.id, fileName: driveRes.data.name };
    } catch (e) {
      driveResult = { error: String(e) };
    }

    // Summary
    const totalSpend = dbRows.reduce((s, r) => s + r.spend, 0);
    const totalConv = dbRows.reduce((s, r) => s + r.conversion_value, 0);
    const dates = dbRows.map(r => r.date).sort();

    return NextResponse.json({
      ok: true,
      parsed: rows.length,
      dailyRows: dbRows.length,
      totalSpend,
      totalConversionValue: totalConv,
      avgRoas: totalSpend > 0 ? (totalConv / totalSpend).toFixed(2) : "0",
      dates: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
      drive: driveResult,
      ...dbResult,
    });
  } catch (error) {
    console.error("Upload coupang ads error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
