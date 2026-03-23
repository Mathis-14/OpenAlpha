import asyncio
import logging
from datetime import date
from typing import Any

import fedfred as fd
from cachetools import TTLCache

from app.config import settings
from app.models.macro import MacroDataPoint
from app.models.macro import MacroIndicator
from app.models.macro import MacroSnapshot

logger = logging.getLogger(__name__)

_CACHE_TTL = 3600  # 1 hour -- macro data updates infrequently
_CACHE_MAX = 32

_snapshot_cache: TTLCache[str, MacroSnapshot] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)

SERIES_CONFIG: dict[str, dict[str, str]] = {
    "FEDFUNDS": {"name": "Federal Funds Rate", "unit": "%"},
    "CPIAUCSL": {"name": "Consumer Price Index", "unit": "index"},
    "A191RL1Q225SBEA": {"name": "Real GDP Growth (Quarterly)", "unit": "%"},
    "DGS10": {"name": "10-Year Treasury Yield", "unit": "%"},
    "UNRATE": {"name": "Unemployment Rate", "unit": "%"},
}

_HISTORY_LIMIT = 24


def _sync_fetch_series(
    series_id: str,
) -> list[dict[str, Any]]:
    """Fetch observations synchronously via fedfred. Returns raw dicts."""
    fred = fd.FredAPI(api_key=settings.fred_api_key)
    df = fred.get_series_observations(series_id)

    records: list[dict[str, Any]] = []
    for _, row in df.tail(_HISTORY_LIMIT).iterrows():
        raw_val = row.get("value", row.get("Value", None))
        if raw_val is None or str(raw_val).strip() == ".":
            continue
        raw_date = row.get("date", row.get("Date", row.name))
        records.append({"date": str(raw_date)[:10], "value": float(raw_val)})
    return records


def _build_indicator(
    series_id: str,
    raw_records: list[dict[str, Any]],
) -> MacroIndicator:
    config = SERIES_CONFIG[series_id]
    history = [
        MacroDataPoint(date=date.fromisoformat(r["date"]), value=r["value"])
        for r in raw_records
    ]

    latest = history[-1] if history else MacroDataPoint(date=date.today(), value=0.0)

    return MacroIndicator(
        series_id=series_id,
        name=config["name"],
        latest_value=latest.value,
        latest_date=latest.date,
        unit=config["unit"],
        history=history,
    )


def _sync_fetch_all() -> MacroSnapshot:
    results: dict[str, MacroIndicator] = {}
    for series_id in SERIES_CONFIG:
        raw = _sync_fetch_series(series_id)
        results[series_id] = _build_indicator(series_id, raw)

    return MacroSnapshot(
        fed_funds_rate=results["FEDFUNDS"],
        cpi=results["CPIAUCSL"],
        gdp_growth=results["A191RL1Q225SBEA"],
        treasury_10y=results["DGS10"],
        unemployment=results["UNRATE"],
    )


async def get_macro_snapshot() -> MacroSnapshot:
    """Fetch all macro indicators. Cached for 1 hour."""
    cached: MacroSnapshot | None = _snapshot_cache.get("snapshot")
    if cached is not None:
        return cached

    snapshot: MacroSnapshot = await asyncio.to_thread(_sync_fetch_all)
    _snapshot_cache["snapshot"] = snapshot
    return snapshot
