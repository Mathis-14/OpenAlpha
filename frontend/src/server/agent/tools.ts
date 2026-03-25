import type {
  CryptoInstrument,
  CryptoOverview,
  CryptoRange,
  MacroCountry,
  MacroIndicator,
  PeriodType,
  PricePoint,
} from "@/types/api";
import {
  coerceCryptoInstrument,
  getCryptoOverview,
  getCryptoPriceHistory,
  parseCryptoRange,
} from "@/server/crypto/service";
import { getFilings } from "@/server/filings/service";
import { getMacroSnapshotForCountry } from "@/server/macro/service";
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

const MAX_HISTORY_POINTS = 30;
const MAX_FILING_SECTION_CHARS = 2_000;

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

function normalizeCryptoInstrument(value: unknown): CryptoInstrument {
  return coerceCryptoInstrument(value) ?? "BTC-PERPETUAL";
}

function normalizeCryptoRange(value: unknown): CryptoRange {
  return parseCryptoRange(typeof value === "string" ? value : null);
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
