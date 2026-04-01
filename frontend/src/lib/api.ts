import type {
  AgentRequest,
  AgentEvent,
  CommodityDiscoveryItem,
  CommodityInstrumentSlug,
  CommodityOverview,
  CommodityRange,
  CryptoDiscoveryItem,
  CryptoInstrument,
  CryptoOverview,
  CryptoRange,
  FilingsResponse,
  Fundamentals,
  MacroCountry,
  MacroHistoryRange,
  MacroIndicator,
  MacroIndicatorSlug,
  MacroSnapshot,
  MarketResponse,
  NewsResponse,
  PeriodType,
  PricePoint,
  QuantAgentRequest,
  TickerOverview,
  TranscriptionResponse,
  UnlockQuotaRequest,
  UsageQuota,
} from "@/types/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class QuotaExhaustedError extends ApiError {
  constructor(
    public remaining: number,
    message = "Request quota exhausted",
  ) {
    super(429, message);
    this.name = "QuotaExhaustedError";
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return getErrorMessageFromBody(body, response.statusText || "Request failed");
}

function getErrorMessageFromBody(
  body: string,
  fallback: string,
): string {
  if (!body) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as {
      detail?: unknown;
      error?: unknown;
      message?: unknown;
    };

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }

    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    // Fall back to raw body below.
  }

  return body;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return res.json() as Promise<T>;
}

function buildAuthHeaders(
  authToken?: string | null,
  initial?: HeadersInit,
): Headers {
  const headers = new Headers(initial);
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  return headers;
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

export function getMacroSnapshot(country: MacroCountry = "us"): Promise<MacroSnapshot> {
  return fetchJson(`/api/macro?country=${country}`);
}

export function getMacroSeries(
  indicator: MacroIndicatorSlug,
  range: MacroHistoryRange = "5y",
  country: MacroCountry = "us",
): Promise<MacroIndicator> {
  return fetchJson(`/api/macro/series/${indicator}?range=${range}&country=${country}`);
}

// ── Commodities ─────────────────────────────────────────────────────────────

export function getCommodityInstruments(): Promise<CommodityDiscoveryItem[]> {
  return fetchJson("/api/commodities/instruments");
}

export function getCommodityOverview(
  instrument: CommodityInstrumentSlug,
): Promise<CommodityOverview> {
  return fetchJson(`/api/commodities/${encodeURIComponent(instrument)}`);
}

export function getCommodityPriceHistory(
  instrument: CommodityInstrumentSlug,
  range: CommodityRange = "1mo",
): Promise<PricePoint[]> {
  return fetchJson(
    `/api/commodities/${encodeURIComponent(instrument)}/history?range=${range}`,
  );
}

// ── Crypto ──────────────────────────────────────────────────────────────────

export function getCryptoInstruments(): Promise<CryptoDiscoveryItem[]> {
  return fetchJson("/api/crypto/instruments");
}

export function getCryptoOverview(
  instrument: CryptoInstrument,
): Promise<CryptoOverview> {
  return fetchJson(`/api/crypto/${encodeURIComponent(instrument)}`);
}

export function getCryptoPriceHistory(
  instrument: CryptoInstrument,
  range: CryptoRange = "1mo",
): Promise<PricePoint[]> {
  return fetchJson(
    `/api/crypto/${encodeURIComponent(instrument)}/history?range=${range}`,
  );
}

// ── Filings ─────────────────────────────────────────────────────────────────

export function getFilings(
  ticker: string,
  formType: string = "10-K",
  limit: number = 3,
): Promise<FilingsResponse> {
  return fetchJson(`/api/filings/${ticker}?form_type=${formType}&limit=${limit}`);
}

// ── News ────────────────────────────────────────────────────────────────────

export function getNews(
  ticker: string,
  limit: number = 10,
): Promise<NewsResponse> {
  return fetchJson(`/api/news/${ticker}?limit=${limit}`);
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  symbol: string;
  name: string;
}

export async function searchTickers(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return res.json() as Promise<SearchResult[]>;
}

// ── Usage Quota ────────────────────────────────────────────────────────────

export function getUsageQuota(
  authToken?: string | null,
): Promise<UsageQuota> {
  return fetchJson("/api/usage", {
    headers: buildAuthHeaders(authToken),
  });
}

// ── Transcription ──────────────────────────────────────────────────────────

export async function transcribeAudio(
  file: File,
  signal?: AbortSignal,
  authToken?: string | null,
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: buildAuthHeaders(authToken),
    body: formData,
    signal,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }

  return res.json() as Promise<TranscriptionResponse>;
}

