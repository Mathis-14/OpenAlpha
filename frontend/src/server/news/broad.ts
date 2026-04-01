import type { AgentRequest, MacroCountry, NewsArticle } from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import {
  fetchFinnhubMarketNews,
  fetchYahooNews,
  getFinnhubApiKey,
  normalizeNewsQuery,
} from "./providers.ts";

const FINANCE_CONTEXT_WORDS = [
  "market",
  "markets",
  "investor",
  "investors",
  "stocks",
  "economy",
  "inflation",
  "rates",
  "yield",
  "yields",
  "tariff",
  "tariffs",
  "war",
  "sanctions",
  "risk",
  "growth",
  "fed",
  "central bank",
];

export type BroadNewsThemeId =
  | "markets"
  | "geopolitics"
  | "macro-economy"
  | "rates-and-yields"
  | "risk-sentiment";

export type BroadNewsSourceMode = "broad_feed" | "query_feed";
export type BroadNewsAttemptOutcome = "success" | "weak" | "empty" | "error";

export type BroadNewsAttempt = {
  theme_id: BroadNewsThemeId;
  theme_label: string;
  provider: string;
  source_mode: BroadNewsSourceMode;
  query: string;
  score: number;
  article_count: number;
  outcome: BroadNewsAttemptOutcome;
  reason: string;
};

export type BroadNewsContextInput = {
  query: string;
  dashboard_context?: AgentRequest["dashboard_context"] | "general";
  country?: MacroCountry;
  limit?: number;
};

export type BroadNewsContextResult = {
  kind: "broad";
  theme_id: BroadNewsThemeId;
  theme_label: string;
  chosen_query: string;
  provider: string;
  source_mode: BroadNewsSourceMode;
  articles: NewsArticle[];
  attempts: BroadNewsAttempt[];
  warnings?: string[];
  data_status: "complete" | "partial";
};

export type BroadNewsProbeThemeResult = {
  theme_id: BroadNewsThemeId;
  theme_label: string;
  winner: Omit<BroadNewsAttempt, "theme_id" | "theme_label">;
  attempts: Array<Omit<BroadNewsAttempt, "theme_id" | "theme_label">>;
  warnings?: string[];
};

export type BroadNewsProbeResult = {
  generated_at: string;
  providers: string[];
  themes: BroadNewsProbeThemeResult[];
};

export type BroadNewsProvider = {
  name: string;
  sourceMode: BroadNewsSourceMode;
  fetchBroad: (
    query: string,
    limit: number,
    themeId: BroadNewsThemeId,
  ) => Promise<NewsArticle[]>;
};

type BroadTheme = {
  id: BroadNewsThemeId;
  label: string;
  queries: string[];
  providerQueries?: Partial<Record<string, string[]>>;
  anchorKeywords: string[];
  contextKeywords: string[];
  negativeKeywords: string[];
  minStrongScore: number;
  requiresAnchor: boolean;
};

type ArticleScoring = {
  score: number;
  anchorHits: number;
};

