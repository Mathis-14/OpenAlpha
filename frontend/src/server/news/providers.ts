import type { NewsArticle } from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import { fetchJson, fetchText } from "@/server/shared/http";

const NEWS_REVALIDATE_SECONDS = 900;
const NEWS_TIMEOUT_MS = 10_000;
const ITEM_REGEX = /<item>([\s\S]*?)<\/item>/gi;

type FinnhubNewsItem = {
  headline?: string;
  source?: string;
  summary?: string;
  url?: string;
  datetime?: number;
};

function sanitizeNewsUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    if (
      parsed.hostname === "news.google.com" &&
      parsed.pathname.startsWith("/rss/articles/")
    ) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function normalizeNewsQuery(value: string): string {
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

function parseYahooRss(xml: string): NewsArticle[] {
  const items = [...xml.matchAll(ITEM_REGEX)];
  return items.map((item) => {
    const body = item[1];
    const published = extractTagValue(body, "pubDate");

    return {
      title: decodeXml(extractTagValue(body, "title")),
      source: "Yahoo Finance",
      published: published ? new Date(published).toISOString() : null,
      summary: decodeXml(extractTagValue(body, "description")),
      url: sanitizeNewsUrl(decodeXml(extractTagValue(body, "link"))),
    };
  });
}

function mapFinnhubArticles(items: FinnhubNewsItem[]): NewsArticle[] {
  return items
    .filter((item) => item.headline)
    .map((item) => ({
      title: item.headline ?? "",
      source: item.source ?? "Finnhub",
      summary: item.summary ?? "",
      url: sanitizeNewsUrl(item.url),
      published:
        typeof item.datetime === "number"
          ? new Date(item.datetime * 1000).toISOString()
          : null,
    }));
}

export function getFinnhubApiKey(): string | null {
  const key = process.env.FINNHUB_API_KEY?.trim();
  return key ? key : null;
}

export async function fetchYahooNews(
  query: string,
  limit: number,
): Promise<NewsArticle[]> {
  const normalized = normalizeNewsQuery(query);
  const url = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(normalized)}`;

  try {
    const xml = await fetchText(url, {
      revalidate: NEWS_REVALIDATE_SECONDS,
      timeoutMs: NEWS_TIMEOUT_MS,
    });
    return parseYahooRss(xml).slice(0, Math.max(limit * 3, limit));
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "yahoo_news",
    });
  }
}

export async function fetchFinnhubCompanyNews(
  query: string,
  limit: number,
  apiKey: string,
): Promise<NewsArticle[]> {
  const normalized = normalizeNewsQuery(query).toUpperCase();
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 30);

  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", normalized);
  url.searchParams.set("from", from.toISOString().slice(0, 10));
  url.searchParams.set("to", today.toISOString().slice(0, 10));
  url.searchParams.set("token", apiKey);

  try {
    const payload = await fetchJson<FinnhubNewsItem[]>(url, {
      revalidate: NEWS_REVALIDATE_SECONDS,
      timeoutMs: NEWS_TIMEOUT_MS,
    });
    return mapFinnhubArticles(payload).slice(0, Math.max(limit * 3, limit));
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "finnhub_company_news",
    });
  }
}

export async function fetchFinnhubMarketNews(
  limit: number,
  apiKey: string,
): Promise<NewsArticle[]> {
  const url = new URL("https://finnhub.io/api/v1/news");
  url.searchParams.set("category", "general");
  url.searchParams.set("token", apiKey);

  try {
    const payload = await fetchJson<FinnhubNewsItem[]>(url, {
      revalidate: NEWS_REVALIDATE_SECONDS,
      timeoutMs: NEWS_TIMEOUT_MS,
    });
    return mapFinnhubArticles(payload).slice(0, Math.max(limit * 3, limit));
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "finnhub_market_news",
    });
  }
}
