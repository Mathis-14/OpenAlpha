from datetime import date
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.models.macro import MacroDataPoint
from app.models.macro import MacroIndicator
from app.models.macro import MacroSnapshot


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


@pytest.mark.anyio
@patch(
    "app.routers.macro.fred_service.get_macro_snapshot",
    new_callable=AsyncMock,
)
async def test_get_macro_data(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_snapshot()

    response = await client.get("/api/macro")

    assert response.status_code == 200
    data = response.json()
    assert data["fed_funds_rate"]["latest_value"] == 5.33
    assert data["fed_funds_rate"]["series_id"] == "FEDFUNDS"
    assert data["cpi"]["unit"] == "index"
    assert data["treasury_10y"]["name"] == "10-Year Treasury Yield"
    assert data["unemployment"]["latest_value"] == 4.2
    assert len(data["gdp_growth"]["history"]) == 2
    mock_get.assert_awaited_once()


@pytest.mark.anyio
@patch(
    "app.routers.macro.fred_service.get_macro_snapshot",
    new_callable=AsyncMock,
)
async def test_macro_error_returns_502(mock_get: AsyncMock, client: AsyncClient):
    mock_get.side_effect = Exception("FRED API unreachable")

    response = await client.get("/api/macro")

    assert response.status_code == 502
    assert "FRED" in response.json()["detail"]
