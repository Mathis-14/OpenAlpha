import YahooFinance from "yahoo-finance2";
import type {
  CryptoInstrument,
  DataAssetClass,
  DataExportQuery,
  MacroCountry,
  MacroIndicatorSlug,
  PricePoint,
} from "@/types/api";
import { getCommodityMeta } from "@/lib/commodities";
import { ServiceError } from "@/server/shared/errors";
import { parseCommodityInstrument } from "@/server/commodities/service";
import { parseCryptoInstrument } from "@/server/crypto/service";
import {
  parseMacroCountry,
  parseMacroIndicatorSlug,
} from "@/server/macro/service";
import { normalizeDashboardSymbol, toProviderSymbol } from "@/server/market/symbols";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const DERIBIT_API_BASE = "https://www.deribit.com/api/v2/public";
const FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations";
const MAX_EXPORT_ROWS = 20_000;

type CsvExport = {
  filename: string;
  csv: string;
};

type RowValue = string | number | null;

type MacroSeriesConfig = {
  seriesId: string;
  name: string;
};

type DeribitEnvelope<T> = {
  result?: T;
  error?: {
    message?: string;
  };
};

type DeribitChartPayload = {
  ticks?: number[];
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
};

type FredObservation = {
  date: string;
  value: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

const MACRO_EXPORT_CONFIG: Record<
  MacroCountry,
  Record<MacroIndicatorSlug, MacroSeriesConfig>
> = {
  us: {
    "fed-funds": { seriesId: "FEDFUNDS", name: "fed-funds" },
    cpi: { seriesId: "CPIAUCSL", name: "cpi" },
    "gdp-growth": { seriesId: "USAGDPRQPSMEI", name: "gdp-growth" },
    "treasury-10y": { seriesId: "DGS10", name: "treasury-10y" },
    unemployment: { seriesId: "UNRATE", name: "unemployment" },
  },
  fr: {
    "fed-funds": { seriesId: "ECBDFR", name: "fed-funds" },
    cpi: { seriesId: "CP0000FRM086NEST", name: "cpi" },
    "gdp-growth": { seriesId: "FRAGDPRQPSMEI", name: "gdp-growth" },
    "treasury-10y": { seriesId: "IRLTLT01FRM156N", name: "treasury-10y" },
    unemployment: { seriesId: "LRHUADTTFRM156S", name: "unemployment" },
  },
};

function ensureFredApiKey(): string {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) {
    throw new ServiceError(500, {
      error: "server_misconfigured",
      detail: "FRED_API_KEY is not configured",
    });
  }
  return key;
}

function parseFredValue(rawValue: string): number | null {
  if (!rawValue || rawValue.trim() === ".") {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(raw: string, field: "start_date" | "end_date"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ServiceError(422, {
      error: "invalid_date",
      detail: `${field} must use yyyy-mm-dd format`,
    });
  }

  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(422, {
      error: "invalid_date",
      detail: `${field} is invalid`,
    });
  }

  return date;
}

function validateDateRange(startDateRaw: string, endDateRaw: string): {
  startDate: Date;
  endDate: Date;
} {
  const startDate = parseDateInput(startDateRaw, "start_date");
  const endDate = parseDateInput(endDateRaw, "end_date");
  const today = new Date(`${toDateInput(new Date())}T00:00:00.000Z`);

  if (startDate > endDate) {
    throw new ServiceError(422, {
      error: "invalid_date_range",
      detail: "start_date must be before or equal to end_date",
    });
  }

  if (startDate > today || endDate > today) {
    throw new ServiceError(422, {
      error: "invalid_date_range",
      detail: "future dates are not supported",
    });
  }

  return { startDate, endDate };
}

function addOneDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function endOfDayTimestamp(date: Date): number {
  return new Date(`${toDateInput(date)}T23:59:59.999Z`).getTime();
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeCsvCell(value: RowValue): string {
  if (value == null) {
    return "";
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function rowsToCsv(
  headers: string[],
  rows: RowValue[][],
): string {
  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

function assertRowCount(rows: RowValue[][]): void {
  if (rows.length > MAX_EXPORT_ROWS) {
    throw new ServiceError(422, {
      error: "too_many_rows",
      detail: `Export exceeds ${MAX_EXPORT_ROWS} rows. Narrow the date range and try again.`,
    });
  }
}

function mapYahooError(error: unknown, symbol: string): ServiceError {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("no data") ||
    normalizedMessage.includes("symbol may be delisted") ||
    normalizedMessage.includes("not found")
  ) {
    return new ServiceError(404, {
      error: "invalid_asset",
      detail: `Unsupported or invalid asset: ${symbol}`,
    });
  }

  return new ServiceError(503, {
    error: "upstream_unavailable",
    provider: "yfinance",
    detail: message,
  });
}

async function fetchYahooHistory(
  providerSymbol: string,
  displaySymbol: string,
  startDate: Date,
  endDate: Date,
): Promise<PricePoint[]> {
  let chart: { quotes?: Array<{
    date?: Date | null;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }> };
  try {
    chart = (await yahooFinance.chart(providerSymbol, {
      period1: startDate,
      period2: addOneDay(endDate),
      interval: "1d",
    })) as typeof chart;
  } catch (error) {
    throw mapYahooError(error, displaySymbol);
  }

  const startTimestamp = startDate.getTime();
  const endTimestamp = endOfDayTimestamp(endDate);

  const history = (chart.quotes ?? [])
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
          volume: Number(point.volume),
        } satisfies PricePoint,
      ];
    })
    .filter((point) => {
      const timestamp = point.date * 1000;
      return timestamp >= startTimestamp && timestamp <= endTimestamp;
    })
    .sort((a: PricePoint, b: PricePoint) => a.date - b.date);

  if (history.length === 0) {
    throw new ServiceError(422, {
      error: "no_data_in_range",
      detail: `No rows were available for ${displaySymbol} in the selected date range.`,
    });
  }

  return history;
}

async function fetchDeribitChart(
  instrument: CryptoInstrument,
  startDate: Date,
  endDate: Date,
): Promise<PricePoint[]> {
  const startTimestamp = startDate.getTime();
  const endTimestamp = endOfDayTimestamp(endDate);
  const url = new URL(`${DERIBIT_API_BASE}/get_tradingview_chart_data`);
  url.searchParams.set("instrument_name", instrument);
  url.searchParams.set("start_timestamp", String(startTimestamp));
  url.searchParams.set("end_timestamp", String(endTimestamp));
  url.searchParams.set("resolution", "1D");

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "deribit",
      detail: error instanceof Error ? error.message : "Deribit request failed",
    });
  }

  if (!response.ok) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "deribit",
      detail: `Deribit responded with ${response.status}`,
    });
  }

  const payload = (await response.json()) as DeribitEnvelope<DeribitChartPayload>;
  if (payload.error || !payload.result) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "deribit",
      detail: payload.error?.message ?? "Deribit returned no result",
    });
  }

  const chart = payload.result;
  const history = (chart.ticks ?? [])
    .map((tick, index) => {
      const open = chart.open?.[index];
      const high = chart.high?.[index];
      const low = chart.low?.[index];
      const close = chart.close?.[index];
      const volume = chart.volume?.[index];

      if (
        !Number.isFinite(tick) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(volume)
      ) {
        return null;
      }

      return {
        date: Math.floor((tick as number) / 1000),
        open: Number((open as number).toFixed(4)),
        high: Number((high as number).toFixed(4)),
        low: Number((low as number).toFixed(4)),
        close: Number((close as number).toFixed(4)),
        volume: Number((volume as number).toFixed(6)),
      } satisfies PricePoint;
    })
    .filter((point): point is PricePoint => point != null)
    .filter((point) => {
      const timestamp = point.date * 1000;
      return timestamp >= startTimestamp && timestamp <= endTimestamp;
    });

  if (history.length === 0) {
    throw new ServiceError(422, {
      error: "no_data_in_range",
      detail: `No rows were available for ${instrument} in the selected date range.`,
    });
  }

  return history;
}

