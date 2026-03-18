import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Events stored in manual_monthly with category='event'
// note = JSON.stringify({ title, type, description })
// month = event date (YYYY-MM-DD)

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  const { data, error } = await supabase
    .from("manual_monthly")
    .select("*")
    .eq("category", "event")
    .gte("month", from)
    .lte("month", to)
    .order("month", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data || []).map(r => {
    try {
      const meta = JSON.parse(r.note || "{}");
      return { date: r.month, title: meta.title || "", type: meta.type || "etc", description: meta.description || "", brand: r.brand };
    } catch {
      return { date: r.month, title: r.note || "", type: "etc", description: "", brand: r.brand };
    }
  });

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, title, type = "etc", description = "", brand = "all" } = body;

  if (!date || !title) {
    return NextResponse.json({ error: "date and title required" }, { status: 400 });
  }

  const { error } = await supabase.from("manual_monthly").insert({
    month: date,
    brand,
    category: "event",
    value: 0,
    note: JSON.stringify({ title, type, description }),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("manual_monthly").delete().eq("id", id).eq("category", "event");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
