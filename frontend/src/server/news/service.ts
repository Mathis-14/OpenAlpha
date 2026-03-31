import type { NewsArticle, NewsResponse } from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import {
  fetchFinnhubCompanyNews,
  fetchFinnhubMarketNews,
  fetchYahooNews,
  getFinnhubApiKey,
  normalizeNewsQuery,
} from "./providers.ts";
import { getBroadNewsContext } from "./broad.ts";
import { normalizeContextNewsQuery } from "./queries.ts";

type FocusedFallbackStrategy = {
  kind: "company" | "topic";
  label: string;
  source_mode: "query_feed" | "broad_feed";
};

const GENERIC_FOCUSED_QUERY_BLOCKLIST = new Set([
  "global",
  "world",
  "market",
  "markets",
  "macro",
  "risk",
  "risks",
  "rates",
  "geopolitics",
  "commodity",
  "commodities",
  "crypto",
]);

const FOCUSED_QUERY_ALIASES: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\b(bitcoin|btc)\b/i, terms: ["bitcoin", "btc", "crypto"] },
  { pattern: /\b(ethereum|eth)\b/i, terms: ["ethereum", "eth", "crypto"] },
  { pattern: /\bgold\b/i, terms: ["gold", "bullion", "precious metals"] },
  { pattern: /\bsilver\b/i, terms: ["silver", "precious metals", "metals"] },
  { pattern: /\b(wti|crude oil)\b/i, terms: ["wti", "crude oil", "oil", "energy"] },
  { pattern: /\bbrent\b/i, terms: ["brent", "crude oil", "oil", "energy"] },
  { pattern: /\bnatural gas\b/i, terms: ["natural gas", "natgas", "energy"] },
  { pattern: /\bcopper\b/i, terms: ["copper", "metals"] },
  { pattern: /\baluminum\b/i, terms: ["aluminum", "metals"] },
  { pattern: /\bwheat\b/i, terms: ["wheat", "grain", "agriculture"] },
  { pattern: /\bcoffee\b/i, terms: ["coffee", "agriculture"] },
  { pattern: /\bcocoa\b/i, terms: ["cocoa", "agriculture"] },
  { pattern: /\buranium\b/i, terms: ["uranium", "energy"] },
  {
    pattern: /\b(united states|u\.s\.|us)\s+inflation\b/i,
    terms: ["inflation", "cpi", "u.s. inflation", "us inflation"],
  },
  {
    pattern: /\b(united states|u\.s\.|us)\s+economy\b/i,
    terms: ["economy", "u.s. economy", "us economy", "growth"],
  },
  {
    pattern: /\b(united states|u\.s\.|us)\s+interest rates\b/i,
    terms: ["interest rates", "fed", "monetary policy", "rates"],
  },
  {
    pattern: /\b(united states|u\.s\.|us)\s+bond yields\b/i,
    terms: ["bond yields", "treasury yields", "rates", "treasury"],
  },
];

function toSearchableText(article: NewsArticle): string {
  return `${article.title} ${article.summary}`.toLowerCase();
}

function getArticleScore(article: NewsArticle, terms: string[]): number {
  const haystack = toSearchableText(article);
  return terms.reduce((score, term) => {
    if (!term) {
      return score;
    }

    if (haystack.includes(term)) {
      return score + 4;
    }

    const compactTerm = term.replace(/[^a-z0-9]+/gi, "");
    const compactHaystack = haystack.replace(/[^a-z0-9]+/gi, "");
    return compactTerm && compactHaystack.includes(compactTerm) ? score + 2 : score;
  }, 0);
}

function sortByRelevance(articles: NewsArticle[], terms: string[]): NewsArticle[] {
  return [...articles].sort((left, right) => {
    const scoreDifference = getArticleScore(right, terms) - getArticleScore(left, terms);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (right.published ?? "").localeCompare(left.published ?? "");
  });
}

