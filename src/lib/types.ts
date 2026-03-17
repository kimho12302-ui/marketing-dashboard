export type Period = "daily" | "weekly" | "monthly";
export type Brand = "all" | "nutty" | "ironpet" | "balancelab" | "saip";

export interface DailySales {
  date: string;
  brand: string;
  channel: string;
  revenue: number;
  orders: number;
  avg_order_value: number;
}

export interface DailyAdSpend {
  date: string;
  brand: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  ctr: number;
  cpc: number;
}

export interface DailyFunnel {
  date: string;
  brand: string;
  impressions: number;
  sessions: number;
  cart_adds: number;
  signups: number;
  purchases: number;
  repurchases: number;
}

export interface DailyContent {
  date: string;
  brand: string;
  viral: number;
  non_viral: number;
  optimized_blog: number;
  brand_content: number;
  naver_blog: number;
}

export interface KPIData {
  revenue: number;
  revenuePrev: number;
  adSpend: number;
  adSpendPrev: number;
  roas: number;
  roasPrev: number;
  orders: number;
  ordersPrev: number;
  profit?: number;
  profitPrev?: number;
  mer?: number;
  merPrev?: number;
  aov?: number;
  aovPrev?: number;
  cogs?: number;
  manufacturing?: number;
  shipping?: number;
  miscCost?: number;
}

export interface TrendDataPoint {
  date: string;
  revenue: number;
  adSpend: number;
}

export interface ChannelAdData {
  date: string;
  [channel: string]: number | string;
}

export interface FunnelStep {
  name: string;
  value: number;
  rate?: number;
}

export interface DashboardFilters {
  period: Period;
  brand: Brand;
  from: string;
  to: string;
}

// V2 Types
export interface ProductSalesRow {
  date: string;
  brand: string;
  category: string;
  product: string;
  channel: string;
  revenue: number;
  quantity: number;
  buyers: number;
  avg_price: number;
}

export interface KeywordRow {
  date: string;
  brand: string;
  platform: string;
  keyword: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  conversions: number;
}

export interface ContentRow {
  date: string;
  brand: string;
  platform: string;
  content_type: string;
  posts: number;
  impressions: number;
  clicks: number;
  ctr: number;
  followers: number;
  engagement: number;
}

export interface AdsChannelSummary {
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
  conversionValue: number;
}

export interface KeywordSummary {
  keyword: string;
  platform: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  conversions: number;
}

export interface ContentSummary {
  platform: string;
  content_type: string;
  posts: number;
  impressions: number;
  clicks: number;
  ctr: number;
  followers: number;
  engagement: number;
}
