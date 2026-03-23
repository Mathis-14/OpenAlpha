import asyncio
import logging
from typing import Any

import yfinance as yf
from cachetools import TTLCache

from app.exceptions import UpstreamDataError
from app.models.market import Fundamentals
from app.models.market import MarketResponse
from app.models.market import PeriodType
from app.models.market import PricePoint
from app.models.market import TickerOverview

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # 5 minutes
_CACHE_MAX = 256

_overview_cache: TTLCache[str, TickerOverview] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)
_fundamentals_cache: TTLCache[str, Fundamentals] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)
_history_cache: TTLCache[str, list[PricePoint]] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)


def _build_overview(info: dict[str, Any]) -> TickerOverview:
    current = float(info.get("currentPrice") or info.get("regularMarketPrice") or 0)
    previous = float(
        info.get("previousClose") or info.get("regularMarketPreviousClose") or 0
    )

    if current == 0.0 and previous == 0.0:
        raise UpstreamDataError(
            provider="yfinance",
            detail=f"No price data for symbol '{info.get('symbol', '?')}'",
        )

    change = current - previous
    change_pct = (change / previous * 100) if previous else 0.0

    return TickerOverview(
        symbol=str(info.get("symbol", "")),
        name=str(info.get("shortName") or info.get("longName", "")),
        currency=str(info.get("currency", "USD")),
        exchange=str(info.get("exchange", "")),
        current_price=current,
        previous_close=previous,
        change=round(change, 4),
        change_percent=round(change_pct, 4),
        volume=int(info.get("volume") or info.get("regularMarketVolume") or 0),
        market_cap=info.get("marketCap"),
        fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
        fifty_two_week_low=info.get("fiftyTwoWeekLow"),
    )


def _build_fundamentals(info: dict[str, Any]) -> Fundamentals:
    return Fundamentals(
        pe_ratio=info.get("trailingPE"),
        forward_pe=info.get("forwardPE"),
        eps=info.get("trailingEps"),
        revenue=info.get("totalRevenue"),
        ebitda=info.get("ebitda"),
        gross_margin=info.get("grossMargins"),
        operating_margin=info.get("operatingMargins"),
        profit_margin=info.get("profitMargins"),
        debt_to_equity=info.get("debtToEquity"),
        return_on_equity=info.get("returnOnEquity"),
        dividend_yield=info.get("dividendYield"),
    )


def _build_history(ticker: yf.Ticker, period: PeriodType) -> list[PricePoint]:
    df = ticker.history(period=period)
    if df.empty:
        return []

    points: list[PricePoint] = []
    for idx, row in df.iterrows():
        points.append(
            PricePoint(
                date=idx.date() if hasattr(idx, "date") else idx,
                open=round(float(row["Open"]), 4),
                high=round(float(row["High"]), 4),
                low=round(float(row["Low"]), 4),
                close=round(float(row["Close"]), 4),
                volume=int(row["Volume"]),
            )
        )
    return points


def _sync_fetch_overview(symbol: str) -> TickerOverview:
    ticker = yf.Ticker(symbol)
    info: dict[str, Any] = ticker.info
    return _build_overview(info)


def _sync_fetch_fundamentals(symbol: str) -> Fundamentals:
    ticker = yf.Ticker(symbol)
    info: dict[str, Any] = ticker.info
    return _build_fundamentals(info)


def _sync_fetch_history(symbol: str, period: PeriodType) -> list[PricePoint]:
    ticker = yf.Ticker(symbol)
    return _build_history(ticker, period)


def _sync_fetch_all(
    symbol: str, period: PeriodType
) -> tuple[TickerOverview, Fundamentals, list[PricePoint]]:
    ticker = yf.Ticker(symbol)
    info: dict[str, Any] = ticker.info
    overview = _build_overview(info)
    fundamentals = _build_fundamentals(info)
    history = _build_history(ticker, period)
    return overview, fundamentals, history


async def get_market_data(
    symbol: str,
    period: PeriodType = "1mo",
) -> MarketResponse:
    """Fetch full market data for a ticker. Uses TTL cache to avoid hammering Yahoo."""
    upper = symbol.upper()
    cache_key = f"{upper}:{period}"

    cached_overview = _overview_cache.get(upper)
    cached_fundamentals = _fundamentals_cache.get(upper)
    cached_history = _history_cache.get(cache_key)

    if (
        cached_overview is not None
        and cached_fundamentals is not None
        and cached_history is not None
    ):
        return MarketResponse(
            overview=cached_overview,
            fundamentals=cached_fundamentals,
            price_history=cached_history,
        )

    overview, fundamentals, history = await asyncio.to_thread(
        _sync_fetch_all, upper, period
    )

    _overview_cache[upper] = overview
    _fundamentals_cache[upper] = fundamentals
    _history_cache[cache_key] = history

    return MarketResponse(
        overview=overview,
        fundamentals=fundamentals,
        price_history=history,
    )


async def get_ticker_overview(symbol: str) -> TickerOverview:
    """Fetch only the overview for a ticker."""
    upper = symbol.upper()
    cached: TickerOverview | None = _overview_cache.get(upper)
    if cached is not None:
        return cached

    overview: TickerOverview = await asyncio.to_thread(_sync_fetch_overview, upper)
    _overview_cache[upper] = overview
    return overview


async def get_fundamentals(symbol: str) -> Fundamentals:
    """Fetch only fundamentals for a ticker."""
    upper = symbol.upper()
    cached: Fundamentals | None = _fundamentals_cache.get(upper)
    if cached is not None:
        return cached

    fundamentals: Fundamentals = await asyncio.to_thread(
        _sync_fetch_fundamentals, upper
    )
    _fundamentals_cache[upper] = fundamentals
    return fundamentals


async def get_price_history(
    symbol: str, period: PeriodType = "1mo"
) -> list[PricePoint]:
    """Fetch OHLCV price history for a ticker."""
    cache_key = f"{symbol.upper()}:{period}"
    cached: list[PricePoint] | None = _history_cache.get(cache_key)
    if cached is not None:
        return cached

    history: list[PricePoint] = await asyncio.to_thread(
        _sync_fetch_history, symbol.upper(), period
    )
    _history_cache[cache_key] = history
    return history
