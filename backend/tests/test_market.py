from datetime import date
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.models.market import Fundamentals
from app.models.market import MarketResponse
from app.models.market import PricePoint
from app.models.market import TickerOverview


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


def _fake_fundamentals() -> Fundamentals:
    return Fundamentals(
        pe_ratio=28.5,
        forward_pe=26.1,
        eps=6.84,
        revenue=383_000_000_000,
        ebitda=130_000_000_000,
        gross_margin=0.4556,
        operating_margin=0.3082,
        profit_margin=0.2631,
        debt_to_equity=176.3,
        return_on_equity=1.4728,
        dividend_yield=0.0052,
    )


def _fake_history() -> list[PricePoint]:
    return [
        PricePoint(
            date=date(2024, 1, 2),
            open=187.15,
            high=188.44,
            low=185.83,
            close=186.76,
            volume=45_000_000,
        ),
        PricePoint(
            date=date(2024, 1, 3),
            open=186.09,
            high=186.74,
            low=184.35,
            close=185.64,
            volume=42_000_000,
        ),
    ]


def _fake_market_response() -> MarketResponse:
    return MarketResponse(
        overview=_fake_overview(),
        fundamentals=_fake_fundamentals(),
        price_history=_fake_history(),
    )


@pytest.mark.anyio
@patch(
    "app.routers.market.yfinance_service.get_market_data",
    new_callable=AsyncMock,
)
async def test_get_market_data(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_market_response()

    response = await client.get("/api/market/AAPL?period=1mo")

    assert response.status_code == 200
    data = response.json()
    assert data["overview"]["symbol"] == "AAPL"
    assert data["overview"]["current_price"] == 195.0
    assert len(data["price_history"]) == 2
    assert data["fundamentals"]["pe_ratio"] == 28.5
    mock_get.assert_awaited_once_with("AAPL", "1mo")


@pytest.mark.anyio
@patch(
    "app.routers.market.yfinance_service.get_ticker_overview",
    new_callable=AsyncMock,
)
async def test_get_overview(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_overview()

    response = await client.get("/api/market/AAPL/overview")

    assert response.status_code == 200
    assert response.json()["name"] == "Apple Inc."
    mock_get.assert_awaited_once_with("AAPL")


@pytest.mark.anyio
@patch(
    "app.routers.market.yfinance_service.get_fundamentals",
    new_callable=AsyncMock,
)
async def test_get_fundamentals(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_fundamentals()

    response = await client.get("/api/market/AAPL/fundamentals")

    assert response.status_code == 200
    assert response.json()["eps"] == 6.84
    mock_get.assert_awaited_once_with("AAPL")


@pytest.mark.anyio
@patch(
    "app.routers.market.yfinance_service.get_price_history",
    new_callable=AsyncMock,
)
async def test_get_history(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_history()

    response = await client.get("/api/market/AAPL/history?period=5d")

    assert response.status_code == 200
    assert len(response.json()) == 2
    mock_get.assert_awaited_once_with("AAPL", "5d")


@pytest.mark.anyio
@patch(
    "app.routers.market.yfinance_service.get_market_data",
    new_callable=AsyncMock,
)
async def test_invalid_ticker_returns_404(mock_get: AsyncMock, client: AsyncClient):
    mock_get.side_effect = Exception("No data found")

    response = await client.get("/api/market/ZZZZZ")

    assert response.status_code == 404
    assert "ZZZZZ" in response.json()["detail"]