function buildFocusedTerms(query: string): string[] {
  const normalized = normalizeNewsQuery(query).toLowerCase();
  const parts = normalized.split(/\s+/).filter((part) => part.length >= 3);
  const aliases = FOCUSED_QUERY_ALIASES.flatMap((entry) =>
    entry.pattern.test(normalized) ? entry.terms : [],
  );
  const aliasParts = aliases.flatMap((alias) =>
    normalizeNewsQuery(alias).toLowerCase().split(/\s+/).filter((part) => part.length >= 3),
  );
  return Array.from(new Set([normalized, ...parts, ...aliases, ...aliasParts]));
}

function trimResponseArticles(response: NewsResponse, limit: number): NewsResponse {
  return {
    ...response,
    articles: response.articles.slice(0, limit),
  };
}

function buildFocusedResponse(query: string, articles: NewsArticle[]): NewsResponse {
  const terms = buildFocusedTerms(query);
  const rankedArticles = sortByRelevance(articles, terms);
  const topArticles = rankedArticles.slice(0, Math.min(articles.length, 10));
  const strongestScore = topArticles[0] ? getArticleScore(topArticles[0], terms) : 0;

  if (topArticles.length === 0) {
    return {
      query,
      kind: "focused",
      articles: [],
      data_status: "partial",
      warnings: [`No focused headlines matched "${query}" at this time.`],
    };
  }

  if (strongestScore <= 0) {
    return {
      query,
      kind: "focused",
      articles: topArticles,
      data_status: "partial",
      warnings: [`The focused feed for "${query}" looks weak right now.`],
    };
  }

  return {
    query,
    kind: "focused",
    articles: topArticles,
    data_status: "complete",
  };
}

function buildMarketResponse(articles: NewsArticle[]): NewsResponse {
  const rankedArticles = sortByRelevance(articles, buildFocusedTerms("markets"));

  if (rankedArticles.length === 0) {
    return {
      query: "markets",
      kind: "context",
      articles: [],
      data_status: "partial",
      warnings: ["No market-wide headlines are available right now."],
    };
  }

  return {
    query: "markets",
    kind: "context",
    articles: rankedArticles.slice(0, Math.min(rankedArticles.length, 10)),
    data_status: "complete",
  };
}

function mergeWarnings(
  existing: string[] | undefined,
  additions: string[] | undefined,
): string[] | undefined {
  const merged = [...(existing ?? []), ...(additions ?? [])]
    .map((warning) => warning.trim())
    .filter(Boolean);
  return merged.length ? Array.from(new Set(merged)) : undefined;
}

function withResponseMetadata(
  response: NewsResponse,
  metadata: {
    provider?: string;
    source_mode?: "query_feed" | "broad_feed";
    warnings?: string[];
    replaceWarnings?: boolean;
  },
): NewsResponse {
  return {
    ...response,
    provider: metadata.provider ?? response.provider,
    source_mode: metadata.source_mode ?? response.source_mode,
    warnings: metadata.replaceWarnings
      ? mergeWarnings(undefined, metadata.warnings)
      : mergeWarnings(response.warnings, metadata.warnings),
  };
}

function getResponseRelevanceScore(response: NewsResponse, query: string): number {
  const terms = buildFocusedTerms(query);
  return response.articles[0] ? getArticleScore(response.articles[0], terms) : 0;
}

function shouldReplaceYahooFocusedResult(
  query: string,
  yahooResponse: NewsResponse,
  finnhubResponse: NewsResponse,
): boolean {
  if (finnhubResponse.articles.length === 0) {
    return false;
  }

  const yahooScore = getResponseRelevanceScore(yahooResponse, query);
  const finnhubScore = getResponseRelevanceScore(finnhubResponse, query);

  if (finnhubScore !== yahooScore) {
    return finnhubScore > yahooScore;
  }

  if (finnhubResponse.data_status !== yahooResponse.data_status) {
    return finnhubResponse.data_status === "complete";
  }

  if (finnhubResponse.articles.length !== yahooResponse.articles.length) {
    return finnhubResponse.articles.length > yahooResponse.articles.length;
  }

  return yahooResponse.articles.length === 0 && finnhubResponse.articles.length > 0;
}

function warnFallback(message: string, error?: unknown): void {
  if (error instanceof Error && error.message) {
    console.warn(`${message}: ${error.message}`);
    return;
  }

  console.warn(message);
}

