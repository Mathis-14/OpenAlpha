import asyncio
import logging
from typing import Any

from cachetools import TTLCache
from edgar import Company
from edgar import set_identity

from app.config import settings
from app.exceptions import ProviderTimeoutError
from app.models.filings import Filing
from app.models.filings import FilingSection
from app.models.filings import FilingsResponse

logger = logging.getLogger(__name__)

set_identity(settings.edgar_user_agent)

_CACHE_TTL = 1800  # 30 minutes
_CACHE_MAX = 64

_filings_cache: TTLCache[str, FilingsResponse] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)

_SECTION_KEYS_10K = {
    "Item 1": "Business",
    "Item 1A": "Risk Factors",
    "Item 7": "Management's Discussion and Analysis",
}

_SECTION_KEYS_10Q = {
    "Item 1": "Financial Statements",
    "Item 1A": "Risk Factors",
    "Item 2": "Management's Discussion and Analysis",
}

_MAX_SECTION_LENGTH = 15_000


def _extract_sections(
    filing_obj: Any,
    section_keys: dict[str, str],
) -> list[FilingSection]:
    sections: list[FilingSection] = []
    for item_key, title in section_keys.items():
        try:
            content = filing_obj[item_key]
            if content:
                text = str(content).strip()
                if len(text) > _MAX_SECTION_LENGTH:
                    text = text[:_MAX_SECTION_LENGTH] + "\n\n[...truncated]"
                sections.append(FilingSection(title=title, content=text))
        except (KeyError, IndexError, TypeError):
            logger.debug("Section %s not found in filing", item_key)
    return sections


def _build_filing(raw_filing: Any, form_type: str) -> Filing | None:
    try:
        filing_obj = raw_filing.obj()
    except Exception:
        logger.warning("Could not parse filing %s", raw_filing.accession_no)
        return None

    section_keys = _SECTION_KEYS_10K if "10-K" in form_type else _SECTION_KEYS_10Q
    sections = _extract_sections(filing_obj, section_keys)

    accession = str(raw_filing.accession_no)
    sec_url = f"https://www.sec.gov/Archives/edgar/data/{raw_filing.cik}/{accession.replace('-', '')}/{accession}-index.htm"

    return Filing(
        form_type=form_type,
        filing_date=raw_filing.filing_date,
        accession_number=accession,
        sec_url=sec_url,
        sections=sections,
    )


def _sync_fetch_filings(
    ticker: str,
    form_type: str,
    limit: int,
) -> FilingsResponse:
    company = Company(ticker)
    raw_filings = company.get_filings(form=form_type)

    filings: list[Filing] = []
    for raw in raw_filings[:limit]:
        filing = _build_filing(raw, form_type)
        if filing is not None:
            filings.append(filing)

    return FilingsResponse(ticker=ticker.upper(), filings=filings)


async def get_filings(
    ticker: str,
    form_type: str = "10-K",
    limit: int = 3,
) -> FilingsResponse:
    """Fetch and parse SEC filings. Cached for 30 minutes."""
    cache_key = f"{ticker.upper()}:{form_type}:{limit}"
    cached: FilingsResponse | None = _filings_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        response: FilingsResponse = await asyncio.wait_for(
            asyncio.to_thread(_sync_fetch_filings, ticker, form_type, limit),
            timeout=10.0,
        )
    except TimeoutError:
        raise ProviderTimeoutError(provider="edgar") from None
    _filings_cache[cache_key] = response
    return response
