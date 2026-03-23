import asyncio
import logging
from datetime import datetime
from email.utils import parsedate_to_datetime

import feedparser
from cachetools import TTLCache

from app.exceptions import UpstreamDataError
from app.models.news import NewsArticle
from app.models.news import NewsResponse

logger = logging.getLogger(__name__)

_CACHE_TTL = 900  # 15 minutes
_CACHE_MAX = 128

_news_cache: TTLCache[str, NewsResponse] = TTLCache(maxsize=_CACHE_MAX, ttl=_CACHE_TTL)

_YAHOO_RSS_URL = "https://finance.yahoo.com/rss/headline?s={ticker}"


def _parse_published(entry: dict[str, str]) -> datetime | None:
    raw = entry.get("published", "")
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except (ValueError, TypeError):
        return None


def _sync_fetch_news(ticker: str, limit: int) -> NewsResponse:
    url = _YAHOO_RSS_URL.format(ticker=ticker.upper())
    feed = feedparser.parse(url)

    if feed.bozo and not feed.entries:
        raise UpstreamDataError(
            provider="yahoo_news", detail=f"RSS parse failed for {ticker.upper()}"
        )

    articles: list[NewsArticle] = []
    for entry in feed.entries[:limit]:
        articles.append(
            NewsArticle(
                title=entry.get("title", ""),
                source=entry.get("source", {}).get("title", "Yahoo Finance")
                if isinstance(entry.get("source"), dict)
                else "Yahoo Finance",
                published=_parse_published(entry),
                summary=entry.get("summary", ""),
                url=entry.get("link", ""),
            )
        )

    return NewsResponse(ticker=ticker.upper(), articles=articles)


async def get_news(ticker: str, limit: int = 10) -> NewsResponse:
    """Fetch latest news from Yahoo Finance RSS. Cached for 15 minutes."""
    cache_key = f"{ticker.upper()}:{limit}"
    cached: NewsResponse | None = _news_cache.get(cache_key)
    if cached is not None:
        return cached

    response: NewsResponse = await asyncio.to_thread(_sync_fetch_news, ticker, limit)
    _news_cache[cache_key] = response
    return response
