import { ServiceError } from "@/server/shared/errors";
import { fetchJson } from "@/server/shared/http";
import YahooFinance from "yahoo-finance2";
import {
  looksLikeExactTicker,
  normalizeDashboardSymbol,
  toDisplaySymbol,
  toProviderSymbol,
} from "@/server/market/symbols";

const SEARCH_REVALIDATE_SECONDS = 300;
const SEARCH_TIMEOUT_MS = 5_000;
const MAX_RESULTS = 8;

type SearchResult = {
  symbol: string;
  name: string;
};

type YahooSearchResponse = {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
  }>;
};

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

function buildResults(quotes: YahooSearchResponse["quotes"] = []): SearchResult[] {
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const quote of quotes) {
    const quoteType = (quote.quoteType ?? "").toUpperCase();
    if (quoteType === "OPTION") {
      continue;
    }

    const rawSymbol = (quote.symbol ?? "").toUpperCase().trim();
    const symbol = toDisplaySymbol(rawSymbol);
    const name = (quote.shortname ?? quote.longname ?? "").trim();
    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    results.push({ symbol, name: name || symbol });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results;
}

async function lookupExactTicker(query: string): Promise<SearchResult | null> {
  const normalized = normalizeDashboardSymbol(query);
  if (!looksLikeExactTicker(normalized)) {
    return null;
  }

  try {
    const quote = await yahooFinance.quote(toProviderSymbol(normalized));
    return {
      symbol: normalized,
      name: quote.shortName ?? quote.longName ?? normalized,
    };
  } catch {
    return null;
  }
}

async function fetchSearchResults(query: string): Promise<SearchResult[]> {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", String(MAX_RESULTS));
  url.searchParams.set("newsCount", "0");

  try {
    const payload = await fetchJson<YahooSearchResponse>(url, {
      revalidate: SEARCH_REVALIDATE_SECONDS,
      timeoutMs: SEARCH_TIMEOUT_MS,
    });
    return buildResults(payload.quotes);
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "yfinance",
    });
  }
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  const normalized = normalizeDashboardSymbol(query);
  const exactMatchPromise = lookupExactTicker(normalized);

  try {
    const [results, exactMatch] = await Promise.all([
      fetchSearchResults(normalized),
      exactMatchPromise,
    ]);

    if (!exactMatch) {
      return results;
    }

    return [
      exactMatch,
      ...results.filter((result) => result.symbol !== exactMatch.symbol),
    ].slice(0, MAX_RESULTS);
  } catch (error) {
    const exactMatch = await exactMatchPromise;
    if (exactMatch) {
      return [exactMatch];
    }
    throw error;
  }
}
