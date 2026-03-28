import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { appendToSheet, readFromSheet, writeToSheet } from "@/lib/google-sheets";

// GET: Fetch settings (product costs, manual costs)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") || "all";

  try {
    const result: Record<string, any> = {};

    if (type === "all" || type === "product_costs") {
      const { data } = await supabase.from("product_costs").select("*").order("product");
      result.productCosts = data || [];

      // Build product list from product_costs table itself
      result.productList = (data || []).map((c: any) => ({
        product: c.product,
        brand: c.brand,
        category: c.category || "",
        revenue: 0,
        hasCost: c.cost_price > 0 || c.manufacturing_cost > 0,
      })).sort((a: any, b: any) => a.product.localeCompare(b.product));
    }

    if (type === "all" || type === "manual_costs") {
      const { data } = await supabase.from("manual_monthly").select("*").order("month", { ascending: false });
      result.manualCosts = data || [];
    }

    if (type === "all" || type === "misc_costs") {
      // Misc costs stored in manual_monthly with category="misc_cost"
      const { data } = await supabase.from("manual_monthly")
        .select("*")
        .eq("category", "misc_cost")
        .order("month", { ascending: false });
      result.miscCosts = (data || []).map((r: any) => {
        // Parse JSON from `note` field for misc cost details
        try {
          const details = JSON.parse(r.note || "{}");
          return { id: r.id, date: r.month, brand: r.brand, category: details.category || "", description: details.description || r.metric, amount: r.value, note: details.note || "" };
        } catch {
          return { id: r.id, date: r.month, brand: r.brand, category: "", description: r.metric, amount: r.value, note: r.note };
        }
      });
    }

    if (type === "all" || type === "shipping_costs") {
      const { data } = await supabase.from("manual_monthly")
        .select("*")
        .eq("category", "shipping_cost")
        .order("month", { ascending: false });
      result.shippingCosts = (data || []).map((r: any) => {
        try {
          const details = JSON.parse(r.note || "{}");
          return { id: r.id, month: r.month, brand: r.brand, total_cost: r.value, total_orders: details.total_orders || 0, note: details.note || "" };
        } catch {
          return { id: r.id, month: r.month, brand: r.brand, total_cost: r.value, total_orders: 0, note: r.note };
        }
      });
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

    // Force override flag from client
    const forceOverride = body.forceOverride === true;

    if (type === "product_cost") {
      // Check duplicate
      const { data: existing } = await supabase.from("product_costs")
        .select("*").eq("product", data.product).eq("brand", data.brand).limit(1);
      if (existing && existing.length > 0 && !forceOverride) {
        const old = existing[0];
        return NextResponse.json({
          duplicate: true,
          message: `이미 등록된 제품입니다. 원가 ₩${old.cost_price?.toLocaleString()} → ₩${data.cost_price?.toLocaleString()}로 덮어쓰시겠습니까?`,
          existing: old,
        }, { status: 409 });
      }
      const { error } = await supabase.from("product_costs").upsert(data, { onConflict: "product,brand" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "manual_cost") {
      const { error } = await supabase.from("manual_monthly").upsert(data, { onConflict: "month,category" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "misc_cost") {
      // Check duplicate: same date + brand + description
      const { data: existing } = await supabase.from("manual_monthly")
        .select("*").eq("month", data.date).eq("brand", data.brand).eq("category", "misc_cost").eq("metric", data.description).limit(1);
      if (existing && existing.length > 0 && !forceOverride) {
        return NextResponse.json({
          duplicate: true,
          message: `동일한 건별비용이 이미 등록되어 있습니다. (${data.date} / ${data.description} / ₩${existing[0].value?.toLocaleString()}) 덮어쓰시겠습니까?`,
          existing: existing[0],
        }, { status: 409 });
      }
      const row = {
        month: data.date,
        brand: data.brand,
        channel: data.category || "misc",
        category: "misc_cost",
        metric: data.description,
        value: data.amount,
      };
      if (existing && existing.length > 0 && forceOverride) {
        const { error } = await supabase.from("manual_monthly").update(row).eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manual_monthly").insert(row);
        if (error) throw error;
      }
      // 시트 동시 작성: 건별비용 탭에 append
      try {
        const brandLabel: Record<string, string> = { nutty: "너티", ironpet: "아이언펫", saip: "사입", balancelab: "밸런스랩" };
        await appendToSheet("건별비용!A:F", [[
          data.date, brandLabel[data.brand] || data.brand, data.category || "", data.description, data.amount, data.note || "",
        ]]);
      } catch (sheetErr) { console.error("Sheet write error (misc_cost):", sheetErr); }
      return NextResponse.json({ ok: true });
    }

    if (type === "shipping_cost") {
      const { data: existing } = await supabase.from("manual_monthly")
        .select("*").eq("month", data.month).eq("brand", data.brand).eq("category", "shipping_cost").limit(1);
      if (existing && existing.length > 0 && !forceOverride) {
        return NextResponse.json({
          duplicate: true,
          message: `${data.month} / ${data.brand} 배송비가 이미 등록되어 있습니다. (₩${existing[0].value?.toLocaleString()}) 덮어쓰시겠습니까?`,
          existing: existing[0],
        }, { status: 409 });
      }
      const row = {
        month: data.month,
        brand: data.brand,
        channel: "shipping",
        category: "shipping_cost",
        metric: "monthly_shipping",
        value: data.total_cost,
        note: JSON.stringify({ total_orders: data.total_orders, note: data.note }),
      };
      if (existing && existing.length > 0 && forceOverride) {
        const { error } = await supabase.from("manual_monthly").update(row).eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manual_monthly").insert(row);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "cafe24_funnel" || type === "smartstore_funnel" || type === "balancelab_smartstore_funnel") {
      const brandMap: Record<string, string> = { cafe24_funnel: "cafe24", smartstore_funnel: "smartstore", balancelab_smartstore_funnel: "balancelab_smartstore" };
      const row = {
        date: data.date,
        brand: brandMap[type] || "smartstore",
        sessions: Number(data.sessions || 0),
        impressions: Number(data.impressions || 0),
        cart_adds: Number(data.cart_adds || 0),
        signups: Number(data.signups || 0),
        purchases: Number(data.purchases || 0),
        repurchases: Number(data.repurchases || 0),
        subscribers: Number(data.subscribers || 0),
        avg_duration: Number(data.avg_duration || 0),
      };
      const { error } = await supabase.from("daily_funnel").upsert(row, { onConflict: "date,brand" });
      if (error) throw error;

      // 시트 동시 작성: Funnel 탭
      try {
        // Funnel 탭 열 매핑: X=세션수, Y=체류시간, Z=장바구니 (카페24 기준)
        // 날짜 행 찾기
        const dateLabel = `${parseInt(data.date.slice(5, 7))}월 ${parseInt(data.date.slice(8, 10))}일`;
        const funnelData = await readFromSheet("Funnel!A:A");
        if (funnelData.ok && funnelData.values) {
          const rowIdx = funnelData.values.findIndex(r => r[0]?.toString().includes(dateLabel));
          if (rowIdx >= 0) {
            const sheetRow = rowIdx + 1; // 1-indexed
            if (type === "cafe24_funnel") {
              // X=세션, Y=체류시간, Z=장바구니 (col 24, 25, 26)
              await writeToSheet(`Funnel!X${sheetRow}:Z${sheetRow}`, [[
                Number(data.sessions || 0), Number(data.avg_duration || 0), Number(data.cart_adds || 0),
              ]]);
            }
            if (type === "smartstore_funnel") {
              // AI=유입, AJ=체류시간, AK=알림받기, AM=재구매
              await writeToSheet(`Funnel!AI${sheetRow}`, [[Number(data.sessions || 0)]]);
              await writeToSheet(`Funnel!AJ${sheetRow}`, [[Number(data.avg_duration || 0)]]);
              await writeToSheet(`Funnel!AK${sheetRow}`, [[Number(data.subscribers || 0)]]);
              await writeToSheet(`Funnel!AM${sheetRow}`, [[Number(data.repurchases || 0)]]);
            }
            if (type === "balancelab_smartstore_funnel") {
              // 밸런스랩 스마트스토어도 같은 패턴 (필요 시 컬럼 수정)
              await writeToSheet(`Funnel!AI${sheetRow}`, [[Number(data.sessions || 0)]]);
              await writeToSheet(`Funnel!AJ${sheetRow}`, [[Number(data.avg_duration || 0)]]);
              await writeToSheet(`Funnel!AK${sheetRow}`, [[Number(data.subscribers || 0)]]);
              await writeToSheet(`Funnel!AM${sheetRow}`, [[Number(data.repurchases || 0)]]);
            }
          }
        }
      } catch (sheetErr) { console.error("Sheet write error (funnel):", sheetErr); }

      return NextResponse.json({ ok: true, message: `${row.brand} 퍼널 저장 완료 (${data.date})` });
    }

    if (type === "gonggu_target") {
      // 공구 목표: month, seller(metric), target(value), note
      const monthDate = data.month.length === 7 ? data.month + "-01" : data.month;
      const { data: existing } = await supabase.from("manual_monthly")
        .select("id").eq("month", monthDate).eq("brand", "balancelab").eq("category", "gonggu_target").eq("metric", data.seller).limit(1);
      const row = {
        month: monthDate,
        brand: "balancelab",
        channel: "gonggu",
        category: "gonggu_target",
        metric: data.seller,
        value: data.target,
        note: data.note || "",
      };
      if (existing && existing.length > 0) {
        const { error } = await supabase.from("manual_monthly").update(row).eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manual_monthly").insert(row);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (type === "manual_ad_spend") {
      // UPSERT: 중복 체크 없이 자동 덮어쓰기
      const { error } = await supabase.from("daily_ad_spend").upsert(data, { onConflict: "date,brand,channel" });
      if (error) throw error;

      // 시트 동시 작성: Paid 탭 (브랜드별)
      try {
        const paidTabMap: Record<string, string> = {
          nutty: "[N]Paid", ironpet: "[I]Paid", saip: "[사입]Paid",
        };
        const paidTab = paidTabMap[data.brand];
        // 채널→열 매핑 (상세: cost/imp/click/conv)
        // 검색: G=COST, H=imp, J=CLICK | 쇼핑: L=COST, M=imp, O=CLICK
        // 메타: R=COST, S=imp, U=CLICK | GFA: AD=COST, AE=imp, AG=CLICK, AJ=구매
        // Google: AK=COST, AL=imp, AN=CLICK | GDN/P-Max: AS=COST, AT=imp, AV=CLICK
        // 쿠팡: BA=COST (매출=AZ)
        const channelColMap: Record<string, { cost: string; imp?: string; click?: string; conv?: string }> = {
          naver_search:   { cost: "G",  imp: "H",  click: "I" },
          naver_shopping: { cost: "L",  imp: "M",  click: "N" },
          meta:           { cost: "R",  imp: "U",  click: "T" },
          gfa:            { cost: "AD", imp: "AE", click: "AG", conv: "AJ" },
          google_ads:     { cost: "AK", imp: "AL", click: "AN" },
          google_pmax:    { cost: "AS", imp: "AT", click: "AV" },
          coupang_ads:    { cost: "BA" },
        };
        const colMap = channelColMap[data.channel];
        if (paidTab && colMap) {
          const dateLabel = `${parseInt(data.date.slice(5, 7))}월 ${parseInt(data.date.slice(8, 10))}일`;
          const paidData = await readFromSheet(`${paidTab}!A:A`);
          if (paidData.ok && paidData.values) {
            const rowIdx = paidData.values.findIndex(r => r[0]?.toString().includes(dateLabel));
            if (rowIdx >= 0) {
              const sheetRow = rowIdx + 1;
              await writeToSheet(`${paidTab}!${colMap.cost}${sheetRow}`, [[data.spend]]);
              if (data.impressions && colMap.imp) {
                await writeToSheet(`${paidTab}!${colMap.imp}${sheetRow}`, [[data.impressions]]);
              }
              if (data.clicks && colMap.click) {
                await writeToSheet(`${paidTab}!${colMap.click}${sheetRow}`, [[data.clicks]]);
              }
              if (data.conversions && colMap.conv) {
                await writeToSheet(`${paidTab}!${colMap.conv}${sheetRow}`, [[data.conversions]]);
              }
            }
          }
        }
      } catch (sheetErr) { console.error("Sheet write error (ad_spend):", sheetErr); }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
