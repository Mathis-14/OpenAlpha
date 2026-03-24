from datetime import date
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.exceptions import UpstreamDataError
from app.models.macro import MacroCountry
from app.models.macro import MacroDataPoint
from app.models.macro import MacroHistoryRange
from app.models.macro import MacroIndicator
from app.models.macro import MacroIndicatorSlug
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
    "app.routers.macro.fred_service.get_macro_snapshot_for_country",
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
    mock_get.assert_awaited_once_with(MacroCountry.US)


@pytest.mark.anyio
@patch(
    "app.routers.macro.fred_service.get_macro_snapshot_for_country",
    new_callable=AsyncMock,
)
async def test_macro_error_returns_503(mock_get: AsyncMock, client: AsyncClient):
    mock_get.side_effect = UpstreamDataError(
        provider="fred", detail="FRED API unreachable"
    )

    response = await client.get("/api/macro")

    assert response.status_code == 503
    assert response.json()["error"] == "upstream_unavailable"
    assert response.json()["provider"] == "fred"


@pytest.mark.anyio
@patch(
    "app.routers.macro.fred_service.get_macro_snapshot_for_country",
    new_callable=AsyncMock,
)
async def test_get_macro_data_for_france(
    mock_get: AsyncMock, client: AsyncClient
) -> None:
    mock_get.return_value = _fake_snapshot()

    response = await client.get("/api/macro?country=fr")

    assert response.status_code == 200
    mock_get.assert_awaited_once_with(MacroCountry.FR)


@pytest.mark.anyio
@patch(
    "app.routers.macro.fred_service.get_macro_indicator",
    new_callable=AsyncMock,
)
async def test_get_macro_series(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_indicator("FEDFUNDS", "Federal Funds Rate", 5.33)

    response = await client.get("/api/macro/series/fed-funds?range=5y")

    assert response.status_code == 200
    data = response.json()
    assert data["series_id"] == "FEDFUNDS"
    assert data["name"] == "Federal Funds Rate"
    assert len(data["history"]) == 2
    mock_get.assert_awaited_once_with(
        MacroIndicatorSlug.FED_FUNDS, MacroHistoryRange.FIVE_YEARS, MacroCountry.US
    )


@pytest.mark.anyio
@patch(
    "app.routers.macro.fred_service.get_macro_indicator",
    new_callable=AsyncMock,
)
async def test_get_macro_series_for_france(
    mock_get: AsyncMock, client: AsyncClient
) -> None:
    mock_get.return_value = _fake_indicator("ECBDFR", "ECB Deposit Facility Rate", 2.0)

    response = await client.get("/api/macro/series/fed-funds?range=5y&country=fr")

    assert response.status_code == 200
    mock_get.assert_awaited_once_with(
        MacroIndicatorSlug.FED_FUNDS, MacroHistoryRange.FIVE_YEARS, MacroCountry.FR
    )


@pytest.mark.anyio
async def test_invalid_macro_series_returns_422(client: AsyncClient):
    response = await client.get("/api/macro/series/not-real?range=5y")

    assert response.status_code == 422
