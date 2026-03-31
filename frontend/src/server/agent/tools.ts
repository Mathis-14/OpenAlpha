import type {
  CommodityInstrumentSlug,
  CommodityOverview,
  CommodityRange,
  CryptoInstrument,
  CryptoOverview,
  CryptoRange,
  DataAssetClass,
  DataExportQuery,
  MacroCountry,
  MacroHistoryRange,
  MacroIndicator,
  MacroSnapshot,
  MacroIndicatorSlug,
  PeriodType,
  PricePoint,
  NewsResponse,
  TickerOverview,
} from "@/types/api";
import { formatDateInputValue, getDefaultDateRange } from "@/lib/data-export";
import {
  getCommodityOverview,
  getCommodityPriceHistory,
  parseCommodityInstrument,
} from "@/server/commodities/service";
import {
  getCryptoOverview,
  getCryptoPriceHistory,
  parseCryptoInstrument,
  parseCryptoRange,
} from "@/server/crypto/service";
import { parseDataAssetClass } from "@/server/data/export";
import { getFilings } from "@/server/filings/service";
import {
  getMacroIndicator,
  getMacroSnapshotForCountry,
  parseMacroCountry,
  parseMacroHistoryRange,
  parseMacroIndicatorSlug,
} from "@/server/macro/service";
import {
  getFundamentals,
  getPriceHistory,
  getTickerOverview,
} from "@/server/market/service";
import { getContextNews, getNews } from "@/server/news/service";

type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type DisplayMetric = {
  type: "display_metric";
  data: {
    metrics: Array<{ label: string; value: string }>;
  };
};

type DisplayChart = {
  type: "display_chart";
  data: {
    symbol: string;
    period: string;
    points: Array<{ date: number; close: number }>;
  };
};

export type DisplayEvent = DisplayMetric | DisplayChart;
export type SuggestedDataExport = DataExportQuery & {
  reason?: string;
};

const MAX_FILING_SECTION_CHARS = 2_000;
const DATA_EXPORT_PRESETS = new Set(["1mo", "3mo", "1y", "5y"]);

const HISTORY_PERIODS = new Set<PeriodType>([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "max",
]);

const COMMODITY_HISTORY_PERIODS = new Set<CommodityRange>([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "max",
]);

const SUPPORTED_COMMODITY_INSTRUMENTS: CommodityInstrumentSlug[] = [
  "gold",
  "silver",
  "wti",
  "brent",
  "natural-gas",
  "copper",
  "gasoline",
  "aluminum",
  "wheat",
  "coffee",
  "cocoa",
  "heating-oil",
  "propane",
  "coal",
  "uranium",
  "all-commodities-index",
];

function normalizeCryptoInstrument(value: unknown): CryptoInstrument {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Crypto tools require a supported instrument.");
  }

  return parseCryptoInstrument(value);
}

function normalizeCryptoRange(value: unknown): CryptoRange {
  return parseCryptoRange(typeof value === "string" ? value : null);
}

function normalizeCommodityInstrument(value: unknown): CommodityInstrumentSlug {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Commodity tools require a supported instrument.");
  }

  return parseCommodityInstrument(value);
}

function normalizeCommodityRange(value: unknown): CommodityRange {
  return typeof value === "string" &&
    COMMODITY_HISTORY_PERIODS.has(value as CommodityRange)
    ? (value as CommodityRange)
    : "1mo";
}

function normalizeMacroIndicator(value: unknown): MacroIndicatorSlug {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Macro series tools require a supported indicator.");
  }

  return parseMacroIndicatorSlug(value);
}

function normalizeMacroRange(value: unknown): MacroHistoryRange {
  return parseMacroHistoryRange(typeof value === "string" ? value : null);
}

function toPresetDateRange(preset: "1mo" | "3mo" | "1y" | "5y") {
  const endDate = new Date();
  const startDate = new Date(endDate);
  const days =
    preset === "1mo"
      ? 31
      : preset === "3mo"
        ? 93
        : preset === "1y"
          ? 365
          : 365 * 5;
  startDate.setUTCDate(startDate.getUTCDate() - days);

  return {
    startDate: formatDateInputValue(startDate),
    endDate: formatDateInputValue(endDate),
  };
}

