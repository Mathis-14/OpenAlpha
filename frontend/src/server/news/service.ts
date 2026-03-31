import type { NewsArticle, NewsResponse } from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import { fetchText } from "@/server/shared/http";

const NEWS_REVALIDATE_SECONDS = 900;
const NEWS_TIMEOUT_MS = 10_000;

const ITEM_REGEX = /<item>([\s\S]*?)<\/item>/gi;

function normalizeQuery(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function extractTagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function stripCdata(value: string): string {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function decodeXml(value: string): string {
  return stripCdata(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRss(xml: string): NewsArticle[] {
  const items = [...xml.matchAll(ITEM_REGEX)];
  return items.map((item) => {
    const body = item[1];
    const published = extractTagValue(body, "pubDate");

    return {
      title: decodeXml(extractTagValue(body, "title")),
      source: "Yahoo Finance",
      published: published ? new Date(published).toISOString() : null,
      summary: decodeXml(extractTagValue(body, "description")),
      url: decodeXml(extractTagValue(body, "link")),
    };
  });
}

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
  const normalized = normalizeQuery(query).toLowerCase();
  const parts = normalized.split(/\s+/).filter((part) => part.length >= 3);
  return Array.from(new Set([normalized, ...parts]));
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

function buildContextResponse(query: string, articles: NewsArticle[]): NewsResponse {
  const rankedArticles = sortByRelevance(articles, buildFocusedTerms(query));
  return {
    query,
    kind: "context",
    articles: rankedArticles.slice(0, Math.min(articles.length, 10)),
    data_status: "complete",
  };
}

async function fetchYahooNews(
  query: string,
  limit: number,
): Promise<NewsArticle[]> {
  const normalized = normalizeQuery(query);
  const url = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(normalized)}`;

  try {
    const xml = await fetchText(url, {
      revalidate: NEWS_REVALIDATE_SECONDS,
      timeoutMs: NEWS_TIMEOUT_MS,
    });
    return parseRss(xml).slice(0, Math.max(limit * 3, limit));
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "yahoo_news",
    });
  }
}

export async function getFocusedNews(
  query: string,
  limit: number = 10,
): Promise<NewsResponse> {
  const normalized = normalizeQuery(query);
  const articles = await fetchYahooNews(normalized, limit);
  const response = buildFocusedResponse(normalized, articles);
  return {
    ...response,
    articles: response.articles.slice(0, limit),
  };
}

export async function getContextNews(
  query: string,
  limit: number = 10,
): Promise<NewsResponse> {
  const normalized = normalizeQuery(query);
  const articles = await fetchYahooNews(normalized, limit);
  const response = buildContextResponse(normalized, articles);
  return {
    ...response,
    articles: response.articles.slice(0, limit),
  };
}

export async function getNews(
  query: string,
  limit: number = 10,
): Promise<NewsResponse> {
  return getFocusedNews(query, limit);
}
