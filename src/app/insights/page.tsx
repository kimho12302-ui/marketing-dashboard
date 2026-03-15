"use client";

import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle, TrendingUp, Target, Search, Lightbulb, CheckCircle,
  AlertCircle, ArrowRight, Zap, ShoppingBag,
} from "lucide-react";

// ============================================================
// Insight data organized by severity
// ============================================================

interface InsightItem {
  icon: typeof AlertTriangle;
  text: string;
  detail?: string;
}

const CRITICAL_INSIGHTS: InsightItem[] = [
  {
    icon: AlertTriangle,
    text: "⚠️ 아이언펫 CAC ₩42,000 → LTV:CAC 1.8 (목표 3.0 미달)",
    detail: "아이언펫 고객 획득 비용이 LTV 대비 과도합니다. 광고 타겟팅 재검토 또는 LTV 향상 전략 필요",
  },
  {
    icon: TrendingUp,
    text: "📉 네이버 쇼핑광고 ROAS 3주 연속 하락 (320% → 280% → 245%)",
    detail: "경쟁 심화 or 크리에이티브 피로도. 상품 이미지/타이틀 교체 및 입찰가 조정 필요",
  },
];

const WARNING_INSIGHTS: InsightItem[] = [
  {
    icon: AlertCircle,
    text: "⚠️ 장바구니 이탈률 45% — 결제 페이지 UX 점검 필요",
    detail: "간편결제 옵션 추가, 배송비 사전 표시, 결제 단계 간소화 검토",
  },
  {
    icon: ShoppingBag,
    text: "📊 쿠팡 매출 비중 28% → 자사몰 전환 전략 필요",
    detail: "쿠팡 의존도 감소를 위해 카페24 자사몰 전용 혜택/쿠폰 운영 권장",
  },
];

const OPPORTUNITY_INSIGHTS: InsightItem[] = [
  {
    icon: Zap,
    text: "🟢 메타 '사운드 냠단호박' CTR 2.1% — 예산 증액 추천",
    detail: "업종 평균 CTR 1.0% 대비 2배 이상. 일예산 50% 증액 시 ROAS 유지 가능 예상",
  },
  {
    icon: Search,
    text: "💡 '강아지간식추천' CPC ₩120, CTR 4.2% — 키워드 집중 추천",
    detail: "저비용 고효율 키워드. 네이버 검색 예산 재배분하여 이 키워드군 집중",
  },
  {
    icon: TrendingUp,
    text: "📈 너티 재구매율 18% → 리텐션 캠페인으로 25% 목표",
    detail: "첫 구매 후 14일차 알림톡 + 재구매 쿠폰 자동 발송 세팅 권장",
  },
];

const BRAND_INSIGHTS = {
  nutty: {
    name: "🥜 너티",
    color: "border-orange-500/30",
    insights: [
      "사운드 시리즈 전체 매출의 45% — 히어로 상품 집중 마케팅",
      "하루루틴 재구매율 32% — 구독 모델 검토 시점",
      "카페24 > 스마트스토어 매출 비중이 점차 확대 중 (35% → 40%)",
    ],
  },
  ironpet: {
    name: "🐾 아이언펫",
    color: "border-blue-500/30",
    insights: [
      "영양분석 키트 AOV ₩69,000 — 검사+영양제 번들 전략 권장",
      "반려견 키트가 반려묘 대비 3배 매출 — 반려묘 마케팅 강화 필요",
      "에이블리 채널 매출 비중 2% — 효율 낮으면 채널 정리 고려",
    ],
  },
};

