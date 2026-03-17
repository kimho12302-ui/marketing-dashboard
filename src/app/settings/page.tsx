"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils";

interface ProductCost {
  product: string;
  brand: string;
  cost_price: number;
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"costs" | "manual_ads" | "misc_costs" | "info">("costs");
  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);
  const [productList, setProductList] = useState<{ product: string; brand: string; category: string; revenue: number; hasCost: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Product cost form
  const [costForm, setCostForm] = useState<ProductCost>({
    product: "", brand: "nutty", cost_price: 0, shipping_cost: 0, category: "",
  });

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadChannel, setUploadChannel] = useState("coupang_ads");
  const [uploadBrand, setUploadBrand] = useState("nutty");
  const [uploadResult, setUploadResult] = useState<any>(null);

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

  const fetchMiscCosts = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?type=misc_costs");
      if (res.ok) {
        const data = await res.json();
        setMiscCosts(data.miscCosts || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCosts(); fetchMiscCosts(); }, [fetchCosts, fetchMiscCosts]);

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

  const saveCost = async () => {
    if (!costForm.product) { setMessage("제품명을 입력하세요"); return; }
    setLoading(true);
    try {
      const ok = await postWithDupCheck("product_cost", costForm);
      if (ok) {
        setMessage("✅ 저장 완료");
        setCostForm({ product: "", brand: "nutty", cost_price: 0, shipping_cost: 0, category: "" });
        fetchCosts();
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
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="⚙️ 설정" subtitle="원가 관리 & 수동 데이터 입력" />

        {/* Tab Navigation */}
        <div className="flex gap-2">
          {[
            { key: "costs" as const, label: "💰 제품 원가" },
            { key: "manual_ads" as const, label: "📢 수동 광고비" },
            { key: "misc_costs" as const, label: "🧾 건별 비용" },
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
                    <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">원가 (₩)</label>
                    <input type="number" className={inputClass} value={costForm.cost_price || ""}
                      onChange={e => setCostForm(prev => ({ ...prev, cost_price: Number(e.target.value) }))}
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left py-2 px-2 text-zinc-400">제품</th>
                          <th className="text-left py-2 px-2 text-zinc-400">브랜드</th>
                          <th className="text-left py-2 px-2 text-zinc-400">카테고리</th>
                          <th className="text-right py-2 px-2 text-zinc-400">누적 매출</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productList.filter(p => !p.hasCost).map((p) => (
                          <tr key={p.product} className="border-b border-gray-200 dark:border-zinc-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/50"
                            onClick={() => setCostForm({ product: p.product, brand: p.brand, cost_price: 0, shipping_cost: 0, category: p.category })}>
                            <td className="py-2 px-2 text-yellow-400">{p.product}</td>
                            <td className="py-2 px-2">{BRANDS.find(b => b.value === p.brand)?.label || p.brand}</td>
                            <td className="py-2 px-2">{p.category}</td>
                            <td className="py-2 px-2 text-right">₩{formatCompact(p.revenue)}</td>
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
                          <th className="text-right py-2 px-2 text-zinc-400">원가</th>
                          <th className="text-right py-2 px-2 text-zinc-400">배송비</th>
                          <th className="text-left py-2 px-2 text-zinc-400">카테고리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productCosts.map((p, i) => (
                          <tr key={i} className="border-b border-gray-200 dark:border-zinc-800">
                            <td className="py-2 px-2">{p.product}</td>
                            <td className="py-2 px-2">{BRANDS.find(b => b.value === p.brand)?.label || p.brand}</td>
                            <td className="py-2 px-2 text-right">₩{formatCompact(p.cost_price)}</td>
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

        {/* Data Source Info Tab */}
        {activeTab === "info" && (
          <div className="space-y-4">
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
