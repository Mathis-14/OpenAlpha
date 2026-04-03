import { ServiceError } from "@/server/shared/errors";

const FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_REVALIDATE_SECONDS = 3600;

type FredObservation = {
  date: string;
  value: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

export type TreasuryCurveNode = {
  series_id: string;
  label: string;
  tenor_days: number;
  latest_date: string;
  rate_percent: number;
  rate_decimal: number;
  continuous_rate: number;
};

export type TreasuryCurve = {
  as_of: string | null;
  nodes: TreasuryCurveNode[];
  warnings?: string[];
};

const TREASURY_SERIES = [
  { seriesId: "DGS1MO", label: "1M", tenorDays: 30 },
  { seriesId: "DGS3MO", label: "3M", tenorDays: 91 },
  { seriesId: "DGS6MO", label: "6M", tenorDays: 182 },
  { seriesId: "DGS1", label: "1Y", tenorDays: 365 },
  { seriesId: "DGS2", label: "2Y", tenorDays: 365 * 2 },
  { seriesId: "DGS3", label: "3Y", tenorDays: 365 * 3 },
  { seriesId: "DGS5", label: "5Y", tenorDays: 365 * 5 },
  { seriesId: "DGS7", label: "7Y", tenorDays: 365 * 7 },
  { seriesId: "DGS10", label: "10Y", tenorDays: 365 * 10 },
  { seriesId: "DGS20", label: "20Y", tenorDays: 365 * 20 },
  { seriesId: "DGS30", label: "30Y", tenorDays: 365 * 30 },
] as const;

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

function parseObservationValue(rawValue: string): number | null {
  if (!rawValue || rawValue.trim() === ".") {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function toContinuousRate(rateDecimal: number): number {
  return Math.log(1 + Math.max(rateDecimal, 0));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestObservationOnce(seriesId: string): Promise<{
  latest_date: string;
  rate_percent: number;
}> {
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
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: `Unable to fetch Treasury node ${seriesId}.`,
    });
  }

  if (!response.ok) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: `FRED returned ${response.status} for ${seriesId}.`,
    });
  }

  const payload = (await response.json()) as FredResponse;
  const latest = [...(payload.observations ?? [])]
    .reverse()
    .find((observation) => parseObservationValue(observation.value) != null);

  if (!latest) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: `No usable Treasury observations for ${seriesId}.`,
    });
  }

  return {
    latest_date: latest.date,
    rate_percent: parseObservationValue(latest.value)!,
  };
}

async function fetchLatestObservation(seriesId: string): Promise<{
  latest_date: string;
  rate_percent: number;
}> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchLatestObservationOnce(seriesId);
    } catch (error) {
      lastError = error;

      const shouldRetry =
        error instanceof ServiceError &&
        error.status >= 500 &&
        attempt < 2;

      if (!shouldRetry) {
        throw error;
      }

      await delay(150 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch Treasury node ${seriesId}.`);
}

export async function getTreasuryCurve(): Promise<TreasuryCurve> {
  const observations = await Promise.allSettled(
    TREASURY_SERIES.map(async (series) => {
      const latest = await fetchLatestObservation(series.seriesId);
      const rateDecimal = latest.rate_percent / 100;
      return {
        series_id: series.seriesId,
        label: series.label,
        tenor_days: series.tenorDays,
        latest_date: latest.latest_date,
        rate_percent: Number(latest.rate_percent.toFixed(6)),
        rate_decimal: Number(rateDecimal.toFixed(8)),
        continuous_rate: Number(toContinuousRate(rateDecimal).toFixed(8)),
      } satisfies TreasuryCurveNode;
    }),
  );

  const nodes: TreasuryCurveNode[] = [];
  const warnings: string[] = [];

  for (const result of observations) {
    if (result.status === "fulfilled") {
      nodes.push(result.value);
      continue;
    }

    warnings.push(
      result.reason instanceof Error ? result.reason.message : String(result.reason),
    );
  }

  nodes.sort((left, right) => left.tenor_days - right.tenor_days);

  if (nodes.length < 2) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: "Not enough Treasury curve nodes were available.",
    });
  }

  const as_of = nodes.reduce<string | null>((latest, node) => {
    if (!latest || node.latest_date > latest) {
      return node.latest_date;
    }

    return latest;
  }, null);

  return {
    as_of,
    nodes,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function interpolateTreasuryContinuousRate(
  curve: TreasuryCurve,
  timeToExpiryYears: number,
): number {
  const tenorYears = Math.max(timeToExpiryYears, 1 / 365.25);
  const targetDays = tenorYears * 365.25;
  const nodes = curve.nodes;
  if (nodes.length === 0) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "fred",
      detail: "Treasury curve is empty.",
    });
  }

  if (targetDays <= nodes[0]!.tenor_days) {
    return nodes[0]!.continuous_rate;
  }

  if (targetDays >= nodes[nodes.length - 1]!.tenor_days) {
    return nodes[nodes.length - 1]!.continuous_rate;
  }

  const upperIndex = nodes.findIndex((node) => node.tenor_days >= targetDays);
  if (upperIndex <= 0) {
    return nodes[0]!.continuous_rate;
  }

  const lowerNode = nodes[upperIndex - 1]!;
  const upperNode = nodes[upperIndex]!;
  if (upperNode.tenor_days === lowerNode.tenor_days) {
    return lowerNode.continuous_rate;
  }

  const lowerYears = lowerNode.tenor_days / 365.25;
  const upperYears = upperNode.tenor_days / 365.25;
  const lowerLogDiscount = -lowerNode.continuous_rate * lowerYears;
  const upperLogDiscount = -upperNode.continuous_rate * upperYears;
  const weight = (tenorYears - lowerYears) / (upperYears - lowerYears);
  const interpolatedLogDiscount =
    lowerLogDiscount + weight * (upperLogDiscount - lowerLogDiscount);

  return Number(((-interpolatedLogDiscount) / tenorYears).toFixed(8));
}