function isDateInput(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeSuggestedDataExportArgs(
  argumentsObject: Record<string, unknown>,
): SuggestedDataExport {
  const assetClass = parseDataAssetClass(
    typeof argumentsObject.asset_class === "string"
      ? argumentsObject.asset_class
      : null,
  );

  const rawAsset = String(argumentsObject.asset ?? "").trim();
  if (!rawAsset) {
    throw new Error("suggest_data_export requires a supported asset");
  }

  let asset: string;
  let country: MacroCountry | undefined;

  switch (assetClass) {
    case "stock":
      asset = rawAsset.toUpperCase();
      break;
    case "commodity":
      asset = parseCommodityInstrument(rawAsset);
      break;
    case "crypto":
      asset = parseCryptoInstrument(rawAsset);
      break;
    case "macro":
      asset = parseMacroIndicatorSlug(rawAsset);
      country = parseMacroCountry(
        typeof argumentsObject.country === "string"
          ? argumentsObject.country
          : null,
      );
      break;
  }

  let start_date: string;
  let end_date: string;
  if (isDateInput(argumentsObject.start_date) && isDateInput(argumentsObject.end_date)) {
    start_date = argumentsObject.start_date;
    end_date = argumentsObject.end_date;
  } else if (
    typeof argumentsObject.range_preset === "string" &&
    DATA_EXPORT_PRESETS.has(argumentsObject.range_preset)
  ) {
    const range = toPresetDateRange(
      argumentsObject.range_preset as "1mo" | "3mo" | "1y" | "5y",
    );
    start_date = range.startDate;
    end_date = range.endDate;
  } else {
    const range = getDefaultDateRange(assetClass as DataAssetClass);
    start_date = range.startDate;
    end_date = range.endDate;
  }

  const plan: SuggestedDataExport = {
    asset_class: assetClass as DataAssetClass,
    asset,
    start_date,
    end_date,
  };

  if (assetClass === "macro") {
    plan.country = country ?? "us";
  }

  if (typeof argumentsObject.reason === "string" && argumentsObject.reason.trim()) {
    plan.reason = argumentsObject.reason.trim();
  }

  return plan;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_stock_overview",
      description:
        "Get current stock data: price, change, volume, market cap, 52-week range. Use for a quick snapshot of any publicly traded stock.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker symbol (e.g. AAPL, MSFT, TSLA)",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commodity_overview",
      description:
        "Get live commodity dashboard data for a supported commodity benchmark or futures market.",
      parameters: {
        type: "object",
        properties: {
          instrument: {
            type: "string",
            enum: SUPPORTED_COMMODITY_INSTRUMENTS,
            description: "Supported commodity dashboard slug",
          },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commodity_price_history",
      description:
        "Get OHLCV history for a supported commodity dashboard over a selected range.",
      parameters: {
        type: "object",
        properties: {
          instrument: {
            type: "string",
            enum: SUPPORTED_COMMODITY_INSTRUMENTS,
            description: "Supported commodity dashboard slug",
          },
          range: {
            type: "string",
            enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"],
            description: "Time range for commodity price history (default: 1mo)",
          },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crypto_overview",
      description:
        "Get live Deribit market data for a supported crypto perpetual. Supported instruments are BTC-PERPETUAL and ETH-PERPETUAL only.",
      parameters: {
        type: "object",
        properties: {
          instrument: {
            type: "string",
            enum: ["BTC-PERPETUAL", "ETH-PERPETUAL"],
            description: "Supported Deribit perpetual instrument",
          },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crypto_price_history",
      description:
        "Get Deribit OHLCV history for BTC-PERPETUAL or ETH-PERPETUAL over a specific range.",
      parameters: {
        type: "object",
        properties: {
          instrument: {
            type: "string",
            enum: ["BTC-PERPETUAL", "ETH-PERPETUAL"],
            description: "Supported Deribit perpetual instrument",
          },
          range: {
            type: "string",
            enum: ["1d", "1w", "1mo", "3mo", "1y", "max"],
            description: "Time range for crypto price history (default: 1mo)",
          },
        },
        required: ["instrument"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_fundamentals",
      description:
        "Get financial ratios and metrics: P/E, EPS, revenue, EBITDA, margins, debt-to-equity, ROE, dividend yield.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker symbol (e.g. AAPL, MSFT, TSLA)",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_price_history",
      description:
        "Get OHLCV price history for a stock over a specified period. Useful for trend analysis and price movements.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker symbol",
          },
          period: {
            type: "string",
            enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"],
            description: "Time period for history (default: 1mo)",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_macro_snapshot",
      description:
        "Get key macroeconomic indicators: Fed Funds rate, CPI, real GDP growth, 10-year Treasury yield, unemployment rate. Use country='fr' for France, otherwise default to the U.S.",
      parameters: {
        type: "object",
        properties: {
          country: {
            type: "string",
            enum: ["us", "fr"],
            description: "Macro dashboard country context (default: us)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_macro_series",
      description:
        "Get one macroeconomic time series for a specific indicator and country. Use this when the user is focused on CPI, rates, GDP growth, Treasury yields, or unemployment trends.",
      parameters: {
        type: "object",
        properties: {
          indicator: {
            type: "string",
            enum: ["fed-funds", "cpi", "gdp-growth", "treasury-10y", "unemployment"],
            description: "The macro indicator slug",
          },
          country: {
            type: "string",
            enum: ["us", "fr"],
            description: "Macro country context (default: us)",
          },
          range: {
            type: "string",
            enum: ["1y", "3y", "5y", "10y", "max"],
            description: "Historical window to fetch (default: 5y)",
          },
        },
        required: ["indicator"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_data_export",
      description:
        "Create one concrete Get the data export plan for the current user request. Use for CSV, download, or dataset-planning help.",
      parameters: {
        type: "object",
        properties: {
          asset_class: {
            type: "string",
            enum: ["stock", "macro", "commodity", "crypto"],
            description: "Supported asset class for the export",
          },
          asset: {
            type: "string",
            description:
              "Ticker, macro indicator slug, commodity slug, or supported crypto instrument",
          },
          country: {
            type: "string",
            enum: ["us", "fr"],
            description: "Macro country only. Use for macro exports.",
          },
          range_preset: {
            type: "string",
            enum: ["1mo", "3mo", "1y", "5y"],
            description: "Preferred date window when exact dates were not specified.",
          },
          start_date: {
            type: "string",
            description: "Optional exact start date in yyyy-mm-dd format.",
          },
          end_date: {
            type: "string",
            description: "Optional exact end date in yyyy-mm-dd format.",
          },
          reason: {
            type: "string",
            description: "Short explanation of why this export fits the user request.",
          },
        },
        required: ["asset_class", "asset"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sec_filings",
      description:
        "Get recent SEC filings (10-K annual or 10-Q quarterly reports) for a company. Returns key sections like Risk Factors and MD&A.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker symbol",
          },
          form_type: {
            type: "string",
            enum: ["10-K", "10-Q"],
            description: "Filing type (default: 10-K)",
          },
          limit: {
            type: "integer",
            description: "Number of filings to return (default: 1)",
          },
        },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description:
        "Get latest focused news from Yahoo Finance. Use a ticker for company news or a topic keyword for focused context like gold, bitcoin, inflation, or natural gas. Do not use this for generic world-market or global-backdrop questions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Ticker symbol or focused topic keyword",
          },
          limit: {
            type: "integer",
            description: "Max articles to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_context_news",
      description:
        "Get broader market, geopolitical, macro, or risk context news. This is the broad context tool; use it for what matters, what is driving moves, or broader backdrop questions rather than company-specific headlines.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Broad backdrop intent. Prefer one of: markets, geopolitics, macro, rates, or risk.",
          },
          limit: {
            type: "integer",
            description: "Max articles to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
];

function compactNumber(value: number | null): string {
  if (value == null) {
    return "—";
  }

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

function compactCurrency(value: number | null): string {
  const compact = compactNumber(value);
  return compact === "—" ? compact : `$${compact}`;
}

function formatIndicatorValue(
  indicator: MacroIndicator,
  decimals: number,
): string {
  const suffix = indicator.unit === "%" ? "%" : "";
  return `${indicator.latest_value.toFixed(decimals)}${suffix}`;
}

function toIsoDateFromUnix(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function summarizePriceHistory(points: PricePoint[]) {
  if (points.length === 0) {
    return {
      points: 0,
      note: "No history points returned.",
    };
  }

  const start = points[0];
  const end = points[points.length - 1];
  const highs = points.map((point) => point.high);
  const lows = points.map((point) => point.low);
  const absoluteChange = Number((end.close - start.close).toFixed(4));
  const percentChange =
    start.close === 0
      ? null
      : Number((((end.close - start.close) / start.close) * 100).toFixed(4));

  return {
    points: points.length,
    start_date: toIsoDateFromUnix(start.date),
    end_date: toIsoDateFromUnix(end.date),
    start_close: start.close,
    end_close: end.close,
    latest_close: end.close,
    high: Math.max(...highs),
    low: Math.min(...lows),
    absolute_change: absoluteChange,
    percent_change: percentChange,
  };
}

function shapeStockOverviewForAgent(
  overview: TickerOverview,
) {
  return {
    symbol: overview.symbol,
    name: overview.name,
    currency: overview.currency,
    exchange: overview.exchange,
    current_price: overview.current_price,
    previous_close: overview.previous_close,
    change: overview.change,
    change_percent: overview.change_percent,
    volume: overview.volume,
    market_cap: overview.market_cap,
    fifty_two_week_high: overview.fifty_two_week_high,
    fifty_two_week_low: overview.fifty_two_week_low,
    data_status: overview.data_status ?? "complete",
    warnings: overview.warnings ?? [],
  };
}

function shapeCommodityOverviewForAgent(
  overview: CommodityOverview,
) {
  return {
    instrument: overview.instrument,
    name: overview.name,
    exchange_label: overview.exchange_label,
    source_label: overview.source_label,
    unit_label: overview.unit_label,
    current_price: overview.current_price,
    previous_close: overview.previous_close,
    change: overview.change,
    change_percent: overview.change_percent,
    volume: overview.volume,
    open_interest: overview.open_interest,
    day_high: overview.day_high,
    day_low: overview.day_low,
    fifty_two_week_high: overview.fifty_two_week_high,
    fifty_two_week_low: overview.fifty_two_week_low,
    market_state: overview.market_state,
    data_status: overview.data_status ?? "complete",
    warnings: overview.warnings ?? [],
  };
}

function shapeCryptoOverviewForAgent(
  overview: CryptoOverview,
) {
  const funding8hPercent =
    overview.funding_8h == null
      ? null
      : Number((overview.funding_8h * 100).toFixed(6));
  const currentFundingPercent =
    overview.current_funding == null
      ? null
      : Number((overview.current_funding * 100).toFixed(6));

  return {
    instrument: overview.instrument,
    name: overview.name,
    description: overview.description,
    last_price: overview.last_price,
    mark_price: overview.mark_price,
    index_price: overview.index_price,
    high_24h: overview.high_24h,
    low_24h: overview.low_24h,
    change_24h: overview.change_24h,
    volume_24h: overview.volume_24h,
    volume_24h_display:
      overview.volume_24h == null
        ? "—"
        : `${compactNumber(overview.volume_24h)} ${overview.base_currency}`,
    volume_notional_24h: overview.volume_notional_24h,
    volume_notional_24h_display: compactCurrency(overview.volume_notional_24h),
    open_interest: overview.open_interest,
    open_interest_display: compactNumber(overview.open_interest),
    open_interest_unit: "native Deribit units",
    funding_8h_percent: funding8hPercent,
    current_funding_percent: currentFundingPercent,
    data_status: overview.data_status ?? "complete",
    warnings: overview.warnings ?? [],
  };
}

function shapeMacroSnapshotForAgent(
  snapshot: MacroSnapshot,
  country: MacroCountry,
) {
  return {
    country,
    fed_funds_rate: {
      name: snapshot.fed_funds_rate.name,
      latest_value: snapshot.fed_funds_rate.latest_value,
      latest_date: snapshot.fed_funds_rate.latest_date,
      unit: snapshot.fed_funds_rate.unit,
    },
    cpi: {
      name: snapshot.cpi.name,
      latest_value: snapshot.cpi.latest_value,
      latest_date: snapshot.cpi.latest_date,
      unit: snapshot.cpi.unit,
    },
    gdp_growth: {
      name: snapshot.gdp_growth.name,
      latest_value: snapshot.gdp_growth.latest_value,
      latest_date: snapshot.gdp_growth.latest_date,
      unit: snapshot.gdp_growth.unit,
    },
    treasury_10y: {
      name: snapshot.treasury_10y.name,
      latest_value: snapshot.treasury_10y.latest_value,
      latest_date: snapshot.treasury_10y.latest_date,
      unit: snapshot.treasury_10y.unit,
    },
    unemployment: {
      name: snapshot.unemployment.name,
      latest_value: snapshot.unemployment.latest_value,
      latest_date: snapshot.unemployment.latest_date,
      unit: snapshot.unemployment.unit,
    },
  };
}

function shapeMacroSeriesForAgent(
  series: MacroIndicator,
  indicator: MacroIndicatorSlug,
  country: MacroCountry,
  range: MacroHistoryRange,
) {
  const start = series.history[0];
  const end = series.history[series.history.length - 1];
  const absoluteChange = Number((end.value - start.value).toFixed(6));
  const percentChange =
    start.value === 0
      ? null
      : Number((((end.value - start.value) / start.value) * 100).toFixed(6));
  const values = series.history.map((point) => point.value);

  return {
    country,
    indicator,
    name: series.name,
    range,
    latest_value: series.latest_value,
    latest_date: series.latest_date,
    unit: series.unit,
    start_date: start.date,
    end_date: end.date,
    start_value: start.value,
    end_value: end.value,
    absolute_change: absoluteChange,
    percent_change: percentChange,
    high: Math.max(...values),
    low: Math.min(...values),
  };
}

function buildCryptoMetrics(
  overview: CryptoOverview,
): Array<{ label: string; value: string }> {
  return [
    { label: overview.instrument, value: `$${overview.last_price.toFixed(2)}` },
    {
      label: "24H Change",
      value:
        overview.change_24h == null
          ? "—"
          : `${overview.change_24h >= 0 ? "+" : ""}${overview.change_24h.toFixed(2)}%`,
    },
    {
      label: "Open Interest",
      value: compactNumber(overview.open_interest),
    },
    {
      label: "Mark Price",
      value: `$${overview.mark_price.toFixed(2)}`,
    },
  ];
}

function buildCommodityMetrics(
  overview: CommodityOverview,
): Array<{ label: string; value: string }> {
  const usesPlainNumber =
    overview.category === "index" ||
    overview.unit_label.toLowerCase().includes("cents");

  const formatPrimaryValue = (value: number | null): string => {
    if (value == null) {
      return "—";
    }

    return usesPlainNumber
      ? value.toLocaleString("en-US", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })
      : `$${value.toFixed(2)}`;
  };

  return [
    {
      label: overview.name,
      value: formatPrimaryValue(overview.current_price),
    },
    {
      label: "Change",
      value: `${overview.change_percent >= 0 ? "+" : ""}${overview.change_percent.toFixed(2)}%`,
    },
    {
      label: "Volume",
      value: compactNumber(overview.volume),
    },
    {
      label: "Open Interest",
      value: compactNumber(overview.open_interest),
    },
  ];
}

function truncateFilings<T extends { filings?: Array<{ sections?: Array<{ content?: string }> }> }>(
  data: T,
): T {
  for (const filing of data.filings ?? []) {
    for (const section of filing.sections ?? []) {
      const content = section.content ?? "";
      if (content.length > MAX_FILING_SECTION_CHARS) {
        section.content = `${content.slice(0, MAX_FILING_SECTION_CHARS)}\n\n[...truncated for brevity]`;
      }
    }
  }

  return data;
}

function normalizeCountry(country: unknown): MacroCountry {
  return country === "fr" ? "fr" : "us";
}

function normalizePeriod(period: unknown): PeriodType {
  return typeof period === "string" && HISTORY_PERIODS.has(period as PeriodType)
    ? (period as PeriodType)
    : "1mo";
}

function buildNewsDigest(news: NewsResponse) {
  const topArticles = news.articles.slice(0, 3);
  const combined = topArticles
    .map((article) => `${article.title} ${article.summary}`.toLowerCase())
    .join(" ");

  const themes = [
    {
      label: "geopolitics",
      pattern: /\b(iran|war|conflict|tariff|tariffs|sanction|sanctions|middle east|election|trade war)\b/i,
    },
    {
      label: "rates",
      pattern: /\b(rate|rates|yield|yields|treasury|fed|central bank|monetary)\b/i,
    },
    {
      label: "inflation",
      pattern: /\b(inflation|cpi|prices)\b/i,
    },
    {
      label: "risk sentiment",
      pattern: /\b(volatility|fear|selloff|risk-off|sentiment|safe haven|stress)\b/i,
    },
    {
      label: "energy",
      pattern: /\b(oil|gas|crude|energy)\b/i,
    },
    {
      label: "equities",
      pattern: /\b(stocks|equities|wall street|s&p 500|nasdaq)\b/i,
    },
  ]
    .filter((theme) => theme.pattern.test(combined))
    .map((theme) => theme.label)
    .slice(0, 3);

  return {
    provider: news.provider ?? null,
    source_mode: news.source_mode ?? null,
    article_count: news.articles.length,
    usable_link_count: news.articles.filter((article) => Boolean(article.url)).length,
    warning_count: news.warnings?.length ?? 0,
    fallback_summary: news.warnings?.[0] ?? null,
    top_headlines: topArticles.map((article) => ({
      title: article.title,
      source: article.source,
      published: article.published,
      link_available: Boolean(article.url),
    })),
    dominant_themes: themes,
    guidance:
      news.kind === "focused" && news.source_mode === "broad_feed"
        ? "Use these headlines as tentative focused context recovered from a broader market feed. Keep the answer conservative and grounded."
        : news.kind === "focused"
        ? "Use these focused headlines as the primary news input for the active asset or topic."
        : "Use this as broader backdrop only; do not let it replace asset-specific headlines.",
  };
}

function shapeNewsForAgent(news: NewsResponse) {
  return {
    ...news,
    articles: news.articles.map((article) => {
      const shaped: Record<string, unknown> = {
        title: article.title,
        source: article.source,
        published: article.published,
        summary: article.summary,
      };
      if (article.url) {
        shaped.url = article.url;
      }
      return shaped;
    }),
  };
}

export async function dispatchToolWithDisplay(
  name: string,
  argumentsObject: Record<string, unknown>,
): Promise<[string, DisplayEvent[]]> {
  let result: unknown;
  let displays: DisplayEvent[] = [];

  if (name === "get_stock_overview") {
    const symbol = String(argumentsObject.symbol ?? "").trim();
    const overview = await getTickerOverview(symbol);
    result = shapeStockOverviewForAgent(overview);
    displays = [
      {
        type: "display_metric",
        data: {
          metrics: [
            { label: overview.name, value: `$${overview.current_price.toFixed(2)}` },
            { label: "Change", value: `${overview.change_percent >= 0 ? "+" : ""}${overview.change_percent.toFixed(2)}%` },
            { label: "Market Cap", value: compactCurrency(overview.market_cap) },
            { label: "Volume", value: compactNumber(overview.volume) },
          ],
        },
      },
    ];
  } else if (name === "get_stock_fundamentals") {
    const symbol = String(argumentsObject.symbol ?? "").trim();
    const fundamentals = await getFundamentals(symbol);
    result = fundamentals;
    const metrics: Array<{ label: string; value: string }> = [];
    if (fundamentals.pe_ratio != null) {
      metrics.push({ label: "P/E", value: `${fundamentals.pe_ratio.toFixed(1)}x` });
    }
    if (fundamentals.eps != null) {
      metrics.push({ label: "EPS", value: `$${fundamentals.eps.toFixed(2)}` });
    }
    if (fundamentals.profit_margin != null) {
      metrics.push({
        label: "Profit Margin",
        value: `${(fundamentals.profit_margin * 100).toFixed(1)}%`,
      });
    }
    if (fundamentals.return_on_equity != null) {
      metrics.push({
        label: "ROE",
        value: `${(fundamentals.return_on_equity * 100).toFixed(1)}%`,
      });
    }
    if (metrics.length > 0) {
      displays = [{ type: "display_metric", data: { metrics } }];
    }
  } else if (name === "get_price_history") {
    const symbol = String(argumentsObject.symbol ?? "").trim();
    const period = normalizePeriod(argumentsObject.period);
    const history = await getPriceHistory(symbol, period);
    result = {
      symbol,
      period,
      ...summarizePriceHistory(history),
    };
    displays = [
      {
        type: "display_chart",
        data: {
          symbol,
          period,
          points: history.slice(-60).map((point) => ({
            date: point.date,
            close: point.close,
          })),
        },
      },
    ];
  } else if (name === "get_macro_snapshot") {
    const country = normalizeCountry(argumentsObject.country);
    const snapshot = await getMacroSnapshotForCountry(country);
    result = shapeMacroSnapshotForAgent(snapshot, country);
    displays = [
      {
        type: "display_metric",
        data: {
          metrics: [
            {
              label: "Fed Funds",
              value: formatIndicatorValue(snapshot.fed_funds_rate, 2),
            },
            { label: "CPI", value: formatIndicatorValue(snapshot.cpi, 1) },
            {
              label: "GDP Growth",
              value: formatIndicatorValue(snapshot.gdp_growth, 1),
            },
            {
              label: "Unemployment",
              value: formatIndicatorValue(snapshot.unemployment, 1),
            },
          ],
        },
      },
    ];
  } else if (name === "get_macro_series") {
    const indicator = normalizeMacroIndicator(argumentsObject.indicator);
    const country = normalizeCountry(argumentsObject.country);
    const range = normalizeMacroRange(argumentsObject.range);
    const series = await getMacroIndicator(indicator, range, country);
    result = shapeMacroSeriesForAgent(series, indicator, country, range);
    displays = [
      {
        type: "display_chart",
        data: {
          symbol: indicator,
          period: range,
          points: series.history.slice(-60).map((point) => ({
            date: Date.parse(`${point.date}T00:00:00.000Z`) / 1000,
            close: point.value,
          })),
        },
      },
      {
        type: "display_metric",
        data: {
          metrics: [
            {
              label: series.name,
              value: formatIndicatorValue(series, series.unit === "%" ? 2 : 1),
            },
          ],
        },
      },
    ];
  } else if (name === "suggest_data_export") {
    result = normalizeSuggestedDataExportArgs(argumentsObject);
  } else if (name === "get_commodity_overview") {
    const instrument = normalizeCommodityInstrument(argumentsObject.instrument);
    const overview = await getCommodityOverview(instrument);
    result = shapeCommodityOverviewForAgent(overview);
    displays = [
      {
        type: "display_metric",
        data: {
          metrics: buildCommodityMetrics(overview),
        },
      },
    ];
  } else if (name === "get_commodity_price_history") {
    const instrument = normalizeCommodityInstrument(argumentsObject.instrument);
    const range = normalizeCommodityRange(argumentsObject.range);
    const history = await getCommodityPriceHistory(instrument, range);
    result = {
      instrument,
      range,
      ...summarizePriceHistory(history),
    };
    displays = [
      {
        type: "display_chart",
        data: {
          symbol: instrument,
          period: range,
          points: history.slice(-60).map((point) => ({
            date: point.date,
            close: point.close,
          })),
        },
      },
    ];
  } else if (name === "get_crypto_overview") {
    const instrument = normalizeCryptoInstrument(argumentsObject.instrument);
    const overview = await getCryptoOverview(instrument);
    result = shapeCryptoOverviewForAgent(overview);
    displays = [
      {
        type: "display_metric",
        data: {
          metrics: buildCryptoMetrics(overview),
        },
      },
    ];
  } else if (name === "get_crypto_price_history") {
    const instrument = normalizeCryptoInstrument(argumentsObject.instrument);
    const range = normalizeCryptoRange(argumentsObject.range);
    const history = await getCryptoPriceHistory(instrument, range);
    result = {
      instrument,
      range,
      ...summarizePriceHistory(history),
    };
    displays = [
      {
        type: "display_chart",
        data: {
          symbol: instrument,
          period: range,
          points: history.slice(-60).map((point) => ({
            date: point.date,
            close: point.close,
          })),
        },
      },
    ];
  } else if (name === "get_sec_filings") {
    const ticker = String(argumentsObject.ticker ?? "").trim();
    const formType = argumentsObject.form_type === "10-Q" ? "10-Q" : "10-K";
    const rawLimit = Number(argumentsObject.limit ?? 1);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 1;
    result = truncateFilings(await getFilings(ticker, formType, limit));
  } else if (name === "get_news") {
    const query = String(argumentsObject.query ?? "").trim();
    const rawLimit = Number(argumentsObject.limit ?? 5);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 5;
    const news = await getNews(query, limit);
    result = {
      ...shapeNewsForAgent(news),
      digest: buildNewsDigest(news),
    };
  } else if (name === "get_context_news") {
    const query = String(argumentsObject.query ?? "").trim();
    const rawLimit = Number(argumentsObject.limit ?? 5);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 5;
    const news = await getContextNews(query, limit);
    result = {
      ...shapeNewsForAgent(news),
      digest: buildNewsDigest(news),
    };
  } else {
    result = { error: `Unknown tool: ${name}` };
  }

  return [JSON.stringify(result), displays];
}
