import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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
    .select("note")
    .eq("category", "target")
    .eq("month", month)
    .eq("brand", brand)
    .limit(1);

  if (error) {
    console.error("Targets GET error:", error);
    return NextResponse.json({ targets: {} });
  }

  let targets = {};
  if (data && data.length > 0) {
    try { targets = JSON.parse(data[0].note || "{}"); } catch {}
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

    // Upsert: check if exists, then update or insert
    const { data: existing } = await supabase
      .from("manual_monthly")
      .select("id")
      .eq("category", "target")
      .eq("month", month)
      .eq("brand", brand)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("manual_monthly")
        .update({
          note: JSON.stringify(targets),
          value: targets.revenue || 0,
        })
        .eq("id", existing[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("manual_monthly")
        .insert({
          month,
          brand,
          category: "target",
          metric: "monthly_target",
          value: targets.revenue || 0,
          note: JSON.stringify(targets),
        });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Targets POST error:", error);
    return NextResponse.json({ error: "Failed to save targets" }, { status: 500 });
  }
}
