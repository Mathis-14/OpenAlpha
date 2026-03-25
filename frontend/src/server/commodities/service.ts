import YahooFinance from "yahoo-finance2";
import {
  getCommodityMeta,
  getCommoditySourceId,
  isCommodityInstrument,
  SUPPORTED_COMMODITIES,
} from "@/lib/commodities";
import type {
  CommodityDiscoveryItem,
  CommodityInstrumentSlug,
  CommodityOverview,
  CommodityRange,
  PricePoint,
} from "@/types/api";
import { ServiceError } from "@/server/shared/errors";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_REVALIDATE_SECONDS = 3600;

const PERIOD_CONFIG: Record<
  CommodityRange,
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

type FredObservation = {
  date: string;
  value: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

type FredDataPoint = {
  date: string;
  value: number;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseFredValue(rawValue: string): number | null {
  if (!rawValue || rawValue.trim() === ".") {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function getFredApiKey(): string {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) {
    throw new ServiceError(500, {
      error: "server_misconfigured",
      detail: "FRED_API_KEY is not configured",
    });
  }
  return key;
}

function mapProviderError(error: unknown, instrument: string): ServiceError {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("no data") ||
    normalizedMessage.includes("symbol may be delisted") ||
    normalizedMessage.includes("not found")
  ) {
    return new ServiceError(404, {
      error: "invalid_commodity",
      instrument,
    });
  }

  return new ServiceError(503, {
    error: "upstream_unavailable",
    provider: "yfinance",
    detail: message,
  });
}

export function parseCommodityInstrument(
  value: string | null | undefined,
): CommodityInstrumentSlug {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (isCommodityInstrument(normalized)) {
    return normalized;
  }

  throw new ServiceError(404, {
    error: "invalid_commodity",
    detail: `Unsupported commodity instrument: ${value ?? ""}`,
  });
}

async function fetchYahooQuote(instrument: CommodityInstrumentSlug) {
  const meta = getCommodityMeta(instrument);
  if (meta.source.kind !== "yahoo") {
    return null;
  }

  try {
    return await yahooFinance.quote(meta.source.symbol);
  } catch (error) {
    throw mapProviderError(error, instrument);
  }
}

async function fetchYahooChart(
  instrument: CommodityInstrumentSlug,
  range: CommodityRange,
) {
  const meta = getCommodityMeta(instrument);
  if (meta.source.kind !== "yahoo") {
    return null;
  }

  const config = PERIOD_CONFIG[range];

  try {
    return await yahooFinance.chart(meta.source.symbol, {
      period1: config.period1,
      interval: config.interval,
    });
  } catch (error) {
    throw mapProviderError(error, instrument);
  }
}

async function fetchFredSeries(instrument: CommodityInstrumentSlug): Promise<FredDataPoint[]> {
  const meta = getCommodityMeta(instrument);
  if (meta.source.kind !== "fred") {
    return [];
  }

  const url = new URL(FRED_API_BASE);
  url.searchParams.set("series_id", meta.source.seriesId);
  url.searchParams.set("api_key", getFredApiKey());
  url.searchParams.set("file_type", "json");

  let response: Response;
  try {
    response = await fetch(url, {
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
    });
  }

  if (!response.ok) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
    });
  }

  const payload = (await response.json()) as FredResponse;
  const history = (payload.observations ?? [])
    .map((observation) => {
      const value = parseFredValue(observation.value);
      if (value == null) {
        return null;
      }

      return {
        date: observation.date,
        value,
      } satisfies FredDataPoint;
    })
    .filter((point): point is FredDataPoint => point != null);

  if (history.length === 0) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: `No observations for ${meta.source.seriesId}`,
    });
  }

  return history;
}

