import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Target metrics stored as individual rows in manual_monthly
// category="target", metric="target_revenue", "target_adSpend", etc.

// GET: Fetch targets for a brand and month
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const brand = sp.get("brand") || "all";
  const month = sp.get("month") || ""; // YYYY-MM-01

  if (!month) {
    return NextResponse.json({ targets: {} });
  }

  const { data, error } = await supabase
    .from("manual_monthly")
    .select("metric,value")
    .eq("category", "target")
    .eq("month", month)
    .eq("brand", brand);

  if (error) {
    console.error("Targets GET error:", error);
    return NextResponse.json({ targets: {} });
  }

  const targets: Record<string, number> = {};
  for (const row of data || []) {
    // metric format: "target_revenue" -> key "revenue"
    const key = row.metric.replace("target_", "");
    targets[key] = Number(row.value || 0);
  }

  return NextResponse.json({ targets });
}

// POST: Save targets for a brand and month
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brand, month, targets } = body;

    if (!brand || !month || !targets) {
      return NextResponse.json({ error: "brand, month, targets required" }, { status: 400 });
    }

    // Delete existing targets for this brand+month
    await supabase
      .from("manual_monthly")
      .delete()
      .eq("category", "target")
      .eq("month", month)
      .eq("brand", brand);

    // Insert each target as a separate row
    const rows = Object.entries(targets)
      .filter(([, v]) => Number(v) > 0)
      .map(([key, value]) => ({
        month,
        brand,
        channel: "total",
        category: "target",
        metric: `target_${key}`,
        value: Number(value),
      }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from("manual_monthly")
        .insert(rows);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Targets POST error:", error);
    return NextResponse.json({ error: "Failed to save targets" }, { status: 500 });
  }
}
