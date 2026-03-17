import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: Fetch settings (product costs, manual costs)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") || "all";

  try {
    const result: Record<string, any> = {};

    if (type === "all" || type === "product_costs") {
      const { data } = await supabase.from("product_costs").select("*").order("product");
      result.productCosts = data || [];

      // Get product list from product_sales for reference
      const { data: prodData } = await supabase.from("product_sales").select("product,brand,category,revenue");
      const prodMap = new Map<string, { brand: string; category: string; revenue: number }>();
      for (const r of prodData || []) {
        const existing = prodMap.get(r.product);
        if (existing) {
          existing.revenue += Number(r.revenue);
        } else {
          prodMap.set(r.product, { brand: r.brand, category: r.category, revenue: Number(r.revenue) });
        }
      }
      const costSet = new Set((data || []).map((c: any) => c.product));
      result.productList = Array.from(prodMap.entries())
        .map(([product, d]) => ({ product, ...d, hasCost: costSet.has(product) }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    if (type === "all" || type === "manual_costs") {
      const { data } = await supabase.from("manual_monthly").select("*").order("month", { ascending: false });
      result.manualCosts = data || [];
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST: Upsert settings data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (type === "product_cost") {
      // Upsert a single product cost
      const { error } = await supabase.from("product_costs").upsert(data, { onConflict: "product,brand" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "manual_cost") {
      // Upsert manual monthly cost
      const { error } = await supabase.from("manual_monthly").upsert(data, { onConflict: "month,category" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "manual_ad_spend") {
      // Upsert manual daily ad spend (e.g. coupang, influencer)
      const { error } = await supabase.from("daily_ad_spend").upsert(data, { onConflict: "date,brand,channel" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
