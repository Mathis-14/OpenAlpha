import type { NewsArticle, NewsResponse } from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import { fetchText } from "@/server/shared/http";

const NEWS_REVALIDATE_SECONDS = 900;
const NEWS_TIMEOUT_MS = 10_000;

const ITEM_REGEX = /<item>([\s\S]*?)<\/item>/gi;

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

function parseRss(xml: string, ticker: string, limit: number): NewsResponse {
  const items = [...xml.matchAll(ITEM_REGEX)].slice(0, limit);
  const articles: NewsArticle[] = items.map((item) => {
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

  return { ticker, articles };
}

export async function getNews(
  ticker: string,
  limit: number = 10,
): Promise<NewsResponse> {
  const normalized = ticker.trim().toUpperCase();
  const url = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(normalized)}`;

  try {
    const xml = await fetchText(url, {
      revalidate: NEWS_REVALIDATE_SECONDS,
      timeoutMs: NEWS_TIMEOUT_MS,
    });
    return parseRss(xml, normalized, limit);
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "yahoo_news",
    });
  }
}
