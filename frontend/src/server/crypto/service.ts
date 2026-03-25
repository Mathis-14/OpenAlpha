import type {
  CryptoDiscoveryItem,
  CryptoInstrument,
  CryptoOverview,
  CryptoRange,
  PricePoint,
} from "@/types/api";
import { getCryptoMarketMeta } from "@/lib/crypto";
import { ServiceError } from "@/server/shared/errors";

const DERIBIT_API_BASE = "https://www.deribit.com/api/v2/public";
const METADATA_REVALIDATE_SECONDS = 3600;
const MARKET_REVALIDATE_SECONDS = 30;
const HISTORY_REVALIDATE_SECONDS = 30;

const SUPPORTED_INSTRUMENTS = [
  "BTC-PERPETUAL",
  "ETH-PERPETUAL",
] as const satisfies readonly CryptoInstrument[];

const RANGE_CONFIG: Record<
  CryptoRange,
  { resolution: string; lookbackMs: number | null }
> = {
  "1d": { resolution: "30", lookbackMs: 36 * 60 * 60 * 1000 },
  "1w": { resolution: "60", lookbackMs: 8 * 24 * 60 * 60 * 1000 },
  "1mo": { resolution: "360", lookbackMs: 35 * 24 * 60 * 60 * 1000 },
  "3mo": { resolution: "720", lookbackMs: 100 * 24 * 60 * 60 * 1000 },
  "1y": { resolution: "1D", lookbackMs: 380 * 24 * 60 * 60 * 1000 },
  max: { resolution: "1D", lookbackMs: null },
};

type DeribitEnvelope<T> = {
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
};

type DeribitInstrumentPayload = {
  instrument_name?: string;
  base_currency?: string;
  quote_currency?: string;
  settlement_currency?: string;
  price_index?: string;
  is_active?: boolean;
  state?: string;
  instrument_type?: string;
  settlement_period?: string;
  contract_size?: number;
  tick_size?: number;
  min_trade_amount?: number;
  max_leverage?: number;
  maker_commission?: number;
  taker_commission?: number;
  creation_timestamp?: number;
  expiration_timestamp?: number;
};

type DeribitTickerPayload = {
  instrument_name?: string;
  state?: string;
  last_price?: number;
  mark_price?: number;
  index_price?: number;
  best_bid_price?: number;
  best_ask_price?: number;
  open_interest?: number;
  current_funding?: number;
  funding_8h?: number;
  stats?: {
    volume?: number;
    volume_usd?: number;
    price_change?: number;
    high?: number;
    low?: number;
  };
};

