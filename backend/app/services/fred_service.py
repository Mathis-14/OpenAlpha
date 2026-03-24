import asyncio
import logging
import math
from datetime import date
from datetime import timedelta
from typing import Any
from typing import TypedDict

import fedfred as fd
from cachetools import TTLCache

from app.config import settings
from app.exceptions import ProviderTimeoutError
from app.exceptions import UpstreamDataError
from app.models.macro import MacroCountry
from app.models.macro import MacroDataPoint
from app.models.macro import MacroHistoryRange
from app.models.macro import MacroIndicator
from app.models.macro import MacroIndicatorSlug
from app.models.macro import MacroSnapshot

logger = logging.getLogger(__name__)

_CACHE_TTL = 3600  # 1 hour -- macro data updates infrequently
_CACHE_MAX = 32

_snapshot_cache: TTLCache[str, MacroSnapshot] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)
_series_cache: TTLCache[str, list[dict[str, Any]]] = TTLCache(
    maxsize=_CACHE_MAX, ttl=_CACHE_TTL
)


class SeriesConfig(TypedDict):
    series_id: str
    name: str
    unit: str
    snapshot_key: str


SERIES_CONFIG: dict[MacroCountry, dict[MacroIndicatorSlug, SeriesConfig]] = {
    MacroCountry.US: {
        MacroIndicatorSlug.FED_FUNDS: {
            "series_id": "FEDFUNDS",
            "name": "Federal Funds Rate",
            "unit": "%",
            "snapshot_key": "fed_funds_rate",
        },
        MacroIndicatorSlug.CPI: {
            "series_id": "CPIAUCSL",
            "name": "Consumer Price Index",
            "unit": "index",
            "snapshot_key": "cpi",
        },
        MacroIndicatorSlug.GDP_GROWTH: {
            "series_id": "USAGDPRQPSMEI",
            "name": "Real GDP Growth",
            "unit": "%",
            "snapshot_key": "gdp_growth",
        },
        MacroIndicatorSlug.TREASURY_10Y: {
            "series_id": "DGS10",
            "name": "10-Year Treasury Yield",
            "unit": "%",
            "snapshot_key": "treasury_10y",
        },
        MacroIndicatorSlug.UNEMPLOYMENT: {
            "series_id": "UNRATE",
            "name": "Unemployment Rate",
            "unit": "%",
            "snapshot_key": "unemployment",
        },
    },
    MacroCountry.FR: {
        MacroIndicatorSlug.FED_FUNDS: {
            "series_id": "ECBDFR",
            "name": "ECB Deposit Facility Rate",
            "unit": "%",
            "snapshot_key": "fed_funds_rate",
        },
        MacroIndicatorSlug.CPI: {
            "series_id": "CP0000FRM086NEST",
            "name": "Consumer Price Index",
            "unit": "index",
            "snapshot_key": "cpi",
        },
        MacroIndicatorSlug.GDP_GROWTH: {
            "series_id": "FRAGDPRQPSMEI",
            "name": "Real GDP Growth",
            "unit": "%",
            "snapshot_key": "gdp_growth",
        },
        MacroIndicatorSlug.TREASURY_10Y: {
            "series_id": "IRLTLT01FRM156N",
            "name": "10-Year Government Bond Yield",
            "unit": "%",
            "snapshot_key": "treasury_10y",
        },
        MacroIndicatorSlug.UNEMPLOYMENT: {
            "series_id": "LRHUADTTFRM156S",
            "name": "Unemployment Rate",
            "unit": "%",
            "snapshot_key": "unemployment",
        },
    },
}

_HISTORY_LIMIT = 24
_MAX_SERIES_POINTS = 400
_RANGE_DAYS: dict[MacroHistoryRange, int | None] = {
    MacroHistoryRange.ONE_YEAR: 365,
    MacroHistoryRange.THREE_YEARS: 365 * 3,
    MacroHistoryRange.FIVE_YEARS: 365 * 5,
    MacroHistoryRange.TEN_YEARS: 365 * 10,
    MacroHistoryRange.MAX: None,
}


def _sync_fetch_series(
    series_id: str,
) -> list[dict[str, Any]]:
    """Fetch observations synchronously via fedfred. Returns raw dicts."""
    fred = fd.FredAPI(api_key=settings.fred_api_key)
    df = fred.get_series_observations(series_id)

    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        raw_val = row.get("value", row.get("Value", None))
        if raw_val is None or str(raw_val).strip() == ".":
            continue
        value = float(raw_val)
        if not math.isfinite(value):
            continue
        raw_date = row.get("date", row.get("Date", row.name))
        records.append({"date": str(raw_date)[:10], "value": value})
    return records


