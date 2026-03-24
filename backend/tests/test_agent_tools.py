from datetime import date
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest

from app.agent.tools import _execute_tool
from app.models.macro import MacroCountry
from app.models.macro import MacroDataPoint
from app.models.macro import MacroIndicator
from app.models.macro import MacroSnapshot
from app.models.market import TickerOverview


def _fake_indicator(
    series_id: str, name: str, value: float, unit: str = "%"
) -> MacroIndicator:
    return MacroIndicator(
        series_id=series_id,
        name=name,
        latest_value=value,
        latest_date=date(2024, 12, 1),
        unit=unit,
        history=[
            MacroDataPoint(date=date(2024, 11, 1), value=value - 0.1),
            MacroDataPoint(date=date(2024, 12, 1), value=value),
        ],
    )


def _fake_snapshot() -> MacroSnapshot:
    return MacroSnapshot(
        fed_funds_rate=_fake_indicator("FEDFUNDS", "Federal Funds Rate", 5.33),
        cpi=_fake_indicator("CPIAUCSL", "Consumer Price Index", 314.69, "index"),
        gdp_growth=_fake_indicator(
            "A191RL1Q225SBEA", "Real GDP Growth (Quarterly)", 3.1
        ),
        treasury_10y=_fake_indicator("DGS10", "10-Year Treasury Yield", 4.25),
        unemployment=_fake_indicator("UNRATE", "Unemployment Rate", 4.2),
    )


def _fake_overview() -> TickerOverview:
    return TickerOverview(
        symbol="AAPL",
        name="Apple Inc.",
        currency="USD",
        exchange="NMS",
        current_price=195.0,
        previous_close=193.5,
        change=1.5,
        change_percent=0.7752,
        volume=55_000_000,
        market_cap=3_000_000_000_000,
        fifty_two_week_high=199.62,
        fifty_two_week_low=164.08,
    )


@pytest.mark.anyio
@patch(
    "app.agent.tools.yfinance_service.get_ticker_overview",
    new_callable=AsyncMock,
)
async def test_stock_overview_display_uses_count_units_for_volume(
    mock_get_overview: AsyncMock,
) -> None:
    mock_get_overview.return_value = _fake_overview()

    _result, displays = await _execute_tool("get_stock_overview", {"symbol": "AAPL"})

    assert displays == [
        {
            "type": "display_metric",
            "data": {
                "metrics": [
                    {"label": "Apple Inc.", "value": "$195.00"},
                    {"label": "Change", "value": "+0.78%"},
                    {"label": "Market Cap", "value": "$3.0T"},
                    {"label": "Volume", "value": "55.0M"},
                ]
            },
        }
    ]


@pytest.mark.anyio
@patch(
    "app.agent.tools.fred_service.get_macro_snapshot_for_country",
    new_callable=AsyncMock,
)
async def test_macro_display_respects_indicator_units(
    mock_get_snapshot: AsyncMock,
) -> None:
    mock_get_snapshot.return_value = _fake_snapshot()

    _result, displays = await _execute_tool("get_macro_snapshot", {})

    assert displays == [
        {
            "type": "display_metric",
            "data": {
                "metrics": [
                    {"label": "Fed Funds", "value": "5.33%"},
                    {"label": "CPI", "value": "314.7"},
                    {"label": "GDP Growth", "value": "3.1%"},
                    {"label": "Unemployment", "value": "4.2%"},
                ]
            },
        }
    ]
    mock_get_snapshot.assert_awaited_once()


@pytest.mark.anyio
@patch(
    "app.agent.tools.fred_service.get_macro_snapshot_for_country",
    new_callable=AsyncMock,
)
async def test_macro_tool_forwards_country_context(
    mock_get_snapshot: AsyncMock,
) -> None:
    mock_get_snapshot.return_value = _fake_snapshot()

    await _execute_tool("get_macro_snapshot", {"country": "fr"})

    mock_get_snapshot.assert_awaited_once_with(MacroCountry.FR)