type DeribitChartPayload = {
  status?: string;
  ticks?: number[];
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCryptoInstrument(value: string): value is CryptoInstrument {
  return (SUPPORTED_INSTRUMENTS as readonly string[]).includes(value);
}

function mapDeribitError(
  error: unknown,
  detail?: string,
): ServiceError {
  return new ServiceError(503, {
    error: "upstream_unavailable",
    provider: "deribit",
    detail:
      detail ??
      (error instanceof Error ? error.message : "Deribit request failed"),
  });
}

async function fetchDeribit<T>(
  method: string,
  params: Record<string, string | number | boolean>,
  revalidate: number,
): Promise<T> {
  const url = new URL(`${DERIBIT_API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw mapDeribitError(error);
  }

  if (!response.ok) {
    throw mapDeribitError(null, `Deribit responded with ${response.status}`);
  }

  const payload = (await response.json()) as DeribitEnvelope<T>;
  if (payload.error) {
    throw mapDeribitError(
      null,
      payload.error.message ?? "Deribit returned an error payload",
    );
  }

  if (payload.result == null) {
    throw mapDeribitError(null, "Deribit returned no result");
  }

  return payload.result;
}

async function getDeribitInstruments(): Promise<DeribitInstrumentPayload[]> {
  return fetchDeribit<DeribitInstrumentPayload[]>(
    "get_instruments",
    {
      currency: "any",
      kind: "future",
      expired: false,
    },
    METADATA_REVALIDATE_SECONDS,
  );
}

async function getInstrumentMetadata(
  instrument: CryptoInstrument,
): Promise<DeribitInstrumentPayload> {
  const instruments = await getDeribitInstruments();
  const match = instruments.find(
    (item) => item.instrument_name === instrument,
  );

  if (!match) {
    throw new ServiceError(404, {
      error: "invalid_instrument",
      detail: `Unsupported crypto instrument: ${instrument}`,
    });
  }

  return match;
}

async function getTickerPayload(
  instrument: CryptoInstrument,
): Promise<DeribitTickerPayload> {
  return fetchDeribit<DeribitTickerPayload>(
    "ticker",
    { instrument_name: instrument },
    MARKET_REVALIDATE_SECONDS,
  );
}

function mapChartPoint(
  payload: DeribitChartPayload,
  index: number,
): PricePoint | null {
  const timestamp = payload.ticks?.[index];
  const open = payload.open?.[index];
  const high = payload.high?.[index];
  const low = payload.low?.[index];
  const close = payload.close?.[index];
  const volume = payload.volume?.[index];

  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  return {
    date: Math.floor((timestamp as number) / 1000),
    open: Number((open as number).toFixed(4)),
    high: Number((high as number).toFixed(4)),
    low: Number((low as number).toFixed(4)),
    close: Number((close as number).toFixed(4)),
    volume: Number((volume as number).toFixed(6)),
  };
}

export function parseCryptoInstrument(value: string | null | undefined): CryptoInstrument {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (isCryptoInstrument(normalized)) {
    return normalized;
  }

  throw new ServiceError(404, {
    error: "invalid_instrument",
    detail: `Unsupported crypto instrument: ${value ?? ""}`,
  });
}

export function parseCryptoRange(value: string | null): CryptoRange {
  if (
    value === "1d" ||
    value === "1w" ||
    value === "1mo" ||
    value === "3mo" ||
    value === "1y" ||
    value === "max"
  ) {
    return value;
  }

  return "1mo";
}

export function coerceCryptoInstrument(value: unknown): CryptoInstrument | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (isCryptoInstrument(normalized)) {
    return normalized;
  }

  if (normalized === "BTC" || normalized === "BITCOIN") {
    return "BTC-PERPETUAL";
  }

  if (normalized === "ETH" || normalized === "ETHEREUM") {
    return "ETH-PERPETUAL";
  }

  return null;
}

function buildCryptoOverview(
  instrument: CryptoInstrument,
  metadata: DeribitInstrumentPayload,
  ticker: DeribitTickerPayload,
): CryptoOverview {
  const meta = getCryptoMarketMeta(instrument);

  return {
    instrument,
    name: meta.name,
    description: `${meta.name} perpetual on Deribit`,
    base_currency: metadata.base_currency ?? instrument.split("-")[0],
    quote_currency: metadata.quote_currency ?? "USD",
    settlement_currency:
      metadata.settlement_currency ?? metadata.base_currency ?? "USD",
    price_index: metadata.price_index ?? "—",
    status:
      metadata.state ??
      ticker.state ??
      (metadata.is_active ? "open" : "inactive"),
    instrument_type: metadata.instrument_type ?? "future",
    settlement_period: metadata.settlement_period ?? "perpetual",
    contract_size: asNumber(metadata.contract_size),
    tick_size: asNumber(metadata.tick_size),
    min_trade_amount: asNumber(metadata.min_trade_amount),
    max_leverage: asNumber(metadata.max_leverage),
    maker_commission: asNumber(metadata.maker_commission),
    taker_commission: asNumber(metadata.taker_commission),
    creation_timestamp: asNumber(metadata.creation_timestamp),
    expiration_timestamp: asNumber(metadata.expiration_timestamp),
    last_price: asNumber(ticker.last_price) ?? 0,
    mark_price: asNumber(ticker.mark_price) ?? 0,
    index_price: asNumber(ticker.index_price),
    best_bid_price: asNumber(ticker.best_bid_price),
    best_ask_price: asNumber(ticker.best_ask_price),
    high_24h: asNumber(ticker.stats?.high),
    low_24h: asNumber(ticker.stats?.low),
    change_24h: asNumber(ticker.stats?.price_change),
    volume_24h: asNumber(ticker.stats?.volume),
    volume_notional_24h: asNumber(ticker.stats?.volume_usd),
    open_interest: asNumber(ticker.open_interest),
    funding_8h: asNumber(ticker.funding_8h),
    current_funding: asNumber(ticker.current_funding),
  };
}

export async function getCryptoOverview(
  instrument: CryptoInstrument,
): Promise<CryptoOverview> {
  const [metadata, ticker] = await Promise.all([
    getInstrumentMetadata(instrument),
    getTickerPayload(instrument),
  ]);

  return buildCryptoOverview(instrument, metadata, ticker);
}

export async function getSupportedCryptoInstruments(): Promise<
  CryptoDiscoveryItem[]
> {
  const overviews = await Promise.all(
    SUPPORTED_INSTRUMENTS.map((instrument) => getCryptoOverview(instrument)),
  );

  return overviews.map((overview) => ({
    instrument: overview.instrument,
    name: overview.name,
    description: overview.description,
    base_currency: overview.base_currency,
    quote_currency: overview.quote_currency,
    last_price: overview.last_price,
    mark_price: overview.mark_price,
    change_24h: overview.change_24h,
    volume_24h: overview.volume_24h,
    open_interest: overview.open_interest,
    status: overview.status,
  }));
}

export async function getCryptoPriceHistory(
  instrument: CryptoInstrument,
  range: CryptoRange = "1mo",
): Promise<PricePoint[]> {
  const metadata = await getInstrumentMetadata(instrument);
  const config = RANGE_CONFIG[range];
  const endTimestamp = Date.now();
  const startTimestamp =
    config.lookbackMs == null
      ? Math.max(
          0,
          asNumber(metadata.creation_timestamp) ?? endTimestamp - 365 * 24 * 60 * 60 * 1000,
        )
      : endTimestamp - config.lookbackMs;

  const payload = await fetchDeribit<DeribitChartPayload>(
    "get_tradingview_chart_data",
    {
      instrument_name: instrument,
      start_timestamp: Math.floor(startTimestamp),
      end_timestamp: Math.floor(endTimestamp),
      resolution: config.resolution,
    },
    HISTORY_REVALIDATE_SECONDS,
  );

  const ticks = payload.ticks ?? [];
  return ticks
    .map((_, index) => mapChartPoint(payload, index))
    .filter((point): point is PricePoint => point != null);
}

export async function getCryptoMarketData(
  instrument: CryptoInstrument,
  range: CryptoRange = "1mo",
): Promise<{ overview: CryptoOverview; price_history: PricePoint[] }> {
  const [overview, priceHistory] = await Promise.all([
    getCryptoOverview(instrument),
    getCryptoPriceHistory(instrument, range),
  ]);

  return {
    overview,
    price_history: priceHistory,
  };
}
