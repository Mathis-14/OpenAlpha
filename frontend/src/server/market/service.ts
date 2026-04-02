import YahooFinance from "yahoo-finance2";
import type {
  Fundamentals,
  MarketResponse,
  PeriodType,
  PricePoint,
  TickerOverview,
} from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import {
  normalizeDashboardSymbol,
  toProviderSymbol,
} from "@/server/market/symbols";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const PERIOD_CONFIG: Record<
  PeriodType,
  { interval: "5m" | "15m" | "1d" | "1wk" | "1mo"; period1: Date }
> = {
  "1d": { interval: "5m", period1: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  "5d": { interval: "15m", period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
  "1mo": { interval: "1d", period1: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) },
  "3mo": { interval: "1d", period1: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
  "6mo": { interval: "1d", period1: new Date(Date.now() - 190 * 24 * 60 * 60 * 1000) },
  "1y": { interval: "1wk", period1: new Date(Date.now() - 380 * 24 * 60 * 60 * 1000) },
  "2y": { interval: "1wk", period1: new Date(Date.now() - 760 * 24 * 60 * 60 * 1000) },
  "5y": { interval: "1mo", period1: new Date(Date.now() - 1_900 * 24 * 60 * 60 * 1000) },
  max: { interval: "1mo", period1: new Date("1980-01-01T00:00:00.000Z") },
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requireQuoteNumber(
  value: unknown,
  symbol: string,
  field: string,
): number {
  const parsed = asNumber(value);
  if (parsed != null) {
    return parsed;
  }

  throw new ServiceError(503, {
    error: "upstream_unavailable",
    provider: "yfinance",
    ticker: symbol,
    detail: `Missing required quote field: ${field}`,
  });
}

function mapProviderError(error: unknown, symbol: string): ServiceError {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("no data") ||
    normalizedMessage.includes("symbol may be delisted") ||
    normalizedMessage.includes("not found")
  ) {
    return new ServiceError(404, {
      error: "invalid_ticker",
      ticker: symbol,
    });
  }

  return new ServiceError(503, {
    error: "upstream_unavailable",
    provider: "yfinance",
    detail: message,
  });
}

async function fetchQuote(symbol: string) {
  const providerSymbol = toProviderSymbol(symbol);
  try {
    return await yahooFinance.quote(providerSymbol);
  } catch (error) {
    throw mapProviderError(error, symbol);
  }
}

async function fetchQuoteSummary(symbol: string) {
  const providerSymbol = toProviderSymbol(symbol);
  try {
    return await yahooFinance.quoteSummary(providerSymbol, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData"],
    });
  } catch (error) {
    throw mapProviderError(error, symbol);
  }
}

async function fetchChart(symbol: string, period: PeriodType) {
  const config = PERIOD_CONFIG[period];
  const providerSymbol = toProviderSymbol(symbol);

  try {
    return await yahooFinance.chart(providerSymbol, {
      period1: config.period1,
      interval: config.interval,
    });
  } catch (error) {
    throw mapProviderError(error, symbol);
  }
}

export function buildOverview(
  quote: Awaited<ReturnType<typeof fetchQuote>>,
  symbol: string,
): TickerOverview {
  const current = requireQuoteNumber(
    quote.regularMarketPrice,
    symbol,
    "regularMarketPrice",
  );
  const previous = requireQuoteNumber(
    quote.regularMarketPreviousClose,
    symbol,
    "regularMarketPreviousClose",
  );
  const volume = requireQuoteNumber(
    quote.regularMarketVolume,
    symbol,
    "regularMarketVolume",
  );

  if (current === 0 && previous === 0) {
    throw new ServiceError(404, {
      error: "invalid_ticker",
      ticker: symbol,
    });
  }

  const change = current - previous;
  const changePercent = previous === 0 ? 0 : (change / previous) * 100;

  return {
    symbol,
    name: quote.shortName ?? quote.longName ?? symbol,
    currency: quote.currency ?? "USD",
    exchange: quote.fullExchangeName ?? quote.exchange ?? "",
    current_price: current,
    previous_close: previous,
    change: Number(change.toFixed(4)),
    change_percent: Number(changePercent.toFixed(4)),
    volume,
    market_cap: asNumber(quote.marketCap),
    fifty_two_week_high: asNumber(quote.fiftyTwoWeekHigh),
    fifty_two_week_low: asNumber(quote.fiftyTwoWeekLow),
    data_status: "complete",
  };
}

function buildFundamentals(
  summary: Awaited<ReturnType<typeof fetchQuoteSummary>>,
): Fundamentals {
  return {
    pe_ratio: asNumber(summary.summaryDetail?.trailingPE),
    forward_pe: asNumber(summary.summaryDetail?.forwardPE),
    eps: asNumber(summary.defaultKeyStatistics?.trailingEps),
    revenue: asNumber(summary.financialData?.totalRevenue),
    ebitda: asNumber(summary.financialData?.ebitda),
    gross_margin: asNumber(summary.financialData?.grossMargins),
    operating_margin: asNumber(summary.financialData?.operatingMargins),
    profit_margin: asNumber(summary.financialData?.profitMargins),
    debt_to_equity: asNumber(summary.financialData?.debtToEquity),
    return_on_equity: asNumber(summary.financialData?.returnOnEquity),
    dividend_yield: asNumber(summary.summaryDetail?.dividendYield),
  };
}

function buildHistory(
  chart: Awaited<ReturnType<typeof fetchChart>>,
): PricePoint[] {
  return (chart.quotes ?? [])
    .flatMap((point) => {
      if (
        point.date == null ||
        point.open == null ||
        point.high == null ||
        point.low == null ||
        point.close == null ||
        point.volume == null
      ) {
        return [];
      }

      return [
        {
          date: Math.floor(point.date.getTime() / 1000),
          open: Number(point.open.toFixed(4)),
          high: Number(point.high.toFixed(4)),
          low: Number(point.low.toFixed(4)),
          close: Number(point.close.toFixed(4)),
          volume: Math.trunc(point.volume),
        } satisfies PricePoint,
      ];
    });
}

export async function getTickerOverview(symbol: string): Promise<TickerOverview> {
  const normalized = normalizeDashboardSymbol(symbol);
  return buildOverview(await fetchQuote(normalized), normalized);
}

export async function getFundamentals(symbol: string): Promise<Fundamentals> {
  const normalized = normalizeDashboardSymbol(symbol);
  return buildFundamentals(await fetchQuoteSummary(normalized));
}

export async function getDividendYield(symbol: string): Promise<number | null> {
  const fundamentals = await getFundamentals(symbol);
  return fundamentals.dividend_yield;
}

export async function getPriceHistory(
  symbol: string,
  period: PeriodType = "1mo",
): Promise<PricePoint[]> {
  const normalized = normalizeDashboardSymbol(symbol);
  return buildHistory(await fetchChart(normalized, period));
}

export async function getMarketData(
  symbol: string,
  period: PeriodType = "1mo",
): Promise<MarketResponse> {
  const normalized = normalizeDashboardSymbol(symbol);
  const [quote, summary, chart] = await Promise.all([
    fetchQuote(normalized),
    fetchQuoteSummary(normalized),
    fetchChart(normalized, period),
  ]);

  return {
    overview: buildOverview(quote, normalized),
    fundamentals: buildFundamentals(summary),
    price_history: buildHistory(chart),
  };
}
