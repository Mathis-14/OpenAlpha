import asyncio
import logging
import re
from typing import Any

import yfinance as yf
from fastapi import APIRouter
from fastapi import Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])

_SEARCH_TIMEOUT = 5.0
_MAX_RESULTS = 8
_SYMBOL_PATTERN = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")


def _build_results(quotes: list[dict[str, Any]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    results: list[dict[str, str]] = []

    for item in quotes:
        symbol = str(item.get("symbol", "")).upper().strip()
        name = str(item.get("shortname") or item.get("longname") or "").strip()
        if not symbol or symbol in seen:
            continue

        seen.add(symbol)
        results.append({"symbol": symbol, "name": name or symbol})
        if len(results) >= _MAX_RESULTS:
            break

    return results


def _is_symbol_query(query: str) -> bool:
    normalized = query.strip().upper()
    if not _SYMBOL_PATTERN.fullmatch(normalized):
        return False

    if "." in normalized or "-" in normalized:
        return True

    if any(char.isdigit() for char in normalized):
        return True

    return normalized.isalpha() and len(normalized) <= 4


def _search_yfinance(query: str) -> list[dict[str, str]]:
    try:
        results = yf.search(query, max_results=_MAX_RESULTS)
        quotes = results.get("quotes", []) if isinstance(results, dict) else []
        return _build_results(quotes)
    except Exception:
        logger.warning("yfinance search failed for q=%s", query)
        return []


def _lookup_exact_symbol(symbol: str) -> list[dict[str, str]]:
    try:
        info = yf.Ticker(symbol).info
    except Exception:
        logger.warning("yfinance ticker lookup failed for q=%s", symbol)
        return []

    if not isinstance(info, dict):
        return []

    resolved_symbol = str(info.get("symbol") or symbol).upper().strip()
    name = str(info.get("shortName") or info.get("longName") or "").strip()
    if not resolved_symbol:
        return []

    has_identity = bool(name) or any(
        info.get(field) is not None
        for field in ("currentPrice", "regularMarketPrice", "marketCap")
    )
    if not has_identity:
        return []

    return [{"symbol": resolved_symbol, "name": name or resolved_symbol}]


@router.get("")
async def search_tickers(
    q: str = Query(..., min_length=1, max_length=20),
) -> list[dict[str, str]]:
    """Search for tickers by symbol or company name via yfinance."""
    query = q.strip()
    try:
        results = await asyncio.wait_for(
            asyncio.to_thread(_search_yfinance, query), timeout=_SEARCH_TIMEOUT
        )
    except TimeoutError:
        logger.warning("yfinance search timed out for q=%s", query)
        results = []

    if results or not _is_symbol_query(query):
        return results

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_lookup_exact_symbol, query.upper()),
            timeout=_SEARCH_TIMEOUT,
        )
    except TimeoutError:
        logger.warning("yfinance ticker lookup timed out for q=%s", query)
        return []
