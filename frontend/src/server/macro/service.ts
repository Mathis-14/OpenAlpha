import type {
  MacroCountry,
  MacroDataPoint,
  MacroHistoryRange,
  MacroIndicator,
  MacroIndicatorSlug,
  MacroSnapshot,
} from "@/types/api";

const FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_REVALIDATE_SECONDS = 3600;
const HISTORY_LIMIT = 24;
const MAX_SERIES_POINTS = 400;
const RANGE_DAYS: Record<MacroHistoryRange, number | null> = {
  "1y": 365,
  "3y": 365 * 3,
  "5y": 365 * 5,
  "10y": 365 * 10,
  max: null,
};

type SnapshotKey = keyof MacroSnapshot;
type IndicatorUnit = "%" | "index";
type SeriesConfig = {
  seriesId: string;
  name: string;
  unit: IndicatorUnit;
  snapshotKey: SnapshotKey;
};

type FredObservation = {
  date: string;
  value: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

type ErrorBody = {
  error: string;
  provider?: string;
  detail?: string;
};

const SERIES_CONFIG: Record<
  MacroCountry,
  Record<MacroIndicatorSlug, SeriesConfig>
> = {
  us: {
    "fed-funds": {
      seriesId: "FEDFUNDS",
      name: "Federal Funds Rate",
      unit: "%",
      snapshotKey: "fed_funds_rate",
    },
    cpi: {
      seriesId: "CPIAUCSL",
      name: "Consumer Price Index",
      unit: "index",
      snapshotKey: "cpi",
    },
    "gdp-growth": {
      seriesId: "USAGDPRQPSMEI",
      name: "Real GDP Growth",
      unit: "%",
      snapshotKey: "gdp_growth",
    },
    "treasury-10y": {
      seriesId: "DGS10",
      name: "10-Year Treasury Yield",
      unit: "%",
      snapshotKey: "treasury_10y",
    },
    unemployment: {
      seriesId: "UNRATE",
      name: "Unemployment Rate",
      unit: "%",
      snapshotKey: "unemployment",
    },
  },
  fr: {
    "fed-funds": {
      seriesId: "ECBDFR",
      name: "ECB Deposit Facility Rate",
      unit: "%",
      snapshotKey: "fed_funds_rate",
    },
    cpi: {
      seriesId: "CP0000FRM086NEST",
      name: "Consumer Price Index",
      unit: "index",
      snapshotKey: "cpi",
    },
    "gdp-growth": {
      seriesId: "FRAGDPRQPSMEI",
      name: "Real GDP Growth",
      unit: "%",
      snapshotKey: "gdp_growth",
    },
    "treasury-10y": {
      seriesId: "IRLTLT01FRM156N",
      name: "10-Year Government Bond Yield",
      unit: "%",
      snapshotKey: "treasury_10y",
    },
    unemployment: {
      seriesId: "LRHUADTTFRM156S",
      name: "Unemployment Rate",
      unit: "%",
      snapshotKey: "unemployment",
    },
  },
};

export class MacroServiceError extends Error {
  constructor(
    public status: number,
    public body: ErrorBody,
  ) {
    super(body.detail ?? body.error);
    this.name = "MacroServiceError";
  }
}

function getFredApiKey(): string {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) {
    throw new MacroServiceError(500, {
      error: "server_misconfigured",
      detail: "FRED_API_KEY is not configured",
    });
  }
  return key;
}

function parseObservationValue(rawValue: string): number | null {
  if (!rawValue || rawValue.trim() === ".") {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

async function fetchFredSeries(seriesId: string): Promise<MacroDataPoint[]> {
  const url = new URL(FRED_API_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", getFredApiKey());
  url.searchParams.set("file_type", "json");

  let response: Response;
  try {
    response = await fetch(url, {
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MacroServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
    });
  }

  if (!response.ok) {
    throw new MacroServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
    });
  }

  const payload = (await response.json()) as FredResponse;
  const history = (payload.observations ?? [])
    .map((observation) => {
      const value = parseObservationValue(observation.value);
      if (value == null) {
        return null;
      }

      return {
        date: observation.date,
        value,
      } satisfies MacroDataPoint;
    })
    .filter((point): point is MacroDataPoint => point != null);

  if (history.length === 0) {
    throw new MacroServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: `No observations for ${seriesId}`,
    });
  }

  return history;
}