def _build_indicator(
    config: SeriesConfig,
    raw_records: list[dict[str, Any]],
) -> MacroIndicator:
    history = [
        MacroDataPoint(date=date.fromisoformat(r["date"]), value=r["value"])
        for r in raw_records
    ]

    if not history:
        raise UpstreamDataError(
            provider="fred", detail=f"No observations for {config['series_id']}"
        )
    latest = history[-1]

    return MacroIndicator(
        series_id=config["series_id"],
        name=config["name"],
        latest_value=latest.value,
        latest_date=latest.date,
        unit=config["unit"],
        history=history,
    )


def _get_series_records(series_id: str) -> list[dict[str, Any]]:
    cached: list[dict[str, Any]] | None = _series_cache.get(series_id)
    if cached is not None:
        return cached

    records = _sync_fetch_series(series_id)
    _series_cache[series_id] = records
    return records


def _filter_records_for_range(
    records: list[dict[str, Any]], history_range: MacroHistoryRange
) -> list[dict[str, Any]]:
    range_days = _RANGE_DAYS[history_range]
    if range_days is None or not records:
        filtered = records
    else:
        latest = date.fromisoformat(records[-1]["date"])
        cutoff = latest - timedelta(days=range_days)
        filtered = [
            record for record in records if date.fromisoformat(record["date"]) >= cutoff
        ]

    if not filtered:
        return records[-1:]
    return filtered


def _downsample_records(
    records: list[dict[str, Any]], max_points: int = _MAX_SERIES_POINTS
) -> list[dict[str, Any]]:
    if len(records) <= max_points:
        return records

    if max_points < 2:
        return [records[-1]]

    step = (len(records) - 1) / (max_points - 1)
    indexes = {round(i * step) for i in range(max_points)}
    indexes.add(len(records) - 1)
    return [records[index] for index in sorted(indexes)]


def _sync_fetch_all() -> MacroSnapshot:
    results: dict[str, MacroIndicator] = {}
    for config in SERIES_CONFIG[MacroCountry.US].values():
        raw = _get_series_records(config["series_id"])
        results[config["snapshot_key"]] = _build_indicator(
            config, raw[-_HISTORY_LIMIT:]
        )

    return MacroSnapshot(
        fed_funds_rate=results["fed_funds_rate"],
        cpi=results["cpi"],
        gdp_growth=results["gdp_growth"],
        treasury_10y=results["treasury_10y"],
        unemployment=results["unemployment"],
    )


async def get_macro_snapshot() -> MacroSnapshot:
    """Fetch all macro indicators. Cached for 1 hour."""
    cached: MacroSnapshot | None = _snapshot_cache.get(MacroCountry.US.value)
    if cached is not None:
        return cached

    try:
        snapshot: MacroSnapshot = await asyncio.wait_for(
            asyncio.to_thread(_sync_fetch_all), timeout=10.0
        )
    except TimeoutError:
        raise ProviderTimeoutError(provider="fred") from None
    _snapshot_cache[MacroCountry.US.value] = snapshot
    return snapshot


async def get_macro_indicator(
    indicator: MacroIndicatorSlug,
    history_range: MacroHistoryRange = MacroHistoryRange.FIVE_YEARS,
    country: MacroCountry = MacroCountry.US,
) -> MacroIndicator:
    """Fetch a single macro indicator for the requested history range."""
    config = SERIES_CONFIG[country][indicator]

    try:
        raw_records = await asyncio.wait_for(
            asyncio.to_thread(_get_series_records, config["series_id"]), timeout=10.0
        )
    except TimeoutError:
        raise ProviderTimeoutError(provider="fred") from None

    filtered = _filter_records_for_range(raw_records, history_range)
    return _build_indicator(config, _downsample_records(filtered))


def _snapshot_cache_key(country: MacroCountry) -> str:
    return f"snapshot:{country.value}"


async def get_macro_snapshot_for_country(
    country: MacroCountry = MacroCountry.US,
) -> MacroSnapshot:
    """Fetch all macro indicators for a selected country. Cached for 1 hour."""
    cache_key = _snapshot_cache_key(country)
    cached: MacroSnapshot | None = _snapshot_cache.get(cache_key)
    if cached is not None:
        return cached

    def _sync_fetch_country_snapshot() -> MacroSnapshot:
        results: dict[str, MacroIndicator] = {}
        for config in SERIES_CONFIG[country].values():
            raw = _get_series_records(config["series_id"])
            results[config["snapshot_key"]] = _build_indicator(
                config, raw[-_HISTORY_LIMIT:]
            )

        return MacroSnapshot(
            fed_funds_rate=results["fed_funds_rate"],
            cpi=results["cpi"],
            gdp_growth=results["gdp_growth"],
            treasury_10y=results["treasury_10y"],
            unemployment=results["unemployment"],
        )

    try:
        snapshot: MacroSnapshot = await asyncio.wait_for(
            asyncio.to_thread(_sync_fetch_country_snapshot), timeout=10.0
        )
    except TimeoutError:
        raise ProviderTimeoutError(provider="fred") from None

    _snapshot_cache[cache_key] = snapshot
    return snapshot