const BROAD_THEME_CATALOG: Record<BroadNewsThemeId, BroadTheme> = {
  markets: {
    id: "markets",
    label: "Markets",
    queries: ["markets", "financial markets", "wall street"],
    providerQueries: {
      finnhub: ["general"],
      yahoo: ["SPY", "QQQ", "DIA"],
    },
    anchorKeywords: ["markets", "wall street", "stocks", "investors", "equities"],
    contextKeywords: ["economy", "rates", "growth", "sentiment", "risk"],
    negativeKeywords: ["single company", "product launch"],
    minStrongScore: 14,
    requiresAnchor: false,
  },
  geopolitics: {
    id: "geopolitics",
    label: "Geopolitics",
    queries: ["geopolitics", "tariffs", "war risk"],
    providerQueries: {
      finnhub: ["general"],
      yahoo: ["GLD", "USO", "XLE"],
    },
    anchorKeywords: [
      "geopolitic",
      "tariff",
      "tariffs",
      "sanction",
      "sanctions",
      "war",
      "conflict",
      "military",
      "diplomatic",
      "election",
      "retaliation",
      "border",
      "trade war",
    ],
    contextKeywords: ["global", "trade", "oil", "supply shock"],
    negativeKeywords: [
      "volatility",
      "fear gauge",
      "vix",
      "etf",
      "earnings",
      "product launch",
      "single company",
    ],
    minStrongScore: 13,
    requiresAnchor: true,
  },
  "macro-economy": {
    id: "macro-economy",
    label: "Macro Economy",
    queries: ["economy", "macro economy", "economic growth"],
    providerQueries: {
      finnhub: ["general"],
      yahoo: ["XLF", "IWM", "SPY"],
    },
    anchorKeywords: [
      "inflation",
      "cpi",
      "jobs",
      "payrolls",
      "unemployment",
      "gdp",
      "growth",
      "recession",
      "consumer",
      "spending",
      "retail sales",
      "economy",
      "macro",
    ],
    contextKeywords: ["fed", "rates", "central bank", "demand"],
    negativeKeywords: [
      "etf",
      "fear gauge",
      "volatility",
      "earnings",
      "product launch",
      "single company",
      "allocation",
      "outperform",
    ],
    minStrongScore: 13,
    requiresAnchor: true,
  },
  "rates-and-yields": {
    id: "rates-and-yields",
    label: "Rates and Yields",
    queries: ["interest rates", "bond yields", "monetary policy"],
    providerQueries: {
      finnhub: ["general"],
      yahoo: ["^TNX", "TLT", "IEF"],
    },
    anchorKeywords: [
      "rate",
      "rates",
      "yield",
      "yields",
      "treasury",
      "bond",
      "fed",
      "central bank",
      "monetary",
      "borrowing",
    ],
    contextKeywords: ["inflation", "policy", "economy"],
    negativeKeywords: ["single company", "product launch"],
    minStrongScore: 13,
    requiresAnchor: true,
  },
  "risk-sentiment": {
    id: "risk-sentiment",
    label: "Risk Sentiment",
    queries: ["risk sentiment", "risk off", "market volatility"],
    providerQueries: {
      finnhub: ["general"],
      yahoo: ["^VIX", "VIXY", "UUP"],
    },
    anchorKeywords: [
      "volatility",
      "fear",
      "selloff",
      "stress",
      "risk-off",
      "safe haven",
      "sentiment",
      "positioning",
      "uncertainty",
      "vix",
    ],
    contextKeywords: ["hedging", "flight to safety", "panic"],
    negativeKeywords: [
      "earnings",
      "product launch",
      "single company",
      "gdp",
      "cpi",
      "payrolls",
      "unemployment",
    ],
    minStrongScore: 12,
    requiresAnchor: true,
  },
};

function normalizeText(value: string): string {
  return normalizeNewsQuery(value).toLowerCase();
}

function getQueriesForProvider(theme: BroadTheme, providerName: string): string[] {
  return theme.providerQueries?.[providerName] ?? theme.queries;
}

function buildSearchTerms(theme: BroadTheme, query: string): string[] {
  const normalizedQuery = normalizeText(query);
  const splitTerms = normalizedQuery.split(/\s+/).filter((term) => term.length >= 3);

  return Array.from(
    new Set([
      normalizedQuery,
      ...splitTerms,
      ...theme.anchorKeywords.map((term) => normalizeText(term)),
      ...theme.contextKeywords.map((term) => normalizeText(term)),
    ]),
  );
}