function shouldAttemptFinnhubCompanyFallback(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  if (trimmed !== trimmed.toUpperCase()) {
    return false;
  }

  if (!/^[A-Z0-9.-]{1,6}$/.test(trimmed)) {
    return false;
  }

  return !["BTC", "ETH", "GOLD", "SILVER", "WTI", "BRENT", "CPI", "GDP"].includes(trimmed);
}

function shouldAttemptFinnhubTopicFallback(query: string): boolean {
  const normalized = normalizeNewsQuery(query).toLowerCase();

  if (!normalized || shouldAttemptFinnhubCompanyFallback(query)) {
    return false;
  }

  return !GENERIC_FOCUSED_QUERY_BLOCKLIST.has(normalized);
}

function getFocusedFallbackStrategy(query: string, finnhubKey: string | null): FocusedFallbackStrategy | null {
  if (!finnhubKey) {
    return null;
  }

  if (shouldAttemptFinnhubCompanyFallback(query)) {
    return {
      kind: "company",
      label: "Finnhub company news",
      source_mode: "query_feed",
    };
  }

  if (shouldAttemptFinnhubTopicFallback(query)) {
    return {
      kind: "topic",
      label: "Finnhub general market news",
      source_mode: "broad_feed",
    };
  }

  return null;
}

function getFallbackAttemptWarning(query: string, strategy: FocusedFallbackStrategy): string {
  return strategy.kind === "company"
    ? `Yahoo focused headlines for "${query}" looked weak, so a Finnhub company-news fallback was used.`
    : `Yahoo focused headlines for "${query}" looked weak, so a Finnhub general-news fallback was used.`;
}

function getFallbackUnavailabilityWarning(query: string): string {
  return `The focused Yahoo feed for "${query}" looks weak, and no Finnhub fallback is configured right now.`;
}

function getFallbackNoImprovementWarning(query: string, strategy: FocusedFallbackStrategy): string {
  return strategy.kind === "company"
    ? `Yahoo focused headlines for "${query}" stayed as the best available result after a Finnhub company-news fallback check.`
    : `Yahoo focused headlines for "${query}" stayed as the best available result after a Finnhub general-news fallback check.`;
}

function getFallbackFailureWarning(query: string, strategy: FocusedFallbackStrategy): string {
  return strategy.kind === "company"
    ? `Yahoo focused headlines for "${query}" are weak, and the Finnhub company-news fallback failed.`
    : `Yahoo focused headlines for "${query}" are weak, and the Finnhub general-news fallback failed.`;
}

async function fetchFocusedFinnhubFallback(
  query: string,
  limit: number,
  strategy: FocusedFallbackStrategy,
  apiKey: string,
): Promise<NewsResponse> {
  const articles =
    strategy.kind === "company"
      ? await fetchFinnhubCompanyNews(query, limit, apiKey)
      : await fetchFinnhubMarketNews(Math.max(limit, 10), apiKey);

  return withResponseMetadata(
    trimResponseArticles(buildFocusedResponse(query, articles), limit),
    {
      provider: "finnhub",
      source_mode: strategy.source_mode,
    },
  );
}

