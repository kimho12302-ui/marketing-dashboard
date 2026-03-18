import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  const brand = sp.get("brand") || "all";

  const { data, error } = await supabase
    .from("manual_monthly")
    .select("*")
    .eq("category", "target")
    .eq("month", month + "-01")
    .eq("brand", brand)
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data && data.length > 0) {
    try {
      const targets = JSON.parse(data[0].note || "{}");
      return NextResponse.json({ targets, month, brand });
    } catch {
      return NextResponse.json({ targets: {}, month, brand });
    }
  }

  return NextResponse.json({ targets: {}, month, brand });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { month, brand = "all", targets } = body;

  if (!month || !targets) {
    return NextResponse.json({ error: "month and targets required" }, { status: 400 });
  }

  const monthDate = month.length === 7 ? month + "-01" : month;

  // Upsert: check if exists
  const { data: existing } = await supabase
    .from("manual_monthly")
    .select("id")
    .eq("category", "target")
    .eq("month", monthDate)
    .eq("brand", brand)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("manual_monthly")
      .update({ value: 0, note: JSON.stringify(targets) })
      .eq("id", existing[0].id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("manual_monthly")
      .insert({ month: monthDate, brand, category: "target", value: 0, note: JSON.stringify(targets) });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