function scoreArticle(article: NewsArticle, theme: BroadTheme, query: string): ArticleScoring {
  const searchable = `${article.title} ${article.summary}`.toLowerCase();
  const searchTerms = buildSearchTerms(theme, query);

  let score = 0;
  let anchorHits = 0;

  for (const term of theme.anchorKeywords) {
    const normalizedTerm = normalizeText(term);
    if (searchable.includes(normalizedTerm)) {
      anchorHits += 1;
      score += 5;
    }
  }

  for (const term of theme.contextKeywords) {
    const normalizedTerm = normalizeText(term);
    if (searchable.includes(normalizedTerm)) {
      score += 2;
    }
  }

  for (const term of searchTerms) {
    if (searchable.includes(term)) {
      score += 1;
    }
  }

  for (const word of FINANCE_CONTEXT_WORDS) {
    if (searchable.includes(word)) {
      score += 1;
    }
  }

  for (const term of theme.negativeKeywords) {
    if (searchable.includes(normalizeText(term))) {
      score -= 4;
    }
  }

  const publishedAt = article.published ? Date.parse(article.published) : Number.NaN;
  if (Number.isFinite(publishedAt)) {
    const ageHours = Math.max(0, (Date.now() - publishedAt) / 3_600_000);
    if (ageHours <= 24) {
      score += 3;
    } else if (ageHours <= 72) {
      score += 2;
    } else if (ageHours <= 168) {
      score += 1;
    }
  }

  return { score, anchorHits };
}

function rankArticlesForTheme(
  articles: NewsArticle[],
  theme: BroadTheme,
  query: string,
): NewsArticle[] {
  return [...articles].sort((left, right) => {
    const rightScore = scoreArticle(right, theme, query);
    const leftScore = scoreArticle(left, theme, query);
    const scoreDifference = rightScore.score - leftScore.score;
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (right.published ?? "").localeCompare(left.published ?? "");
  });
}

function scoreArticleSet(
  articles: NewsArticle[],
  theme: BroadTheme,
  query: string,
): ArticleScoring {
  if (articles.length === 0) {
    return { score: 0, anchorHits: 0 };
  }

  const ranked = rankArticlesForTheme(articles, theme, query);
  const topArticles = ranked.slice(0, 3);
  let articleScore = 0;
  let anchorHits = 0;

  for (const article of topArticles) {
    const scoring = scoreArticle(article, theme, query);
    articleScore += scoring.score;
    anchorHits += scoring.anchorHits;
  }

  const uniqueSources = new Set(topArticles.map((article) => normalizeText(article.source)));
  const uniqueTitles = new Set(topArticles.map((article) => normalizeText(article.title)));
  const duplicatePenalty = topArticles.length - uniqueTitles.size;

  return {
    score: articleScore + uniqueSources.size - duplicatePenalty * 2,
    anchorHits,
  };
}

function inferThemeOrder(query: string): BroadNewsThemeId[] {
  const normalized = normalizeText(query);

  if (/\b(geopolitics?|tariffs?|sanctions?|war|conflict|elections?|trade war|border)\b/i.test(normalized)) {
    return ["geopolitics", "risk-sentiment", "markets", "macro-economy", "rates-and-yields"];
  }

  if (/\b(rate|rates|yield|yields|treasury|bond|central bank|monetary|fed)\b/i.test(normalized)) {
    return ["rates-and-yields", "macro-economy", "markets", "risk-sentiment", "geopolitics"];
  }

  if (/\b(inflation|growth|economy|recession|macro|jobs|unemployment|payrolls|gdp)\b/i.test(normalized)) {
    return ["macro-economy", "rates-and-yields", "markets", "risk-sentiment", "geopolitics"];
  }

  if (/\b(risk|volatility|selloff|positioning|sentiment|fear|uncertainty)\b/i.test(normalized)) {
    return ["risk-sentiment", "markets", "geopolitics", "macro-economy", "rates-and-yields"];
  }

  return ["markets", "risk-sentiment", "macro-economy", "rates-and-yields", "geopolitics"];
}

