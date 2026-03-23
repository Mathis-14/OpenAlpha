import type {
  FilingsResponse,
  Fundamentals,
  MacroSnapshot,
  MarketResponse,
  NewsResponse,
  PeriodType,
  PricePoint,
  TickerOverview,
} from "@/types/api";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Market ──────────────────────────────────────────────────────────────────

export function getMarketData(
  ticker: string,
  period: PeriodType = "1mo",
): Promise<MarketResponse> {
  return fetchJson(`/api/market/${ticker}?period=${period}`);
}

export function getTickerOverview(ticker: string): Promise<TickerOverview> {
  return fetchJson(`/api/market/${ticker}/overview`);
}

export function getFundamentals(ticker: string): Promise<Fundamentals> {
  return fetchJson(`/api/market/${ticker}/fundamentals`);
}

export function getPriceHistory(
  ticker: string,
  period: PeriodType = "1mo",
): Promise<PricePoint[]> {
  return fetchJson(`/api/market/${ticker}/history?period=${period}`);
}

// ── Macro ───────────────────────────────────────────────────────────────────

export function getMacroSnapshot(): Promise<MacroSnapshot> {
  return fetchJson("/api/macro");
}

// ── Filings ─────────────────────────────────────────────────────────────────

export function getFilings(
  ticker: string,
  formType: string = "10-K",
  limit: number = 3,
): Promise<FilingsResponse> {
  return fetchJson(
    `/api/filings/${ticker}?form_type=${formType}&limit=${limit}`,
  );
}

// ── News ────────────────────────────────────────────────────────────────────

export function getNews(
  ticker: string,
  limit: number = 10,
): Promise<NewsResponse> {
  return fetchJson(`/api/news/${ticker}?limit=${limit}`);
}

export { ApiError };