export async function unlockUsageQuota(
  payload: UnlockQuotaRequest,
  authToken?: string | null,
): Promise<UsageQuota> {
  const res = await fetch("/api/usage/unlock", {
    method: "POST",
    headers: buildAuthHeaders(authToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let parsed: { error?: string; retry_after_seconds?: unknown } | null = null;
    try {
      parsed = body
        ? (JSON.parse(body) as {
            error?: string;
            retry_after_seconds?: unknown;
          })
        : null;
    } catch {
      parsed = null;
    }

    if (res.status === 429 && parsed?.error === "unlock_rate_limited") {
      const retryAfterSeconds =
        typeof parsed.retry_after_seconds === "number"
          ? parsed.retry_after_seconds
          : null;
      throw new ApiError(
        429,
        retryAfterSeconds != null
          ? `unlock_rate_limited:${retryAfterSeconds}`
          : "unlock_rate_limited",
      );
    }

    if (res.status === 401 && parsed?.error === "invalid_password") {
      throw new ApiError(401, "invalid_password");
    }

    throw new ApiError(
      res.status,
      getErrorMessageFromBody(body, res.statusText),
    );
  }

  return res.json() as Promise<UsageQuota>;
}

// ── Agent SSE ────────────────────────────────────────────────────────────────

async function* streamAgentAtPath(
  path: string,
  request: unknown,
  signal?: AbortSignal,
  options?: {
    onAccepted?: (remaining: number | null) => void;
    authToken?: string | null;
  },
): AsyncGenerator<AgentEvent> {
  const res = await fetch(path, {
    method: "POST",
    headers: buildAuthHeaders(options?.authToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let parsed: { error?: string; remaining?: unknown } | null = null;
    try {
      parsed = body ? (JSON.parse(body) as { error?: string; remaining?: unknown }) : null;
    } catch {
      parsed = null;
    }

    if (res.status === 429 && parsed?.error === "quota_exhausted") {
      throw new QuotaExhaustedError(
        typeof parsed.remaining === "number" ? parsed.remaining : 0,
      );
    }

    throw new ApiError(
      res.status,
      getErrorMessageFromBody(body, res.statusText),
    );
  }

  const remainingHeader = res.headers.get("x-requests-remaining");
  const remaining = remainingHeader ? Number.parseInt(remainingHeader, 10) : Number.NaN;
  options?.onAccepted?.(Number.isFinite(remaining) ? remaining : null);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        let event = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (event && data) {
          try {
            yield { event: event as AgentEvent["event"], data: JSON.parse(data) };
          } catch {
            /* skip malformed events */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamAgent(
  request: AgentRequest,
  signal?: AbortSignal,
  options?: {
    onAccepted?: (remaining: number | null) => void;
    authToken?: string | null;
  },
): AsyncGenerator<AgentEvent> {
  yield* streamAgentAtPath("/api/agent", request, signal, options);
}

export async function* streamQuantAgent(
  request: QuantAgentRequest,
  signal?: AbortSignal,
  options?: {
    onAccepted?: (remaining: number | null) => void;
    authToken?: string | null;
  },
): AsyncGenerator<AgentEvent> {
  yield* streamAgentAtPath("/api/quant-agent", request, signal, options);
}

export { QuotaExhaustedError };
export type { AgentEvent as AgentSSE } from "@/types/api";