function toAttempt(
  theme: BroadTheme,
  provider: BroadNewsProvider,
  query: string,
  articles: NewsArticle[],
): BroadNewsAttempt {
  const scoring = scoreArticleSet(articles, theme, query);
  const meetsAnchor = !theme.requiresAnchor || scoring.anchorHits > 0;
  const outcome: BroadNewsAttemptOutcome =
    articles.length === 0
      ? "empty"
      : meetsAnchor && scoring.score >= theme.minStrongScore
        ? "success"
        : "weak";

  const reason =
    outcome === "success"
      ? "Strong finance and theme keyword match."
      : outcome === "weak"
        ? meetsAnchor
          ? "Articles returned, but the feed is too generic or weak."
          : "Articles returned, but they do not carry enough theme-specific signals."
        : "No articles returned.";

  return {
    theme_id: theme.id,
    theme_label: theme.label,
    provider: provider.name,
    source_mode: provider.sourceMode,
    query,
    score: scoring.score,
    article_count: articles.length,
    outcome,
    reason,
  };
}

function createErrorAttempt(
  theme: BroadTheme,
  provider: BroadNewsProvider,
  query: string,
  error: unknown,
): BroadNewsAttempt {
  return {
    theme_id: theme.id,
    theme_label: theme.label,
    provider: provider.name,
    source_mode: provider.sourceMode,
    query,
    score: 0,
    article_count: 0,
    outcome: "error",
    reason:
      error instanceof Error && error.message
        ? error.message
        : "Provider error.",
  };
}

function selectBestAttempt(
  attempts: Array<BroadNewsAttempt & { articles: NewsArticle[] }>,
): (BroadNewsAttempt & { articles: NewsArticle[] }) | null {
  if (attempts.length === 0) {
    return null;
  }

  return [...attempts].sort((left, right) => {
    const outcomeWeight = (attempt: BroadNewsAttempt) =>
      attempt.outcome === "success"
        ? 3
        : attempt.outcome === "weak"
          ? 2
          : attempt.outcome === "empty"
            ? 1
            : 0;

    const outcomeDifference = outcomeWeight(right) - outcomeWeight(left);
    if (outcomeDifference !== 0) {
      return outcomeDifference;
    }

    const sourceModeWeight = (attempt: BroadNewsAttempt) =>
      attempt.source_mode === "broad_feed" ? 1 : 0;
    const sourceModeDifference = sourceModeWeight(right) - sourceModeWeight(left);
    if (sourceModeDifference !== 0) {
      return sourceModeDifference;
    }

    return right.score - left.score;
  })[0];
}

export function createYahooBroadNewsProvider(): BroadNewsProvider {
  return {
    name: "yahoo",
    sourceMode: "query_feed",
    async fetchBroad(query, limit) {
      return fetchYahooNews(query, limit);
    },
  };
}

export function createFinnhubBroadNewsProvider(apiKey: string): BroadNewsProvider {
  const cache = new Map<number, Promise<NewsArticle[]>>();

  return {
    name: "finnhub",
    sourceMode: "broad_feed",
    async fetchBroad(_query, limit) {
      const cacheKey = Math.max(limit * 3, limit);
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, fetchFinnhubMarketNews(limit, apiKey));
      }

      return cache.get(cacheKey) ?? [];
    },
  };
}

export function createConfiguredBroadNewsProviders(): BroadNewsProvider[] {
  const finnhubKey = getFinnhubApiKey();
  return finnhubKey
    ? [createFinnhubBroadNewsProvider(finnhubKey), createYahooBroadNewsProvider()]
    : [createYahooBroadNewsProvider()];
}

type ContextOptions = {
  providers?: BroadNewsProvider[];
};

