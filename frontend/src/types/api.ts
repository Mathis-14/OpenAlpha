// ── Market Data (yfinance) ───────────────────────────────────────────────────

export type PeriodType =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  | "max";

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerOverview {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  current_price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
}

export interface Fundamentals {
  pe_ratio: number | null;
  forward_pe: number | null;
  eps: number | null;
  revenue: number | null;
  ebitda: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  profit_margin: number | null;
  debt_to_equity: number | null;
  return_on_equity: number | null;
  dividend_yield: number | null;
}

export interface MarketResponse {
  overview: TickerOverview;
  fundamentals: Fundamentals;
  price_history: PricePoint[];
}

// ── Macro Data (FRED) ───────────────────────────────────────────────────────

export interface MacroDataPoint {
  date: string;
  value: number;
}

export type MacroIndicatorSlug =
  | "fed-funds"
  | "cpi"
  | "gdp-growth"
  | "treasury-10y"
  | "unemployment";

export type MacroHistoryRange = "1y" | "3y" | "5y" | "10y" | "max";
export type MacroCountry = "us" | "fr";

export interface MacroIndicator {
  series_id: string;
  name: string;
  latest_value: number;
  latest_date: string;
  unit: string;
  history: MacroDataPoint[];
}

export interface MacroSnapshot {
  fed_funds_rate: MacroIndicator;
  cpi: MacroIndicator;
  gdp_growth: MacroIndicator;
  treasury_10y: MacroIndicator;
  unemployment: MacroIndicator;
}

// ── SEC Filings (EDGAR) ─────────────────────────────────────────────────────

export interface FilingSection {
  title: string;
  content: string;
}

export interface Filing {
  form_type: string;
  filing_date: string;
  accession_number: string;
  sec_url: string;
  sections: FilingSection[];
}

export interface FilingsResponse {
  ticker: string;
  filings: Filing[];
}

// ── News (Yahoo RSS) ────────────────────────────────────────────────────────

export interface NewsArticle {
  title: string;
  source: string;
  published: string | null;
  summary: string;
  url: string;
}

export interface NewsResponse {
  ticker: string;
  articles: NewsArticle[];
}

// ── Agent (Mistral) ─────────────────────────────────────────────────────────

export interface AgentRequest {
  query: string;
  ticker?: string;
  dashboard_context?: "macro";
  country?: MacroCountry;
}

export type AgentEventType =
  | "tool_call"
  | "tool_result"
  | "text_delta"
  | "display_chart"
  | "display_metric"
  | "display_table"
  | "text"
  | "done"
  | "error";

export interface AgentEvent {
  event: AgentEventType;
  data: Record<string, unknown>;
}
