import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const brand = sp.get("brand") || "all";

  try {
    let query = supabase.from("marketing_events").select("*").order("date");
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);
    // If brand specified, show brand-specific + "all" events
    if (brand && brand !== "all") {
      query = query.in("brand", [brand, "all"]);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ events: data || [] });
  } catch (error: any) {
    // Table might not exist yet
    if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
      return NextResponse.json({ events: [] });
    }
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, brand, title, description, color } = body;
    if (!date || !title) {
      return NextResponse.json({ error: "date and title required" }, { status: 400 });
    }
    const record = {
      date,
      brand: brand || "all",
      title,
      description: description || null,
      color: color || "#6366f1",
    };
    const { data, error } = await supabase.from("marketing_events").insert(record).select();
    if (error) throw error;
    return NextResponse.json({ ok: true, event: data?.[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to save event" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const { error } = await supabase.from("marketing_events").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to delete" }, { status: 500 });
  }
}
