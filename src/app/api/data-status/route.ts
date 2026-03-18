import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const tables = ["daily_sales", "daily_ad_spend", "daily_funnel", "product_sales", "keyword_performance"];
    const results: any[] = [];

    for (const table of tables) {
      const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
      const { data: latest } = await supabase.from(table).select("date").order("date", { ascending: false }).limit(1);
      const { data: earliest } = await supabase.from(table).select("date").order("date", { ascending: true }).limit(1);
      
      const latestDate = latest?.[0]?.date || null;
      const earliestDate = earliest?.[0]?.date || null;
      
      // Check if data is stale (more than 2 days old)
      const isStale = latestDate ? (Date.now() - new Date(latestDate).getTime()) > 2 * 24 * 60 * 60 * 1000 : true;
      
      results.push({
        table,
        count: count || 0,
        latestDate,
        earliestDate,
        isStale,
      });
    }

    // Check manual_monthly
    const { count: manualCount } = await supabase.from("manual_monthly").select("*", { count: "exact", head: true });
    const { count: costCount } = await supabase.from("product_costs").select("*", { count: "exact", head: true });

    return NextResponse.json({
      tables: results,
      manualInputs: manualCount || 0,
      productCosts: costCount || 0,
    });
  } catch (error) {
    console.error("Data status error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
