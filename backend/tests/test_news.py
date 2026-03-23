from datetime import UTC
from datetime import datetime
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.exceptions import UpstreamDataError
from app.models.news import NewsArticle
from app.models.news import NewsResponse


def _fake_news_response() -> NewsResponse:
    return NewsResponse(
        ticker="AAPL",
        articles=[
            NewsArticle(
                title="Apple reports record Q4 earnings",
                source="Reuters",
                published=datetime(2024, 10, 31, 14, 0, 0, tzinfo=UTC),
                summary="Apple Inc. reported quarterly earnings above expectations.",
                url="https://finance.yahoo.com/news/apple-q4-2024",
            ),
            NewsArticle(
                title="Apple unveils new MacBook Pro",
                source="Yahoo Finance",
                published=datetime(2024, 10, 30, 10, 0, 0, tzinfo=UTC),
                summary="Apple announced the latest MacBook Pro lineup.",
                url="https://finance.yahoo.com/news/apple-macbook-2024",
            ),
        ],
    )


@pytest.mark.anyio
@patch(
    "app.routers.news.news_service.get_news",
    new_callable=AsyncMock,
)
async def test_get_news(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_news_response()

    response = await client.get("/api/news/AAPL?limit=5")

    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert len(data["articles"]) == 2
    assert data["articles"][0]["title"] == "Apple reports record Q4 earnings"
    assert data["articles"][0]["source"] == "Reuters"
    mock_get.assert_awaited_once_with("AAPL", 5)


@pytest.mark.anyio
@patch(
    "app.routers.news.news_service.get_news",
    new_callable=AsyncMock,
)
async def test_news_default_limit(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_news_response()

    response = await client.get("/api/news/AAPL")

    assert response.status_code == 200
    mock_get.assert_awaited_once_with("AAPL", 10)


@pytest.mark.anyio
@patch(
    "app.routers.news.news_service.get_news",
    new_callable=AsyncMock,
)
async def test_news_error_returns_503(mock_get: AsyncMock, client: AsyncClient):
    mock_get.side_effect = UpstreamDataError(
        provider="yahoo_news", detail="RSS feed unreachable"
    )

    response = await client.get("/api/news/AAPL")

    assert response.status_code == 503
    assert response.json()["error"] == "upstream_unavailable"
    assert response.json()["provider"] == "yahoo_news"
