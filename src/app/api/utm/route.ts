import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  try {
    const { data, error } = await supabase
      .from("utm_analytics")
      .select("source, medium, sessions, users, new_users")
      .gte("date", from)
      .lte("date", to)
      .order("sessions", { ascending: false });
    if (error) throw error;

    // Aggregate by source/medium
    const agg = new Map<string, { source: string; medium: string; sessions: number; users: number; new_users: number }>();
    for (const r of (data || [])) {
      const key = `${r.source}/${r.medium}`;
      const existing = agg.get(key) || { source: r.source, medium: r.medium, sessions: 0, users: 0, new_users: 0 };
      existing.sessions += r.sessions || 0;
      existing.users += r.users || 0;
      existing.new_users += r.new_users || 0;
      agg.set(key, existing);
    }

    const result = Array.from(agg.values()).sort((a, b) => b.sessions - a.sessions);
    return NextResponse.json({ data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}
