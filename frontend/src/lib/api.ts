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

// ── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  symbol: string;
  name: string;
}

export async function searchTickers(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const res = await fetch(
    `${BASE_URL}/api/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  if (!res.ok) return [];
  return res.json() as Promise<SearchResult[]>;
}

// ── Agent SSE ────────────────────────────────────────────────────────────────

export type AgentEventType =
  | "tool_call"
  | "tool_result"
  | "text"
  | "text_delta"
  | "display_chart"
  | "display_metric"
  | "display_table"
  | "done"
  | "error";

export interface AgentSSE {
  event: AgentEventType;
  data: Record<string, unknown>;
}

export async function* streamAgent(
  query: string,
  ticker?: string,
  signal?: AbortSignal,
): AsyncGenerator<AgentSSE> {
  const res = await fetch(`${BASE_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ticker }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
          yield { event: event as AgentEventType, data: JSON.parse(data) };
        } catch {
          /* skip malformed events */
        }
      }
    }
  }
}

export { ApiError };