const ACTION_ITEMS = [
  { icon: Target, text: "Meta 광고 ROAS 2.1x → 3.0x 목표로 크리에이티브 A/B 테스트 진행", priority: "high" as const },
  { icon: TrendingUp, text: "너티 사운드 냠단호박 스마트스토어 매출 +23% — 카페24에도 동일 프로모션 적용", priority: "medium" as const },
  { icon: Search, text: "'강아지 건강간식' 키워드 CTR 5.2% but 예산 적음 — 네이버 검색 예산 20% 증액", priority: "high" as const },
  { icon: CheckCircle, text: "릴스 콘텐츠 참여율 8.3% — 피드 대비 3배 → 릴스 발행 주 3회로 확대", priority: "medium" as const },
  { icon: Lightbulb, text: "아이언펫 반려묘 키트 쿠팡 매출 낮음 — 쿠팡 로켓배송 검토", priority: "low" as const },
];

const CONVERSION_TIPS = [
  "장바구니 → 결제 전환율 62% — 무료배송 기준 낮추면 개선 가능 (5만원 → 3만원)",
  "모바일 결제 비중 78% — 간편결제(카카오페이/네이버페이) 노출 강화",
  "첫 구매 후 재구매까지 평균 21일 — 14일차 리텐션 메시지 자동화",
];

// ============================================================
// Rendering helpers
// ============================================================

function InsightCard({
  items,
  borderColor,
  bgColor,
  iconColor,
}: {
  items: InsightItem[];
  borderColor: string;
  bgColor: string;
  iconColor: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${borderColor} ${bgColor}`}>
            <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${iconColor}`} />
            <div className="space-y-1">
              <p className="text-sm text-zinc-200 font-medium">{item.text}</p>
              {item.detail && <p className="text-xs text-zinc-500">{item.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function InsightsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <PageHeader title="💡 Insights" subtitle="마케팅 인사이트 — 우선순위별 분석" />

        <div className="rounded-lg bg-amber-900/20 border border-amber-700 p-3 text-amber-300 text-sm">
          ⚠️ 현재 정적 더미 텍스트입니다. 향후 AI 분석 연동 예정
        </div>

        {/* Critical Insights */}
        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              🚨 Critical — 즉시 대응 필요
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightCard
              items={CRITICAL_INSIGHTS}
              borderColor="border-red-900/30"
              bgColor="bg-red-900/10"
              iconColor="text-red-400"
            />
          </CardContent>
        </Card>

        {/* Warning Insights */}
        <Card className="border-yellow-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              ⚠️ Warning — 주의 관찰
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightCard
              items={WARNING_INSIGHTS}
              borderColor="border-yellow-900/30"
              bgColor="bg-yellow-900/10"
              iconColor="text-yellow-400"
            />
          </CardContent>
        </Card>

        {/* Opportunity Insights */}
        <Card className="border-green-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              🟢 Opportunity — 성장 기회
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightCard
              items={OPPORTUNITY_INSIGHTS}
              borderColor="border-green-900/30"
              bgColor="bg-green-900/10"
              iconColor="text-green-400"
            />
          </CardContent>
        </Card>

        {/* Brand Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(BRAND_INSIGHTS).map(([key, brand]) => (
            <Card key={key} className={brand.color}>
              <CardHeader><CardTitle>{brand.name} 인사이트</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {brand.insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-400" />
                      {insight}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Action Items */}
        <Card>
          <CardHeader><CardTitle>📋 이번 주 해야 할 것</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ACTION_ITEMS.map((item, i) => {
                const Icon = item.icon;
                const priorityColor = item.priority === "high" ? "text-red-400" : item.priority === "medium" ? "text-yellow-400" : "text-zinc-400";
                const priorityBg = item.priority === "high" ? "bg-red-900/20" : item.priority === "medium" ? "bg-yellow-900/20" : "bg-zinc-800/50";
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${priorityBg}`}>
                    <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${priorityColor}`} />
                    <div>
                      <p className="text-sm text-zinc-200">{item.text}</p>
                      <span className={`text-[10px] ${priorityColor} uppercase font-medium`}>{item.priority}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Conversion Tips */}
        <Card>
          <CardHeader><CardTitle>📈 전환율 개선 포인트</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {CONVERSION_TIPS.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="text-green-400 mt-1">→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
