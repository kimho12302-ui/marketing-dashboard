"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";
import SalesUpload from "@/components/sales-upload";
import CoupangAdsUpload from "@/components/coupang-ads-upload";

interface ProductCost {
  product: string;
  brand: string;
  cost_price: number;
  manufacturing_cost: number;
  shipping_cost: number;
  category: string;
}

interface ManualAdEntry {
  date: string;
  brand: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversion_value: number;
}

const BRANDS = [
  { value: "nutty", label: "너티" },
  { value: "ironpet", label: "아이언펫" },
  { value: "saip", label: "사입" },
  { value: "balancelab", label: "밸런스랩" },
];

const MANUAL_CHANNELS = [
  { value: "coupang_ads", label: "쿠팡 광고" },
  { value: "influencer", label: "인플루언서/체험단" },
  { value: "gfa", label: "네이버 GFA" },
  { value: "smartstore_ads", label: "스마트스토어 광고" },
  { value: "other", label: "기타" },
];

const TABLE_LABELS: Record<string, string> = {
  daily_sales: "일별 매출", daily_ad_spend: "일별 광고비", daily_funnel: "일별 퍼널",
  product_sales: "제품별 매출", keyword_performance: "키워드 성과",
};

function DataStatusCard() {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    fetch("/api/data-status").then(r => r.json()).then(setStatus).catch(() => {});
  }, []);
  if (!status) return null;
  return (
    <Card>
      <CardHeader><CardTitle>📊 데이터 현황</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(status.tables || []).map((t: any) => (
            <div key={t.table} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-zinc-800 last:border-0">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${t.isStale ? "bg-red-400" : "bg-green-400"}`} />
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">{TABLE_LABELS[t.table] || t.table}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-zinc-500">
                <span>{t.count.toLocaleString()}행</span>
                <span>{t.earliestDate?.slice(5)} ~ {t.latestDate?.slice(5)}</span>
                {t.isStale && <span className="text-red-400 font-medium">⚠️ 2일+ 미갱신</span>}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-xs text-gray-500 dark:text-zinc-500">
            <span>제품 원가 등록: <strong className={status.productCosts > 0 ? "text-green-500" : "text-red-400"}>{status.productCosts}건</strong></span>
            <span>수동 입력: <strong>{status.manualInputs}건</strong></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyInputGuide({ onSwitchTab }: { onSwitchTab: (tab: string) => void }) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [dataStatus, setDataStatus] = useState<any>(null);

  useEffect(() => {
    fetch("/api/data-status").then(r => r.json()).then(setDataStatus).catch(() => {});
    // Load today's completion state
    const saved = localStorage.getItem("daily-input-" + new Date().toISOString().slice(0, 10));
    if (saved) setCompletedSteps(new Set(JSON.parse(saved)));
  }, []);

  const toggleStep = (step: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step); else next.add(step);
      localStorage.setItem("daily-input-" + new Date().toISOString().slice(0, 10), JSON.stringify([...next]));
      return next;
    });
  };

  const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const allDone = completedSteps.size >= 5;

  const steps = [
    {
      num: 1, title: "쿠팡 광고비 파일 업로드",
      desc: "쿠팡 광고 관리 → 보고서 다운로드 → 수동 광고비 탭에서 업로드",
      action: "수동 광고비 탭으로 →", tab: "manual_ads",
      auto: false,
    },
    {
      num: 2, title: "GFA 광고비 입력",
      desc: "네이버 GFA 관리 → 어제 비용/노출/클릭 확인 → 수동 광고비 탭에서 입력",
      action: "수동 광고비 탭으로 →", tab: "manual_ads",
      auto: false,
    },
    {
      num: 3, title: "인플루언서/체험단 비용",
      desc: "어제 집행한 인플루언서/체험단/공구 비용이 있으면 입력",
      action: "수동 광고비 탭으로 →", tab: "manual_ads",
      auto: false,
    },
    {
      num: 4, title: "건별 비용 입력",
      desc: "촬영비, 디자인비, 샘플비 등 어제 발생한 기타 비용",
      action: "건별 비용 탭으로 →", tab: "misc_costs",
      auto: false,
    },
    {
      num: 5, title: "대시보드 확인",
      desc: "Overview에서 매출/광고비/ROAS/영업이익 확인",
      action: "대시보드 보기 →", tab: "_overview",
      auto: false,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>📋 일일 데이터 입력 ({today})</CardTitle>
            {allDone && <span className="text-sm text-green-500 font-medium">✅ 오늘 입력 완료!</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
            자동 수집 데이터 외에 매일 수동으로 넣어야 하는 항목입니다. 해당 없으면 체크하고 넘어가세요.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {steps.map(step => {
              const done = completedSteps.has(step.num);
              return (
                <div key={step.num} className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${done ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700"}`}>
                  <button onClick={() => toggleStep(step.num)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 dark:border-zinc-600 hover:border-indigo-400"}`}>
                    {done && <span className="text-xs">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${done ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"}`}>STEP {step.num}</span>
                      <span className={`text-sm font-medium ${done ? "line-through text-gray-400 dark:text-zinc-600" : "text-gray-800 dark:text-zinc-200"}`}>{step.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">{step.desc}</p>
                    {!done && (
                      <button onClick={() => step.tab === "_overview" ? window.location.href = "/" : onSwitchTab(step.tab)}
                        className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                        {step.action}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(completedSteps.size / steps.length) * 100}%` }} />
            </div>
            <span className="text-xs text-gray-500 dark:text-zinc-500 font-medium">{completedSteps.size}/{steps.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* Auto-collected status */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🤖 자동 수집 현황</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            {[
              { name: "Meta 광고비 (너티+아이언펫)", icon: "✅" },
              { name: "네이버 검색/쇼핑 광고", icon: "✅" },
              { name: "쿠팡 광고 (AM/PM 크론)", icon: "✅" },
              { name: "Google Ads (P-Max)", icon: "✅" },
              { name: "GA4 퍼널 데이터", icon: "✅" },
              { name: "Cafe24 매출", icon: dataStatus?.tables?.find((t: any) => t.table === "daily_sales")?.isStale ? "⚠️" : "✅" },
            ].map(item => (
              <div key={item.name} className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span className="text-gray-600 dark:text-zinc-400">{item.name}</span>
                {item.icon === "⚠️" && <span className="text-red-400 text-[10px]">데이터 지연</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TargetsTab() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [brand, setBrand] = useState("all");
  const [targets, setTargets] = useState({
    revenue: 0, roas: 0, orders: 0, cac: 0, convRate: 0,
  });
  const [saving, setSaving] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch(`/api/targets?month=${month}&brand=${brand}`);
      if (res.ok) {
        const data = await res.json();
        if (data.targets) {
          setTargets({
            revenue: data.targets.revenue || 0,
            roas: data.targets.roas || 0,
            orders: data.targets.orders || 0,
            cac: data.targets.cac || 0,
            convRate: data.targets.convRate || 0,
          });
          setLoadMsg("기존 목표 불러옴");
        } else {
          setTargets({ revenue: 0, roas: 0, orders: 0, cac: 0, convRate: 0 });
          setLoadMsg("설정된 목표 없음");
        }
      }
    } catch { setLoadMsg("불러오기 실패"); }
  }, [month, brand]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  const autoFill = async () => {
    setLoadMsg("직전 3개월 데이터 계산 중...");
    try {
      const months: string[] = [];
      const d = new Date(month + "-01");
      for (let i = 1; i <= 3; i++) {
        const prev = new Date(d);
        prev.setMonth(prev.getMonth() - i);
        months.push(prev.toISOString().slice(0, 7));
      }
      let totalRevenue = 0, totalOrders = 0, totalAdSpend = 0, totalConvRate = 0, count = 0;
      for (const m of months) {
        const from = m + "-01";
        const toDate = new Date(from);
        toDate.setMonth(toDate.getMonth() + 1);
        toDate.setDate(toDate.getDate() - 1);
        const to = toDate.toISOString().slice(0, 10);
        const res = await fetch(`/api/dashboard?period=monthly&brand=${brand}&from=${from}&to=${to}`);
        if (res.ok) {
          const data = await res.json();
          if (data.kpi) {
            totalRevenue += data.kpi.revenue || 0;
            totalOrders += data.kpi.orders || 0;
            totalAdSpend += data.kpi.adSpend || 0;
            if (data.funnelSummary?.convRate) totalConvRate += data.funnelSummary.convRate;
            count++;
          }
        }
      }
      if (count > 0) {
        const avgRevenue = totalRevenue / count;
        const avgOrders = totalOrders / count;
        const avgAdSpend = totalAdSpend / count;
        const avgConvRate = totalConvRate / count;
        const avgRoas = avgAdSpend > 0 ? avgRevenue / avgAdSpend : 0;
        const avgCac = avgOrders > 0 ? avgAdSpend / avgOrders : 0;
        setTargets({
          revenue: Math.round(avgRevenue * 1.1),
          roas: Math.round(avgRoas * 1.1 * 100) / 100,
          orders: Math.round(avgOrders * 1.1),
          cac: Math.round(avgCac * 0.9),
          convRate: Math.round(avgConvRate * 1.1 * 100) / 100,
        });
        setLoadMsg(`직전 ${count}개월 평균 × 1.1 적용`);
      } else {
        setLoadMsg("직전 3개월 데이터가 없습니다");
      }
    } catch { setLoadMsg("추천 목표 계산 실패"); }
  };

  const saveTargets = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, brand, targets }),
      });
      if (res.ok) showToast("✅ 목표 저장 완료");
      else showToast("❌ 저장 실패", "error");
    } catch { showToast("❌ 오류 발생", "error"); }
    setSaving(false);
  };

  const inputClass = "bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none w-full";
  const selectClass = inputClass;

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.message}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>🎯 월별 목표 설정</CardTitle>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
            KPI 카드에 목표 대비 진행률이 표시됩니다. 브랜드별 또는 전체로 설정할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">월</label>
              <input type="month" className={inputClass} value={month}
                onChange={e => setMonth(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">브랜드</label>
              <select className={selectClass} value={brand}
                onChange={e => setBrand(e.target.value)}>
                <option value="all">전체</option>
                {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={autoFill}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium text-white transition-colors w-full">
                ✨ 추천 목표 자동채우기
              </button>
            </div>
          </div>
          {loadMsg && <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">{loadMsg}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">목표 매출 (₩)</label>
              <input type="number" className={inputClass} value={targets.revenue || ""}
                onChange={e => setTargets(prev => ({ ...prev, revenue: Number(e.target.value) }))}
                placeholder="3,000,000" />
              {targets.revenue > 0 && <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1">₩{formatCompact(targets.revenue)}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">목표 ROAS</label>
              <input type="number" step="0.1" className={inputClass} value={targets.roas || ""}
                onChange={e => setTargets(prev => ({ ...prev, roas: Number(e.target.value) }))}
                placeholder="2.0" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">목표 주문수 (건)</label>
              <input type="number" className={inputClass} value={targets.orders || ""}
                onChange={e => setTargets(prev => ({ ...prev, orders: Number(e.target.value) }))}
                placeholder="100" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">목표 CAC (₩)</label>
              <input type="number" className={inputClass} value={targets.cac || ""}
                onChange={e => setTargets(prev => ({ ...prev, cac: Number(e.target.value) }))}
                placeholder="30,000" />
              {targets.cac > 0 && <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1">₩{formatCompact(targets.cac)}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">목표 전환율 (%)</label>
              <input type="number" step="0.1" className={inputClass} value={targets.convRate || ""}
                onChange={e => setTargets(prev => ({ ...prev, convRate: Number(e.target.value) }))}
                placeholder="1.5" />
            </div>
          </div>

          <button onClick={saveTargets} disabled={saving}
            className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50">
            {saving ? "저장 중..." : "💾 목표 저장"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"daily" | "targets" | "costs" | "manual_ads" | "misc_costs" | "shipping" | "sales_upload" | "coupang_ads" | "info">("daily");
  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);
  const [productList, setProductList] = useState<{ product: string; brand: string; category: string; revenue: number; hasCost: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Product cost form
  const [costForm, setCostForm] = useState<ProductCost>({
    product: "", brand: "nutty", cost_price: 0, manufacturing_cost: 0, shipping_cost: 0, category: "",
  });

  // Product cost search/filter
  const [costSearch, setCostSearch] = useState("");
  const [costBrandFilter, setCostBrandFilter] = useState("all");
  const [inlineCosts, setInlineCosts] = useState<Record<string, { cost_price: number; manufacturing_cost: number }>>({});
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Product cost CSV upload
  const [costCsvFile, setCostCsvFile] = useState<File | null>(null);
  const [costCsvUploading, setCostCsvUploading] = useState(false);

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadChannel, setUploadChannel] = useState("coupang_ads");
  const [uploadBrand, setUploadBrand] = useState("nutty");
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Shipping cost form
  const [shippingForm, setShippingForm] = useState({
    month: new Date().toISOString().slice(0, 7),
    brand: "all",
    total_cost: 0,
    total_orders: 0,
    note: "",
  });
  const [shippingCosts, setShippingCosts] = useState<any[]>([]);

  // Misc marketing cost form
  const [miscForm, setMiscForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    brand: "nutty",
    category: "influencer",
    description: "",
    amount: 0,
    note: "",
  });
  const [miscCosts, setMiscCosts] = useState<any[]>([]);

  // Manual ad spend form
  const [adForm, setAdForm] = useState<ManualAdEntry>({
    date: new Date().toISOString().slice(0, 10),
    brand: "nutty", channel: "coupang_ads",
    spend: 0, impressions: 0, clicks: 0, conversion_value: 0,
  });

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?type=product_costs");
      if (res.ok) {
        const data = await res.json();
        setProductCosts(data.productCosts || []);
        setProductList(data.productList || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchShippingCosts = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?type=shipping_costs");
      if (res.ok) {
        const data = await res.json();
        setShippingCosts(data.shippingCosts || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchMiscCosts = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?type=misc_costs");
      if (res.ok) {
        const data = await res.json();
        setMiscCosts(data.miscCosts || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCosts(); fetchMiscCosts(); fetchShippingCosts(); }, [fetchCosts, fetchMiscCosts, fetchShippingCosts]);

  const postWithDupCheck = async (type: string, data: any): Promise<boolean> => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
    });
    if (res.status === 409) {
      const dupData = await res.json();
      if (window.confirm(`⚠️ 중복 데이터 발견\n\n${dupData.message}`)) {
        const res2 = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, data, forceOverride: true }),
        });
        return res2.ok;
      }
      return false;
    }
    return res.ok;
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const saveInlineCost = async (p: { product: string; brand: string; category: string }) => {
    const costs = inlineCosts[p.product];
    if (!costs || (costs.cost_price <= 0 && costs.manufacturing_cost <= 0)) { showToast("원가를 입력하세요", "error"); return; }
    setSavingProduct(p.product);
    try {
      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "product_cost", data: { product: p.product, brand: p.brand, cost_price: costs.cost_price, manufacturing_cost: costs.manufacturing_cost, shipping_cost: 0, category: p.category }, forceOverride: true }),
      });
      if (res.ok) {
        showToast(`✅ ${p.product} 저장 완료`);
        setInlineCosts(prev => { const next = { ...prev }; delete next[p.product]; return next; });
        fetchCosts();
      } else { showToast("❌ 저장 실패", "error"); }
    } catch { showToast("❌ 오류 발생", "error"); }
    setSavingProduct(null);
  };

  const saveCost = async () => {
    if (!costForm.product) { showToast("제품명을 입력하세요", "error"); return; }
    setLoading(true);
    try {
      const ok = await postWithDupCheck("product_cost", costForm);
      if (ok) {
        showToast(`✅ ${costForm.product} 저장 완료`);
        setCostForm({ product: "", brand: "nutty", cost_price: 0, manufacturing_cost: 0, shipping_cost: 0, category: "" });
        fetchCosts();
      } else {
        showToast("취소됨", "error");
      }
    } catch { showToast("❌ 오류 발생", "error"); }
    setLoading(false);
  };

  const uploadCostCsv = async () => {
    if (!costCsvFile) { setMessage("CSV 파일을 선택하세요"); return; }
    setCostCsvUploading(true);
    try {
      const text = await costCsvFile.text();
      const lines = text.split("\n").map(l => l.trim()).filter(l => l);
      if (lines.length < 2) { setMessage("❌ CSV에 데이터가 없습니다"); setCostCsvUploading(false); return; }
      const header = lines[0].split(",").map(h => h.trim().toLowerCase());
      const productIdx = header.findIndex(h => h.includes("제품") || h.includes("product"));
      const brandIdx = header.findIndex(h => h.includes("브랜드") || h.includes("brand"));
      const costIdx = header.findIndex(h => h.includes("판매원가") || h.includes("cost_price") || h.includes("원가"));
      const mfgIdx = header.findIndex(h => h.includes("제작") || h.includes("manufacturing"));
      const shipIdx = header.findIndex(h => h.includes("배송") || h.includes("shipping"));
      const catIdx = header.findIndex(h => h.includes("카테고리") || h.includes("category"));
      if (productIdx < 0) { setMessage("❌ '제품' 컬럼을 찾을 수 없습니다"); setCostCsvUploading(false); return; }
      let success = 0, fail = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim());
        const product = cols[productIdx];
        if (!product) continue;
        const data = {
          product,
          brand: brandIdx >= 0 ? cols[brandIdx] : "nutty",
          cost_price: costIdx >= 0 ? Number(cols[costIdx]) || 0 : 0,
          manufacturing_cost: mfgIdx >= 0 ? Number(cols[mfgIdx]) || 0 : 0,
          shipping_cost: shipIdx >= 0 ? Number(cols[shipIdx]) || 0 : 0,
          category: catIdx >= 0 ? cols[catIdx] : "",
        };
        try {
          const res = await fetch("/api/settings", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "product_cost", data, forceOverride: true }),
          });
          if (res.ok) success++; else fail++;
        } catch { fail++; }
      }
      setMessage(`✅ CSV 업로드: ${success}건 성공, ${fail}건 실패`);
      setCostCsvFile(null);
      fetchCosts();
    } catch { setMessage("❌ CSV 파싱 오류"); }
    setCostCsvUploading(false);
  };

  const saveShipping = async () => {
    if (shippingForm.total_cost <= 0) { setMessage("배송비를 입력하세요"); return; }
    setLoading(true);
    try {
      const ok = await postWithDupCheck("shipping_cost", shippingForm);
      if (ok) {
        setMessage("✅ 배송비 저장 완료");
        setShippingForm(prev => ({ ...prev, total_cost: 0, total_orders: 0, note: "" }));
        fetchShippingCosts();
      } else {
        setMessage("취소됨");
      }
    } catch { setMessage("❌ 오류 발생"); }
    setLoading(false);
  };

  const saveMiscCost = async () => {
    if (!miscForm.description || miscForm.amount <= 0) { setMessage("항목명과 금액을 입력하세요"); return; }
    setLoading(true);
    try {
      const ok = await postWithDupCheck("misc_cost", miscForm);
      if (ok) {
        setMessage("✅ 건별비용 저장 완료");
        setMiscForm(prev => ({ ...prev, description: "", amount: 0, note: "" }));
        fetchMiscCosts();
      } else {
        setMessage("취소됨");
      }
    } catch { setMessage("❌ 오류 발생"); }
    setLoading(false);
  };

  const saveAdSpend = async () => {
    if (!adForm.date || adForm.spend <= 0) { setMessage("날짜와 광고비를 입력하세요"); return; }
    setLoading(true);
    try {
      const ok = await postWithDupCheck("manual_ad_spend", adForm);
      if (ok) {
        setMessage("✅ 광고비 저장 완료");
        setAdForm(prev => ({ ...prev, spend: 0, impressions: 0, clicks: 0, conversion_value: 0 }));
      } else {
        setMessage("취소됨");
      }
    } catch { setMessage("❌ 오류 발생"); }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadFile) { setMessage("파일을 선택하세요"); return; }
    setLoading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("channel", uploadChannel);
      formData.append("brand", uploadBrand);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ ${data.message}`);
        setUploadResult(data.summary);
        setUploadFile(null);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch { setMessage("❌ 업로드 오류"); }
    setLoading(false);
  };

  const inputClass = "bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none w-full";
  const selectClass = "bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none w-full";

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${toast.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.message}
        </div>
      )}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="⚙️ 설정" subtitle="원가 관리 & 수동 데이터 입력" />

        {/* Tab Navigation */}
        <div className="flex gap-2">
          {[
            { key: "daily" as const, label: "📋 일일 입력" },
            { key: "targets" as const, label: "🎯 목표 설정" },
            { key: "costs" as const, label: "💰 제품 원가" },
            { key: "manual_ads" as const, label: "📢 수동 광고비" },
            { key: "misc_costs" as const, label: "🧾 건별 비용" },
            { key: "shipping" as const, label: "📦 배송비" },
            { key: "sales_upload" as const, label: "📤 판매 업로드" },
            { key: "coupang_ads" as const, label: "🟠 쿠팡 광고" },
            { key: "info" as const, label: "ℹ️ 데이터 소스" },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab.key
                  ? "bg-indigo-600/20 text-indigo-400 font-medium"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {message && (
          <div className={`text-sm px-4 py-2 rounded-lg ${message.startsWith("✅") ? "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"}`}>
            {message}
          </div>
        )}

        {/* Daily Input Guide Tab */}
        {activeTab === "daily" && (
          <DailyInputGuide onSwitchTab={(tab: any) => setActiveTab(tab)} />
        )}

        {/* Targets Tab */}
        {activeTab === "targets" && <TargetsTab />}

        {/* Product Costs Tab */}
        {activeTab === "costs" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>제품 원가 등록</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="lg:col-span-2">
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">제품 선택</label>
                    <select className={selectClass} value={costForm.product}
                      onChange={e => {
                        const prod = productList.find(p => p.product === e.target.value);
                        setCostForm(prev => ({
                          ...prev,
                          product: e.target.value,
                          brand: prod?.brand || prev.brand,
                          category: prod?.category || prev.category,
                        }));
                      }}>
                      <option value="">-- 제품 선택 --</option>
                      {productList.map(p => (
                        <option key={p.product} value={p.product}>
                          {p.hasCost ? "✅" : "⚠️"} [{BRANDS.find(b => b.value === p.brand)?.label || p.brand}] {p.product} (₩{formatCompact(p.revenue)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">판매원가 (₩)</label>
                    <input type="number" className={inputClass} value={costForm.cost_price || ""}
                      onChange={e => setCostForm(prev => ({ ...prev, cost_price: Number(e.target.value) }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">제작원가 (₩)</label>
                    <input type="number" className={inputClass} value={costForm.manufacturing_cost || ""}
                      onChange={e => setCostForm(prev => ({ ...prev, manufacturing_cost: Number(e.target.value) }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">배송비 (₩)</label>
                    <input type="number" className={inputClass} value={costForm.shipping_cost || ""}
                      onChange={e => setCostForm(prev => ({ ...prev, shipping_cost: Number(e.target.value) }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">카테고리</label>
                    <input className={inputClass} value={costForm.category}
                      onChange={e => setCostForm(prev => ({ ...prev, category: e.target.value }))}
                      placeholder="간식" />
                  </div>
                </div>
                <button onClick={saveCost} disabled={loading}
                  className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {loading ? "저장 중..." : "저장"}
                </button>
              </CardContent>
            </Card>

            {/* Missing Costs Warning */}
            {productList.filter(p => !p.hasCost).length > 0 && (
              <Card className="border-yellow-500/30">
                <CardHeader>
                  <CardTitle>⚠️ 원가 미등록 제품 ({productList.filter(p => !p.hasCost).length}건)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 dark:text-zinc-500 mb-3">매출이 있지만 원가가 등록되지 않은 제품입니다. 원가를 등록하면 정확한 영업이익을 계산할 수 있습니다.</p>

                  {/* CSV 일괄 업로드 */}
                  <div className="flex items-center gap-2 mb-3 p-2 rounded bg-gray-50 dark:bg-zinc-800/50">
                    <span className="text-xs text-gray-500 dark:text-zinc-400">📄 CSV 일괄:</span>
                    <input type="file" accept=".csv" className="text-xs flex-1" onChange={(e) => setCostCsvFile(e.target.files?.[0] || null)} />
                    <button onClick={uploadCostCsv} disabled={!costCsvFile || costCsvUploading}
                      className="px-2 py-1 text-xs bg-indigo-600 text-white rounded disabled:opacity-50">
                      {costCsvUploading ? "업로드 중..." : "업로드"}
                    </button>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500">형식: 제품,브랜드,판매원가,제작원가,배송비,카테고리</span>
                  </div>

                  {/* 검색 + 브랜드 필터 */}
                  <div className="flex items-center gap-2 mb-3">
                    <input type="text" placeholder="제품명 검색..." value={costSearch} onChange={(e) => setCostSearch(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border rounded bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700" />
                    <select value={costBrandFilter} onChange={(e) => setCostBrandFilter(e.target.value)}
                      className="px-2 py-1 text-sm border rounded bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                      <option value="all">전체 브랜드</option>
                      {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>

                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-zinc-400">제품</th>
                          <th className="text-left py-2 px-2 text-zinc-400">브랜드</th>
                          <th className="text-right py-2 px-2 text-zinc-400">매출</th>
                          <th className="text-right py-2 px-2 text-zinc-400">판매원가</th>
                          <th className="text-right py-2 px-2 text-zinc-400">제작원가</th>
                          <th className="text-center py-2 px-2 text-zinc-400"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {productList.filter(p => !p.hasCost).filter(p => {
                          const matchSearch = !costSearch || p.product.toLowerCase().includes(costSearch.toLowerCase());
                          const matchBrand = costBrandFilter === "all" || p.brand === costBrandFilter;
                          return matchSearch && matchBrand;
                        }).map((p) => (
                          <tr key={p.product} className="border-b border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                            <td className="py-1.5 px-2 text-yellow-500 dark:text-yellow-400 text-xs">{p.product}</td>
                            <td className="py-1.5 px-2 text-xs">{BRANDS.find(b => b.value === p.brand)?.label || p.brand}</td>
                            <td className="py-1.5 px-2 text-right text-xs">₩{formatCompact(p.revenue)}</td>
                            <td className="py-1.5 px-1">
                              <input type="number" placeholder="0" className="w-20 px-1 py-0.5 text-xs text-right border rounded bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                                value={inlineCosts[p.product]?.cost_price || ""}
                                onChange={(e) => setInlineCosts(prev => ({ ...prev, [p.product]: { ...prev[p.product] || { cost_price: 0, manufacturing_cost: 0 }, cost_price: Number(e.target.value) } }))} />
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" placeholder="0" className="w-20 px-1 py-0.5 text-xs text-right border rounded bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                                value={inlineCosts[p.product]?.manufacturing_cost || ""}
                                onChange={(e) => setInlineCosts(prev => ({ ...prev, [p.product]: { ...prev[p.product] || { cost_price: 0, manufacturing_cost: 0 }, manufacturing_cost: Number(e.target.value) } }))} />
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <button onClick={() => saveInlineCost(p)} disabled={savingProduct === p.product}
                                className="px-2 py-0.5 text-[10px] bg-indigo-600 text-white rounded disabled:opacity-50 hover:bg-indigo-700">
                                {savingProduct === p.product ? "..." : "저장"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-2">💡 행을 클릭하면 위 폼에 자동으로 채워집니다</p>
                </CardContent>
              </Card>
            )}

            {/* Existing Costs */}
            <Card>
              <CardHeader><CardTitle>등록된 제품 원가 ({productCosts.length}건)</CardTitle></CardHeader>
              <CardContent>
                {productCosts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-500">등록된 원가 데이터가 없습니다. 위에서 제품별 원가를 입력하세요.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-zinc-400">제품</th>
                          <th className="text-left py-2 px-2 text-zinc-400">브랜드</th>
                          <th className="text-right py-2 px-2 text-zinc-400">판매원가</th>
                          <th className="text-right py-2 px-2 text-zinc-400">제작원가</th>
                          <th className="text-right py-2 px-2 text-zinc-400">배송비</th>
                          <th className="text-left py-2 px-2 text-zinc-400">카테고리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productCosts.map((p: any, i: number) => (
                          <tr key={i} className="border-b border-gray-200 dark:border-zinc-800">
                            <td className="py-2 px-2">{p.product}</td>
                            <td className="py-2 px-2">{BRANDS.find(b => b.value === p.brand)?.label || p.brand}</td>
                            <td className="py-2 px-2 text-right">₩{formatCompact(p.cost_price)}</td>
                            <td className="py-2 px-2 text-right">₩{formatCompact(p.manufacturing_cost || 0)}</td>
                            <td className="py-2 px-2 text-right">₩{formatCompact(p.shipping_cost)}</td>
                            <td className="py-2 px-2">{p.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Manual Ad Spend Tab */}
        {activeTab === "manual_ads" && (
          <div className="space-y-6">
          {/* CSV Upload */}
          <Card>
            <CardHeader><CardTitle>📁 CSV 파일 업로드</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4">쿠팡 광고 등 CSV/XLSX 파일을 업로드하면 자동으로 파싱해서 DB에 저장합니다. (날짜, 광고비, 노출, 클릭, 전환매출 컬럼 자동 감지)</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">파일 (.csv, .xlsx)</label>
                  <input type="file" accept=".csv,.xlsx,.xls" className="text-sm text-gray-500 dark:text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-200 dark:file:bg-zinc-700 file:text-gray-700 dark:file:text-zinc-200 file:cursor-pointer hover:file:bg-gray-300 dark:hover:file:bg-zinc-600"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">채널</label>
                  <select className={selectClass} value={uploadChannel}
                    onChange={e => setUploadChannel(e.target.value)}>
                    {MANUAL_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">브랜드</label>
                  <select className={selectClass} value={uploadBrand}
                    onChange={e => setUploadBrand(e.target.value)}>
                    {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <button onClick={handleUpload} disabled={loading || !uploadFile}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {loading ? "업로드 중..." : "업로드"}
                </button>
              </div>
              {uploadResult && (
                <div className="mt-4 bg-gray-100 dark:bg-zinc-800/50 rounded-lg p-4 text-sm">
                  <p className="text-green-400 font-medium">{uploadResult.rows}건 저장 완료</p>
                  <p className="text-zinc-400 mt-1">기간: {uploadResult.dateRange}</p>
                  <p className="text-zinc-400">총 광고비: ₩{formatCompact(uploadResult.totalSpend)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Single Entry */}
          <Card>
            <CardHeader><CardTitle>✍️ 수동 광고비 입력</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4">API로 자동 수집이 안 되는 광고비를 수동으로 입력합니다. (쿠팡 광고, 인플루언서, GFA 등)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">날짜</label>
                  <input type="date" className={inputClass} value={adForm.date}
                    onChange={e => setAdForm(prev => ({ ...prev, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">브랜드</label>
                  <select className={selectClass} value={adForm.brand}
                    onChange={e => setAdForm(prev => ({ ...prev, brand: e.target.value }))}>
                    {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">채널</label>
                  <select className={selectClass} value={adForm.channel}
                    onChange={e => setAdForm(prev => ({ ...prev, channel: e.target.value }))}>
                    {MANUAL_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">광고비 (₩)</label>
                  <input type="number" className={inputClass} value={adForm.spend || ""}
                    onChange={e => setAdForm(prev => ({ ...prev, spend: Number(e.target.value) }))}
                    placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">노출수 (선택)</label>
                  <input type="number" className={inputClass} value={adForm.impressions || ""}
                    onChange={e => setAdForm(prev => ({ ...prev, impressions: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">클릭수 (선택)</label>
                  <input type="number" className={inputClass} value={adForm.clicks || ""}
                    onChange={e => setAdForm(prev => ({ ...prev, clicks: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">전환매출 (선택)</label>
                  <input type="number" className={inputClass} value={adForm.conversion_value || ""}
                    onChange={e => setAdForm(prev => ({ ...prev, conversion_value: Number(e.target.value) }))} />
                </div>
              </div>
              <button onClick={saveAdSpend} disabled={loading}
                className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? "저장 중..." : "저장"}
              </button>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Misc Marketing Costs Tab */}
        {activeTab === "misc_costs" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>🧾 건별 마케팅 비용 입력</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4">인플루언서, 체험단, 공구, 촬영비, 디자인비 등 비정기적으로 발생하는 마케팅 비용을 기록합니다.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">날짜</label>
                    <input type="date" className={inputClass} value={miscForm.date}
                      onChange={e => setMiscForm(prev => ({ ...prev, date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">브랜드</label>
                    <select className={selectClass} value={miscForm.brand}
                      onChange={e => setMiscForm(prev => ({ ...prev, brand: e.target.value }))}>
                      {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">카테고리</label>
                    <select className={selectClass} value={miscForm.category}
                      onChange={e => setMiscForm(prev => ({ ...prev, category: e.target.value }))}>
                      <option value="influencer">인플루언서</option>
                      <option value="experience">체험단</option>
                      <option value="group_buy">공구</option>
                      <option value="photo_video">촬영/영상</option>
                      <option value="design">디자인</option>
                      <option value="sample">샘플/제품 제공</option>
                      <option value="event">이벤트/프로모션</option>
                      <option value="platform_fee">플랫폼 수수료</option>
                      <option value="logistics">물류/배송</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">항목명</label>
                    <input className={inputClass} value={miscForm.description}
                      onChange={e => setMiscForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="예: 인플루언서 A 협찬" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">금액 (₩)</label>
                    <input type="number" className={inputClass} value={miscForm.amount || ""}
                      onChange={e => setMiscForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">메모 (선택)</label>
                    <input className={inputClass} value={miscForm.note}
                      onChange={e => setMiscForm(prev => ({ ...prev, note: e.target.value }))}
                      placeholder="추가 메모" />
                  </div>
                </div>
                <button onClick={saveMiscCost} disabled={loading}
                  className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50">
                  {loading ? "저장 중..." : "저장"}
                </button>
              </CardContent>
            </Card>

            {/* Existing misc costs */}
            <Card>
              <CardHeader><CardTitle>등록된 건별 비용 ({miscCosts.length}건)</CardTitle></CardHeader>
              <CardContent>
                {miscCosts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-500">등록된 건별 비용이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">날짜</th>
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">브랜드</th>
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">카테고리</th>
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">항목</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">금액</th>
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">메모</th>
                        </tr>
                      </thead>
                      <tbody>
                        {miscCosts.map((c: any, i: number) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-zinc-800">
                            <td className="py-2 px-2">{c.date}</td>
                            <td className="py-2 px-2">{BRANDS.find(b => b.value === c.brand)?.label || c.brand}</td>
                            <td className="py-2 px-2">{c.category}</td>
                            <td className="py-2 px-2">{c.description}</td>
                            <td className="py-2 px-2 text-right font-medium">₩{formatCompact(c.amount)}</td>
                            <td className="py-2 px-2 text-gray-400 dark:text-zinc-500">{c.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Shipping Costs Tab */}
        {activeTab === "shipping" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>📦 월별 배송비 입력</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4">택배사 청구 기준 월별 배송비와 출고 건수를 기록합니다.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">월</label>
                    <input type="month" className={inputClass} value={shippingForm.month}
                      onChange={e => setShippingForm(prev => ({ ...prev, month: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">브랜드</label>
                    <select className={selectClass} value={shippingForm.brand}
                      onChange={e => setShippingForm(prev => ({ ...prev, brand: e.target.value }))}>
                      <option value="all">전체</option>
                      {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">총 배송비 (₩)</label>
                    <input type="number" className={inputClass} value={shippingForm.total_cost || ""}
                      onChange={e => setShippingForm(prev => ({ ...prev, total_cost: Number(e.target.value) }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">출고 건수</label>
                    <input type="number" className={inputClass} value={shippingForm.total_orders || ""}
                      onChange={e => setShippingForm(prev => ({ ...prev, total_orders: Number(e.target.value) }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">메모 (선택)</label>
                    <input className={inputClass} value={shippingForm.note}
                      onChange={e => setShippingForm(prev => ({ ...prev, note: e.target.value }))}
                      placeholder="CJ대한통운, 한진 등" />
                  </div>
                </div>
                <button onClick={saveShipping} disabled={loading}
                  className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50">
                  {loading ? "저장 중..." : "저장"}
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>등록된 배송비 ({shippingCosts.length}건)</CardTitle></CardHeader>
              <CardContent>
                {shippingCosts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-zinc-500">등록된 배송비 데이터가 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">월</th>
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">브랜드</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">배송비</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">건수</th>
                          <th className="text-right py-2 px-2 text-gray-500 dark:text-zinc-400">건당 배송비</th>
                          <th className="text-left py-2 px-2 text-gray-500 dark:text-zinc-400">메모</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shippingCosts.map((s: any, i: number) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-zinc-800">
                            <td className="py-2 px-2">{s.month}</td>
                            <td className="py-2 px-2">{s.brand === "all" ? "전체" : BRANDS.find(b => b.value === s.brand)?.label || s.brand}</td>
                            <td className="py-2 px-2 text-right font-medium">₩{formatCompact(s.total_cost)}</td>
                            <td className="py-2 px-2 text-right">{s.total_orders?.toLocaleString() || 0}건</td>
                            <td className="py-2 px-2 text-right text-gray-400">₩{s.total_orders > 0 ? formatCompact(s.total_cost / s.total_orders) : "-"}</td>
                            <td className="py-2 px-2 text-gray-400 dark:text-zinc-500">{s.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Sales Upload Tab */}
        {activeTab === "sales_upload" && <SalesUpload />}

        {/* Coupang Ads Upload Tab */}
        {activeTab === "coupang_ads" && <CoupangAdsUpload />}

        {/* Data Source Info Tab */}
        {activeTab === "info" && (
          <div className="space-y-4">
            <DataStatusCard />
            <Card>
              <CardHeader><CardTitle>🔄 자동 수집 데이터</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {[
                    { name: "Meta Ads (너티+아이언펫)", status: "✅", desc: "일별 크론, 광고비/ROAS/노출/클릭" },
                    { name: "Naver 검색광고", status: "✅", desc: "일별 크론, 캠페인+키워드 성과" },
                    { name: "Google Ads (P-Max)", status: "✅", desc: "GA4 시트 경유" },
                    { name: "GA4 퍼널", status: "✅", desc: "page_view/add_to_cart/purchase" },
                    { name: "Cafe24 매출", status: "✅", desc: "API 직접, 주문/제품/매출" },
                    { name: "통계시트 Funnel", status: "✅", desc: "카페24+스마트스토어+쿠팡 퍼널" },
                  ].map(item => (
                    <div key={item.name} className="flex items-center gap-3">
                      <span>{item.status}</span>
                      <span className="font-medium text-gray-800 dark:text-zinc-200 w-48">{item.name}</span>
                      <span className="text-gray-500 dark:text-zinc-500">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>✍️ 수동 입력 필요</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {[
                    { name: "쿠팡 광고비", status: "⚠️", desc: "API 없음 → 수동 광고비 탭에서 입력" },
                    { name: "인플루언서/체험단 비용", status: "⚠️", desc: "수동 광고비 탭에서 입력" },
                    { name: "네이버 GFA", status: "⚠️", desc: "API 제한 → 수동 입력" },
                    { name: "제품 원가", status: "⚠️", desc: "제품 원가 탭에서 입력 → 영업이익 계산" },
                    { name: "스마트스토어 매출", status: "⚠️", desc: "통합매니저 계정 필요" },
                  ].map(item => (
                    <div key={item.name} className="flex items-center gap-3">
                      <span>{item.status}</span>
                      <span className="font-medium text-gray-800 dark:text-zinc-200 w-48">{item.name}</span>
                      <span className="text-gray-500 dark:text-zinc-500">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