function sliceHistoryForSnapshot(history: MacroDataPoint[]): MacroDataPoint[] {
  return history.slice(-HISTORY_LIMIT);
}

function filterHistoryForRange(
  history: MacroDataPoint[],
  range: MacroHistoryRange,
): MacroDataPoint[] {
  const rangeDays = RANGE_DAYS[range];
  if (rangeDays == null || history.length === 0) {
    return history;
  }

  const latestDate = new Date(history[history.length - 1].date);
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - rangeDays);

  const filtered = history.filter((point) => new Date(point.date) >= cutoff);
  return filtered.length > 0 ? filtered : history.slice(-1);
}

function downsampleHistory(
  history: MacroDataPoint[],
  maxPoints: number = MAX_SERIES_POINTS,
): MacroDataPoint[] {
  if (history.length <= maxPoints) {
    return history;
  }

  if (maxPoints < 2) {
    return history.slice(-1);
  }

  const step = (history.length - 1) / (maxPoints - 1);
  const indexes = new Set<number>();
  for (let index = 0; index < maxPoints; index += 1) {
    indexes.add(Math.round(index * step));
  }
  indexes.add(history.length - 1);

  return [...indexes].sort((a, b) => a - b).map((index) => history[index]);
}

function buildIndicator(
  config: SeriesConfig,
  history: MacroDataPoint[],
): MacroIndicator {
  const latest = history[history.length - 1];

  return {
    series_id: config.seriesId,
    name: config.name,
    latest_value: latest.value,
    latest_date: latest.date,
    unit: config.unit,
    history,
  };
}

function assertCountry(country: string | null): MacroCountry {
  if (country === "fr" || country === "us") {
    return country;
  }

  throw new MacroServiceError(422, {
    error: "invalid_country",
    detail: "country must be 'us' or 'fr'",
  });
}

function assertIndicatorSlug(indicator: string): MacroIndicatorSlug {
  if (
    indicator === "fed-funds" ||
    indicator === "cpi" ||
    indicator === "gdp-growth" ||
    indicator === "treasury-10y" ||
    indicator === "unemployment"
  ) {
    return indicator;
  }

  throw new MacroServiceError(422, {
    error: "invalid_indicator",
    detail: `Unsupported indicator: ${indicator}`,
  });
}

function assertHistoryRange(range: string | null): MacroHistoryRange {
  if (
    range == null ||
    range === "1y" ||
    range === "3y" ||
    range === "5y" ||
    range === "10y" ||
    range === "max"
  ) {
    return range ?? "5y";
  }

  throw new MacroServiceError(422, {
    error: "invalid_range",
    detail: `Unsupported range: ${range}`,
  });
}

export function parseMacroCountry(country: string | null): MacroCountry {
  return country == null ? "us" : assertCountry(country);
}

export function parseMacroIndicatorSlug(indicator: string): MacroIndicatorSlug {
  return assertIndicatorSlug(indicator);
}

export function parseMacroHistoryRange(range: string | null): MacroHistoryRange {
  return assertHistoryRange(range);
}

export async function getMacroSnapshotForCountry(
  country: MacroCountry,
): Promise<MacroSnapshot> {
  const entries = await Promise.all(
    Object.values(SERIES_CONFIG[country]).map(async (config) => {
      const history = await fetchFredSeries(config.seriesId);
      return [
        config.snapshotKey,
        buildIndicator(config, sliceHistoryForSnapshot(history)),
      ] as const;
    }),
  );

  const snapshot = Object.fromEntries(entries) as Record<SnapshotKey, MacroIndicator>;

  return {
    fed_funds_rate: snapshot.fed_funds_rate,
    cpi: snapshot.cpi,
    gdp_growth: snapshot.gdp_growth,
    treasury_10y: snapshot.treasury_10y,
    unemployment: snapshot.unemployment,
  };
}

export async function getMacroIndicator(
  indicator: MacroIndicatorSlug,
  range: MacroHistoryRange,
  country: MacroCountry,
): Promise<MacroIndicator> {
  const config = SERIES_CONFIG[country][indicator];
  const history = await fetchFredSeries(config.seriesId);
  return buildIndicator(
    config,
    downsampleHistory(filterHistoryForRange(history, range)),
  );
}
