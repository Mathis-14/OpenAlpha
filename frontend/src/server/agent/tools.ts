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
  MacroIndicator,
  PeriodType,
  PricePoint,
} from "@/types/api";
import { formatDateInputValue, getDefaultDateRange } from "@/lib/data-export";
import {
  getCommodityOverview,
  getCommodityPriceHistory,
  parseCommodityInstrument,
} from "@/server/commodities/service";
import {
  coerceCryptoInstrument,
  getCryptoOverview,
  getCryptoPriceHistory,
  parseCryptoInstrument,
  parseCryptoRange,
} from "@/server/crypto/service";
import { parseDataAssetClass } from "@/server/data/export";
import { getFilings } from "@/server/filings/service";
import {
  getMacroSnapshotForCountry,
  parseMacroCountry,
  parseMacroIndicatorSlug,
} from "@/server/macro/service";
import {
  getFundamentals,
  getPriceHistory,
  getTickerOverview,
} from "@/server/market/service";
import { getNews } from "@/server/news/service";

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

const MAX_HISTORY_POINTS = 30;
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
  return coerceCryptoInstrument(value) ?? "BTC-PERPETUAL";
}

function normalizeCryptoRange(value: unknown): CryptoRange {
  return parseCryptoRange(typeof value === "string" ? value : null);
}

function normalizeCommodityInstrument(value: unknown): CommodityInstrumentSlug {
  if (typeof value === "string") {
    return parseCommodityInstrument(value);
  }

  return "gold";
}

function normalizeCommodityRange(value: unknown): CommodityRange {
  return typeof value === "string" &&
    COMMODITY_HISTORY_PERIODS.has(value as CommodityRange)
    ? (value as CommodityRange)
    : "1mo";
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
        "Get latest news articles for a stock from Yahoo Finance. Returns headlines, sources, and summaries.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker symbol",
          },
          limit: {
            type: "integer",
            description: "Max articles to return (default: 5)",
          },
        },
        required: ["ticker"],
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

function truncateHistory(points: PricePoint[]): { price_history: PricePoint[]; _note?: string } {
  if (points.length <= MAX_HISTORY_POINTS) {
    return { price_history: points };
  }

  return {
    price_history: points.slice(-MAX_HISTORY_POINTS),
    _note: `Showing last ${MAX_HISTORY_POINTS} of ${points.length} points`,
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

export async function dispatchToolWithDisplay(
  name: string,
  argumentsObject: Record<string, unknown>,
): Promise<[string, DisplayEvent[]]> {
  let result: unknown;
  let displays: DisplayEvent[] = [];

  if (name === "get_stock_overview") {
    const symbol = String(argumentsObject.symbol ?? "").trim();
    const overview = await getTickerOverview(symbol);
    result = overview;
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
    result = truncateHistory(history);
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
    result = snapshot;
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
  } else if (name === "suggest_data_export") {
    result = normalizeSuggestedDataExportArgs(argumentsObject);
  } else if (name === "get_commodity_overview") {
    const instrument = normalizeCommodityInstrument(argumentsObject.instrument);
    const overview = await getCommodityOverview(instrument);
    result = overview;
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
    result = truncateHistory(history);
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
    result = overview;
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
    result = truncateHistory(history);
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
    const ticker = String(argumentsObject.ticker ?? "").trim();
    const rawLimit = Number(argumentsObject.limit ?? 5);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 5;
    result = await getNews(ticker, limit);
  } else {
    result = { error: `Unknown tool: ${name}` };
  }

  return [JSON.stringify(result), displays];
}