async function fetchFredSeries(
  seriesId: string,
  startDate: Date,
  endDate: Date,
): Promise<Array<{ date: string; value: number }>> {
  const url = new URL(FRED_API_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", ensureFredApiKey());
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", toDateInput(startDate));
  url.searchParams.set("observation_end", toDateInput(endDate));

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
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
  const rows = (payload.observations ?? [])
    .map((observation) => {
      const value = parseFredValue(observation.value);
      if (value == null) {
        return null;
      }

      return {
        date: observation.date,
        value,
      };
    })
    .filter((row): row is { date: string; value: number } => row != null);

  if (rows.length === 0) {
    throw new ServiceError(422, {
      error: "no_data_in_range",
      detail: `No rows were available for ${seriesId} in the selected date range.`,
    });
  }

  return rows;
}

function formatPriceRows(history: PricePoint[]): RowValue[][] {
  return history.map((point) => [
    toDateInput(new Date(point.date * 1000)),
    point.open,
    point.high,
    point.low,
    point.close,
    point.volume,
  ]);
}

function buildFilename(
  assetClass: DataAssetClass,
  asset: string,
  startDate: string,
  endDate: string,
  country?: MacroCountry,
): string {
  const parts: string[] = [assetClass];
  if (country) {
    parts.push(country);
  }
  parts.push(asset);
  parts.push(startDate);
  parts.push("to");
  parts.push(endDate);
  return `${parts.map(sanitizeFilenamePart).filter(Boolean).join("-")}.csv`;
}

async function exportStockData(query: DataExportQuery, startDate: Date, endDate: Date): Promise<CsvExport> {
  const symbol = normalizeDashboardSymbol(query.asset);
  const history = await fetchYahooHistory(
    toProviderSymbol(symbol),
    symbol,
    startDate,
    endDate,
  );
  const rows = formatPriceRows(history);
  assertRowCount(rows);

  return {
    filename: buildFilename("stock", symbol, query.start_date, query.end_date),
    csv: rowsToCsv(["date", "open", "high", "low", "close", "volume"], rows),
  };
}

async function exportCryptoData(query: DataExportQuery, startDate: Date, endDate: Date): Promise<CsvExport> {
  const instrument = parseCryptoInstrument(query.asset);
  const history = await fetchDeribitChart(instrument, startDate, endDate);
  const rows = formatPriceRows(history);
  assertRowCount(rows);

  return {
    filename: buildFilename("crypto", instrument, query.start_date, query.end_date),
    csv: rowsToCsv(["date", "open", "high", "low", "close", "volume"], rows),
  };
}

async function exportMacroData(query: DataExportQuery, startDate: Date, endDate: Date): Promise<CsvExport> {
  const country = parseMacroCountry(query.country ?? null);
  const indicator = parseMacroIndicatorSlug(query.asset);
  const config = MACRO_EXPORT_CONFIG[country][indicator];
  const rows = await fetchFredSeries(config.seriesId, startDate, endDate);
  const csvRows = rows.map((row) => [row.date, row.value] satisfies RowValue[]);
  assertRowCount(csvRows);

  return {
    filename: buildFilename(
      "macro",
      config.name,
      query.start_date,
      query.end_date,
      country,
    ),
    csv: rowsToCsv(["date", "value"], csvRows),
  };
}

async function exportCommodityData(query: DataExportQuery, startDate: Date, endDate: Date): Promise<CsvExport> {
  const instrument = parseCommodityInstrument(query.asset);
  const meta = getCommodityMeta(instrument);

  if (meta.source.kind === "fred") {
    const rows = await fetchFredSeries(meta.source.seriesId, startDate, endDate);
    const csvRows = rows.map((row) => [row.date, row.value] satisfies RowValue[]);
    assertRowCount(csvRows);

    return {
      filename: buildFilename(
        "commodity",
        instrument,
        query.start_date,
        query.end_date,
      ),
      csv: rowsToCsv(["date", "value"], csvRows),
    };
  }

  const history = await fetchYahooHistory(
    meta.source.symbol,
    meta.name,
    startDate,
    endDate,
  );
  const rows = formatPriceRows(history);
  assertRowCount(rows);

  return {
    filename: buildFilename(
      "commodity",
      instrument,
      query.start_date,
      query.end_date,
    ),
    csv: rowsToCsv(["date", "open", "high", "low", "close", "volume"], rows),
  };
}

export function parseDataAssetClass(value: string | null): DataAssetClass {
  if (
    value === "stock" ||
    value === "macro" ||
    value === "commodity" ||
    value === "crypto"
  ) {
    return value;
  }

  throw new ServiceError(422, {
    error: "invalid_asset_class",
    detail: "asset_class must be stock, macro, commodity, or crypto",
  });
}

export function parseDataExportQuery(
  searchParams: URLSearchParams,
): DataExportQuery {
  const asset_class = parseDataAssetClass(searchParams.get("asset_class"));
  const asset = searchParams.get("asset")?.trim() ?? "";
  const start_date = searchParams.get("start_date")?.trim() ?? "";
  const end_date = searchParams.get("end_date")?.trim() ?? "";
  const countryParam = searchParams.get("country")?.trim() ?? undefined;

  if (!asset) {
    throw new ServiceError(422, {
      error: "invalid_asset",
      detail: "asset is required",
    });
  }

  if (!start_date || !end_date) {
    throw new ServiceError(422, {
      error: "invalid_date_range",
      detail: "start_date and end_date are required",
    });
  }

  const query: DataExportQuery = {
    asset_class,
    asset,
    start_date,
    end_date,
  };

  if (asset_class === "macro") {
    query.country = parseMacroCountry(countryParam ?? null);
  }

  return query;
}

export async function buildDataExport(
  query: DataExportQuery,
): Promise<CsvExport> {
  const { startDate, endDate } = validateDateRange(query.start_date, query.end_date);

  switch (query.asset_class) {
    case "stock":
      return exportStockData(query, startDate, endDate);
    case "crypto":
      return exportCryptoData(query, startDate, endDate);
    case "macro":
      return exportMacroData(query, startDate, endDate);
    case "commodity":
      return exportCommodityData(query, startDate, endDate);
  }
}