export async function getFocusedNews(
  query: string,
  limit: number = 10,
): Promise<NewsResponse> {
  const normalized = normalizeNewsQuery(query);
  const finnhubKey = getFinnhubApiKey();
  const fallbackStrategy = getFocusedFallbackStrategy(query, finnhubKey);
  let yahooError: unknown;

  try {
    const yahooArticles = await fetchYahooNews(normalized, limit);
    const yahooResponse = withResponseMetadata(
      trimResponseArticles(buildFocusedResponse(normalized, yahooArticles), limit),
      {
        provider: "yahoo",
        source_mode: "query_feed",
      },
    );

    if (yahooResponse.data_status === "complete") {
      return yahooResponse;
    }

    if (!fallbackStrategy) {
      return finnhubKey
        ? yahooResponse
        : withResponseMetadata(yahooResponse, {
            warnings: [getFallbackUnavailabilityWarning(normalized)],
          });
    }

    const fallbackApiKey = finnhubKey!;
    warnFallback(`Yahoo focused news for "${normalized}" was weak, trying ${fallbackStrategy.label}`);

    try {
      const finnhubResponse = await fetchFocusedFinnhubFallback(
        normalized,
        limit,
        fallbackStrategy,
        fallbackApiKey,
      );

      return shouldReplaceYahooFocusedResult(normalized, yahooResponse, finnhubResponse)
        ? withResponseMetadata(finnhubResponse, {
            warnings: [getFallbackAttemptWarning(normalized, fallbackStrategy)],
            replaceWarnings: true,
          })
        : withResponseMetadata(yahooResponse, {
            warnings: [getFallbackNoImprovementWarning(normalized, fallbackStrategy)],
            replaceWarnings: true,
          });
    } catch (error) {
      warnFallback(
        `${fallbackStrategy.label} fallback failed for "${normalized}", returning Yahoo result`,
        error,
      );
      return withResponseMetadata(yahooResponse, {
        warnings: [getFallbackFailureWarning(normalized, fallbackStrategy)],
        replaceWarnings: true,
      });
    }
  } catch (error) {
    yahooError = error;
  }

  if (!fallbackStrategy) {
    throw yahooError instanceof Error
      ? yahooError
      : new ServiceError(503, {
          error: "upstream_unavailable",
          provider: "news",
        });
  }

  warnFallback(
    `Yahoo focused news failed for "${normalized}", trying ${fallbackStrategy.label}`,
    yahooError,
  );

  const fallbackApiKey = finnhubKey!;
  try {
    const finnhubResponse = withResponseMetadata(
      await fetchFocusedFinnhubFallback(normalized, limit, fallbackStrategy, fallbackApiKey),
      {
        warnings: [
          fallbackStrategy.kind === "company"
            ? `Yahoo focused headlines for "${normalized}" were unavailable, so a Finnhub company-news fallback was used.`
            : `Yahoo focused headlines for "${normalized}" were unavailable, so a Finnhub general-news fallback was used.`,
        ],
        replaceWarnings: true,
      },
    );

    if (finnhubResponse.articles.length > 0 || finnhubResponse.warnings?.length) {
      return finnhubResponse;
    }
  } catch (error) {
    warnFallback(
      `${fallbackStrategy.label} fallback failed for "${normalized}" after Yahoo failure`,
      error,
    );
  }

  throw yahooError instanceof Error
    ? yahooError
    : new ServiceError(503, {
        error: "upstream_unavailable",
        provider: "news",
      });
}

export async function getContextNews(
  query: string,
  limit: number = 10,
): Promise<NewsResponse> {
  const normalized = normalizeContextNewsQuery(normalizeNewsQuery(query));
  const broadResult = await getBroadNewsContext(
    {
      query: normalized,
      dashboard_context: "general",
      limit,
    },
  );

  return {
    query: normalized,
    kind: "context",
    resolved_query: broadResult.chosen_query,
    theme_id: broadResult.theme_id,
    provider: broadResult.provider,
    source_mode: broadResult.source_mode,
    articles: broadResult.articles.slice(0, limit),
    warnings: broadResult.warnings,
    data_status: broadResult.data_status,
  };
}

export async function getMarketNews(limit: number = 10): Promise<NewsResponse> {
  const finnhubKey = getFinnhubApiKey();

  if (finnhubKey) {
    try {
      const finnhubArticles = await fetchFinnhubMarketNews(limit, finnhubKey);
      const finnhubResponse = trimResponseArticles(
        buildMarketResponse(finnhubArticles),
        limit,
      );

      if (finnhubResponse.articles.length > 0) {
        return finnhubResponse;
      }

      warnFallback("Finnhub market news returned no articles, falling back to Yahoo markets");
    } catch (error) {
      warnFallback("Finnhub market news failed, falling back to Yahoo markets", error);
    }
  } else {
    warnFallback("FINNHUB_API_KEY is not set, falling back to Yahoo markets");
  }

  const yahooArticles = await fetchYahooNews("markets", limit);
  return trimResponseArticles(buildMarketResponse(yahooArticles), limit);
}

export async function getNews(
  query: string,
  limit: number = 10,
): Promise<NewsResponse> {
  return getFocusedNews(query, limit);
}