export async function getBroadNewsContext(
  input: BroadNewsContextInput,
  options: ContextOptions = {},
): Promise<BroadNewsContextResult> {
  const limit = Math.max(1, input.limit ?? 5);
  const providers = options.providers ?? createConfiguredBroadNewsProviders();
  const themeOrder = inferThemeOrder(input.query);
  const attempts: BroadNewsAttempt[] = [];
  const candidates: Array<BroadNewsAttempt & { articles: NewsArticle[] }> = [];

  for (const themeId of themeOrder) {
    const theme = BROAD_THEME_CATALOG[themeId];

    for (const provider of providers) {
      for (const query of getQueriesForProvider(theme, provider.name)) {
        try {
          const rawArticles = await provider.fetchBroad(query, limit, theme.id);
          const rankedArticles = rankArticlesForTheme(rawArticles, theme, query).slice(0, limit);
          const attempt = toAttempt(theme, provider, query, rankedArticles);
          attempts.push(attempt);
          candidates.push({
            ...attempt,
            articles: rankedArticles,
          });

          if (attempt.outcome === "success") {
            return {
              kind: "broad",
              theme_id: theme.id,
              theme_label: theme.label,
              chosen_query: query,
              provider: provider.name,
              source_mode: provider.sourceMode,
              articles: rankedArticles,
              attempts,
              data_status: "complete",
            };
          }
        } catch (error) {
          attempts.push(createErrorAttempt(theme, provider, query, error));
        }
      }
    }
  }

  const bestAttempt = selectBestAttempt(candidates);
  if (!bestAttempt) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "broad_news_pipeline",
    });
  }

  return {
    kind: "broad",
    theme_id: bestAttempt.theme_id,
    theme_label: bestAttempt.theme_label,
    chosen_query: bestAttempt.query,
    provider: bestAttempt.provider,
    source_mode: bestAttempt.source_mode,
    articles: bestAttempt.articles,
    attempts,
    warnings: [
      "Broad context fallback returned the best available partial result.",
    ],
    data_status: "partial",
  };
}

export async function probeBroadNewsThemes(
  providers: BroadNewsProvider[] = createConfiguredBroadNewsProviders(),
): Promise<BroadNewsProbeResult> {
  const themes: BroadNewsProbeThemeResult[] = [];

  for (const theme of Object.values(BROAD_THEME_CATALOG)) {
    const attempts: Array<Omit<BroadNewsAttempt, "theme_id" | "theme_label">> = [];
    const candidates: Array<
      Omit<BroadNewsAttempt, "theme_id" | "theme_label"> & { articles: NewsArticle[] }
    > = [];

    for (const provider of providers) {
      for (const query of getQueriesForProvider(theme, provider.name)) {
        try {
          const rawArticles = await provider.fetchBroad(query, 5, theme.id);
          const rankedArticles = rankArticlesForTheme(rawArticles, theme, query).slice(0, 5);
          const attempt = toAttempt(theme, provider, query, rankedArticles);
          const stripped = {
            provider: attempt.provider,
            source_mode: attempt.source_mode,
            query: attempt.query,
            score: attempt.score,
            article_count: attempt.article_count,
            outcome: attempt.outcome,
            reason: attempt.reason,
          };
          attempts.push(stripped);
          candidates.push({
            ...stripped,
            articles: rankedArticles,
          });
        } catch (error) {
          const attempt = createErrorAttempt(theme, provider, query, error);
          attempts.push({
            provider: attempt.provider,
            source_mode: attempt.source_mode,
            query: attempt.query,
            score: attempt.score,
            article_count: attempt.article_count,
            outcome: attempt.outcome,
            reason: attempt.reason,
          });
        }
      }
    }

    const winner = [...candidates].sort((left, right) => right.score - left.score)[0];

    themes.push({
      theme_id: theme.id,
      theme_label: theme.label,
      winner: winner
        ? {
            provider: winner.provider,
            source_mode: winner.source_mode,
            query: winner.query,
            score: winner.score,
            article_count: winner.article_count,
            outcome: winner.outcome,
            reason: winner.reason,
          }
        : {
            provider: "none",
            source_mode: "query_feed",
            query: "none",
            score: 0,
            article_count: 0,
            outcome: "empty",
            reason: "No successful attempts.",
          },
      attempts,
      warnings:
        winner && winner.outcome !== "success"
          ? ["The highest-scoring candidate is still weak."]
          : undefined,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    providers: providers.map((provider) => provider.name),
    themes,
  };
}
