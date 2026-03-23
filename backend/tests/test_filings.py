from datetime import date
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.models.filings import Filing
from app.models.filings import FilingSection
from app.models.filings import FilingsResponse


def _fake_filings_response() -> FilingsResponse:
    return FilingsResponse(
        ticker="AAPL",
        filings=[
            Filing(
                form_type="10-K",
                filing_date=date(2024, 11, 1),
                accession_number="0000320193-24-000123",
                sec_url="https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/0000320193-24-000123-index.htm",
                sections=[
                    FilingSection(
                        title="Risk Factors",
                        content="The Company is subject to various risks...",
                    ),
                    FilingSection(
                        title="Management's Discussion and Analysis",
                        content="Revenue increased 5% year over year...",
                    ),
                ],
            ),
        ],
    )


@pytest.mark.anyio
@patch(
    "app.routers.filings.edgar_service.get_filings",
    new_callable=AsyncMock,
)
async def test_get_filings(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_filings_response()

    response = await client.get("/api/filings/AAPL?form_type=10-K&limit=1")

    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert len(data["filings"]) == 1
    assert data["filings"][0]["form_type"] == "10-K"
    assert len(data["filings"][0]["sections"]) == 2
    assert data["filings"][0]["sections"][0]["title"] == "Risk Factors"
    mock_get.assert_awaited_once_with("AAPL", "10-K", 1)


@pytest.mark.anyio
@patch(
    "app.routers.filings.edgar_service.get_filings",
    new_callable=AsyncMock,
)
async def test_filings_default_params(mock_get: AsyncMock, client: AsyncClient):
    mock_get.return_value = _fake_filings_response()

    response = await client.get("/api/filings/AAPL")

    assert response.status_code == 200
    mock_get.assert_awaited_once_with("AAPL", "10-K", 3)


@pytest.mark.anyio
@patch(
    "app.routers.filings.edgar_service.get_filings",
    new_callable=AsyncMock,
)
async def test_filings_error_returns_404(mock_get: AsyncMock, client: AsyncClient):
    mock_get.side_effect = Exception("Company not found")

    response = await client.get("/api/filings/ZZZZZ")

    assert response.status_code == 404
    assert "ZZZZZ" in response.json()["detail"]
