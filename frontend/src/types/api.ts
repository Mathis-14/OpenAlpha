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
  date: number;
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

// ── Crypto Data (Deribit) ───────────────────────────────────────────────────

export type CryptoInstrument = "BTC-PERPETUAL" | "ETH-PERPETUAL";
export type CryptoRange = "1d" | "1w" | "1mo" | "3mo" | "1y" | "max";

export interface CryptoDiscoveryItem {
  instrument: CryptoInstrument;
  name: string;
  description: string;
  base_currency: string;
  quote_currency: string;
  last_price: number;
  mark_price: number;
  change_24h: number | null;
  volume_24h: number | null;
  open_interest: number | null;
  status: string;
}

export interface CryptoOverview {
  instrument: CryptoInstrument;
  name: string;
  description: string;
  base_currency: string;
  quote_currency: string;
  settlement_currency: string;
  price_index: string;
  status: string;
  instrument_type: string;
  settlement_period: string;
  contract_size: number | null;
  tick_size: number | null;
  min_trade_amount: number | null;
  max_leverage: number | null;
  maker_commission: number | null;
  taker_commission: number | null;
  creation_timestamp: number | null;
  expiration_timestamp: number | null;
  last_price: number;
  mark_price: number;
  index_price: number | null;
  best_bid_price: number | null;
  best_ask_price: number | null;
  high_24h: number | null;
  low_24h: number | null;
  change_24h: number | null;
  volume_24h: number | null;
  volume_notional_24h: number | null;
  open_interest: number | null;
  funding_8h: number | null;
  current_funding: number | null;
}

// ── Commodity Data (Yahoo futures + benchmark metadata) ────────────────────

export type CommodityInstrumentSlug =
  | "gold"
  | "silver"
  | "wti"
  | "brent"
  | "natural-gas"
  | "copper"
  | "gasoline"
  | "aluminum"
  | "wheat"
  | "coffee"
  | "cocoa"
  | "heating-oil"
  | "propane"
  | "coal"
  | "uranium"
  | "all-commodities-index";

export type CommodityCategory = "energy" | "metals" | "agriculture" | "index";
export type CommodityRange = PeriodType;

export interface CommodityDiscoveryItem {
  instrument: CommodityInstrumentSlug;
  name: string;
  short_label: string;
  description: string;
  category: CommodityCategory;
  unit_label: string;
  exchange_label: string;
  source_label: string;
}

export interface CommodityOverview extends CommodityDiscoveryItem {
  provider_symbol: string;
  currency: string;
  current_price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  volume: number | null;
  open_interest: number | null;
  day_high: number | null;
  day_low: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  market_state: string | null;
}

// ── Data Export ─────────────────────────────────────────────────────────────

export type DataAssetClass = "stock" | "macro" | "commodity" | "crypto";
export type DataExportSchema = "ohlcv" | "series";

export interface DataExportQuery {
  asset_class: DataAssetClass;
  asset: string;
  country?: MacroCountry;
  start_date: string;
  end_date: string;
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
  dashboard_context?: "macro" | "crypto" | "commodity" | "data";
  country?: MacroCountry;
  crypto_instrument?: CryptoInstrument;
  commodity_instrument?: CommodityInstrumentSlug;
}

export type AgentEventType =
  | "tool_call"
  | "tool_result"
  | "text_delta"
  | "display_chart"
  | "display_metric"
  | "display_download"
  | "display_table"
  | "text"
  | "done"
  | "error";

export interface AgentEvent {
  event: AgentEventType;
  data: Record<string, unknown>;
}
