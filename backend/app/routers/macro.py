from fastapi import APIRouter

from app.models.macro import MacroCountry
from app.models.macro import MacroHistoryRange
from app.models.macro import MacroIndicator
from app.models.macro import MacroIndicatorSlug
from app.models.macro import MacroSnapshot
from app.services import fred_service

router = APIRouter(prefix="/api/macro", tags=["macro"])


@router.get("", response_model=MacroSnapshot)
async def get_macro_data(country: MacroCountry = MacroCountry.US) -> MacroSnapshot:
    """Current macroeconomic indicators with short history."""
    return await fred_service.get_macro_snapshot_for_country(country)


@router.get("/series/{indicator}", response_model=MacroIndicator)
async def get_macro_series(
    indicator: MacroIndicatorSlug,
    range: MacroHistoryRange = MacroHistoryRange.FIVE_YEARS,
    country: MacroCountry = MacroCountry.US,
) -> MacroIndicator:
    """Chartable history for a single curated macro indicator."""
    return await fred_service.get_macro_indicator(indicator, range, country)
