import asyncio
import logging

import yfinance as yf
from fastapi import APIRouter
from fastapi import Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])

_SEARCH_TIMEOUT = 5.0


@router.get("")
async def search_tickers(
    q: str = Query(..., min_length=1, max_length=20),
) -> list[dict[str, str]]:
    """Search for tickers by symbol or company name via yfinance."""

    def _search() -> list[dict[str, str]]:
        try:
            results = yf.search(q, max_results=8)
            quotes = results.get("quotes", []) if isinstance(results, dict) else []
            return [
                {
                    "symbol": item.get("symbol", ""),
                    "name": item.get("shortname", item.get("longname", "")),
                }
                for item in quotes
                if item.get("symbol")
            ]
        except Exception:
            logger.warning("yfinance search failed for q=%s", q)
            return []

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_search), timeout=_SEARCH_TIMEOUT
        )
    except TimeoutError:
        return []