function buildYahooHistory(
  chart: NonNullable<Awaited<ReturnType<typeof fetchYahooChart>>>,
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

function filterFredHistoryForRange(
  history: FredDataPoint[],
  range: CommodityRange,
): FredDataPoint[] {
  if (range === "max" || history.length === 0) {
    return history;
  }

  const period1 = PERIOD_CONFIG[range].period1;
  const filtered = history.filter((point) => new Date(point.date) >= period1);
  return filtered.length > 0 ? filtered : history.slice(-Math.min(history.length, 12));
}

function buildFredHistory(history: FredDataPoint[]): PricePoint[] {
  return history.map((point) => ({
    date: Math.floor(new Date(point.date).getTime() / 1000),
    open: point.value,
    high: point.value,
    low: point.value,
    close: point.value,
    volume: 0,
  }));
}

function buildYahooOverview(
  instrument: CommodityInstrumentSlug,
  quote: NonNullable<Awaited<ReturnType<typeof fetchYahooQuote>>>,
): CommodityOverview {
  const meta = getCommodityMeta(instrument);
  const current = asNumber(quote.regularMarketPrice) ?? 0;
  const previous = asNumber(quote.regularMarketPreviousClose) ?? 0;

  if (current === 0 && previous === 0) {
    throw new ServiceError(404, {
      error: "invalid_commodity",
      instrument,
    });
  }

  const change = current - previous;
  const changePercent = previous === 0 ? 0 : (change / previous) * 100;

  return {
    instrument,
    name: meta.name,
    short_label: meta.short_label,
    description: meta.description,
    category: meta.category,
    unit_label: meta.unit_label,
    exchange_label: quote.fullExchangeName ?? meta.exchange_label,
    source_label: meta.source_label,
    provider_symbol: getCommoditySourceId(instrument),
    currency: quote.currency ?? "USD",
    current_price: current,
    previous_close: previous,
    change: Number(change.toFixed(4)),
    change_percent: Number(changePercent.toFixed(4)),
    volume: asNumber(quote.regularMarketVolume),
    open_interest: asNumber(quote.openInterest),
    day_high: asNumber(quote.regularMarketDayHigh),
    day_low: asNumber(quote.regularMarketDayLow),
    fifty_two_week_high: asNumber(quote.fiftyTwoWeekHigh),
    fifty_two_week_low: asNumber(quote.fiftyTwoWeekLow),
    market_state: typeof quote.marketState === "string" ? quote.marketState : null,
  };
}

function buildFredOverview(
  instrument: CommodityInstrumentSlug,
  history: FredDataPoint[],
): CommodityOverview {
  const meta = getCommodityMeta(instrument);
  const latest = history[history.length - 1];
  const previous = history[history.length - 2] ?? latest;
  const oneYearCutoff = new Date(latest.date);
  oneYearCutoff.setDate(oneYearCutoff.getDate() - 365);
  const oneYearHistory = history.filter((point) => new Date(point.date) >= oneYearCutoff);
  const referenceHistory = oneYearHistory.length > 0 ? oneYearHistory : history;
  const values = referenceHistory.map((point) => point.value);
  const change = latest.value - previous.value;
  const changePercent = previous.value === 0 ? 0 : (change / previous.value) * 100;

  return {
    instrument,
    name: meta.name,
    short_label: meta.short_label,
    description: meta.description,
    category: meta.category,
    unit_label: meta.unit_label,
    exchange_label: meta.exchange_label,
    source_label: meta.source_label,
    provider_symbol: getCommoditySourceId(instrument),
    currency: "USD",
    current_price: latest.value,
    previous_close: previous.value,
    change: Number(change.toFixed(4)),
    change_percent: Number(changePercent.toFixed(4)),
    volume: null,
    open_interest: null,
    day_high: null,
    day_low: null,
    fifty_two_week_high: values.length > 0 ? Math.max(...values) : null,
    fifty_two_week_low: values.length > 0 ? Math.min(...values) : null,
    market_state: "REFERENCE",
  };
}

export function getSupportedCommodityInstruments(): CommodityDiscoveryItem[] {
  return SUPPORTED_COMMODITIES.map((item) => ({
    instrument: item.instrument,
    name: item.name,
    short_label: item.short_label,
    description: item.description,
    category: item.category,
    unit_label: item.unit_label,
    exchange_label: item.exchange_label,
    source_label: item.source_label,
  }));
}

export async function getCommodityOverview(
  instrument: CommodityInstrumentSlug,
): Promise<CommodityOverview> {
  const meta = getCommodityMeta(instrument);
  if (meta.source.kind === "yahoo") {
    const quote = await fetchYahooQuote(instrument);
    if (!quote) {
      throw new ServiceError(503, { error: "upstream_unavailable", provider: "yfinance" });
    }
    return buildYahooOverview(instrument, quote);
  }

  const history = await fetchFredSeries(instrument);
  return buildFredOverview(instrument, history);
}

export async function getCommodityPriceHistory(
  instrument: CommodityInstrumentSlug,
  range: CommodityRange = "1mo",
): Promise<PricePoint[]> {
  const meta = getCommodityMeta(instrument);
  if (meta.source.kind === "yahoo") {
    const chart = await fetchYahooChart(instrument, range);
    if (!chart) {
      throw new ServiceError(503, { error: "upstream_unavailable", provider: "yfinance" });
    }
    return buildYahooHistory(chart);
  }

  const history = await fetchFredSeries(instrument);
  return buildFredHistory(filterFredHistoryForRange(history, range));
}

export async function getCommodityMarketData(
  instrument: CommodityInstrumentSlug,
  range: CommodityRange = "1mo",
): Promise<{ overview: CommodityOverview; price_history: PricePoint[] }> {
  const meta = getCommodityMeta(instrument);

  if (meta.source.kind === "yahoo") {
    const [quote, chart] = await Promise.all([
      fetchYahooQuote(instrument),
      fetchYahooChart(instrument, range),
    ]);

    if (!quote || !chart) {
      throw new ServiceError(503, {
        error: "upstream_unavailable",
        provider: "yfinance",
      });
    }

    return {
      overview: buildYahooOverview(instrument, quote),
      price_history: buildYahooHistory(chart),
    };
  }

  const history = await fetchFredSeries(instrument);
  return {
    overview: buildFredOverview(instrument, history),
    price_history: buildFredHistory(filterFredHistoryForRange(history, range)),
  };
}
