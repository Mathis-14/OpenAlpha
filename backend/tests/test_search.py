from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@patch("app.routers.search.yf.search")
async def test_search_returns_normalized_deduped_results(
    mock_search: MagicMock,
    client: AsyncClient,
) -> None:
    mock_search.return_value = {
        "quotes": [
            {"symbol": "aapl", "shortname": "Apple Inc."},
            {"symbol": "AAPL", "longname": "Apple Duplicate"},
            {"symbol": "MSFT", "longname": "Microsoft Corporation"},
        ]
    }

    response = await client.get("/api/search?q=apple")

    assert response.status_code == 200
    assert response.json() == [
        {"symbol": "AAPL", "name": "Apple Inc."},
        {"symbol": "MSFT", "name": "Microsoft Corporation"},
    ]


@pytest.mark.anyio
@patch("app.routers.search.yf.Ticker")
@patch("app.routers.search.yf.search")
async def test_search_falls_back_to_exact_symbol_lookup_when_search_fails(
    mock_search: MagicMock,
    mock_ticker_cls: MagicMock,
    client: AsyncClient,
) -> None:
    mock_search.side_effect = Exception("Yahoo search unavailable")

    mock_ticker = MagicMock()
    mock_ticker.info = {
        "symbol": "AAPL",
        "shortName": "Apple Inc.",
        "regularMarketPrice": 195.0,
    }
    mock_ticker_cls.return_value = mock_ticker

    response = await client.get("/api/search?q=AAPL")

    assert response.status_code == 200
    assert response.json() == [{"symbol": "AAPL", "name": "Apple Inc."}]
    mock_ticker_cls.assert_called_once_with("AAPL")


@pytest.mark.anyio
@patch("app.routers.search.yf.Ticker")
@patch("app.routers.search.yf.search")
async def test_search_does_not_force_symbol_lookup_for_company_name_queries(
    mock_search: MagicMock,
    mock_ticker_cls: MagicMock,
    client: AsyncClient,
) -> None:
    mock_search.return_value = {"quotes": []}

    response = await client.get("/api/search?q=apple")

    assert response.status_code == 200
    assert response.json() == []
    mock_ticker_cls.assert_not_called()
