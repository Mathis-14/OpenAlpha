from typing import Literal

from fastapi import APIRouter
from fastapi import Query

from app.models.filings import FilingsResponse
from app.services import edgar_service

router = APIRouter(prefix="/api/filings", tags=["filings"])


@router.get("/{ticker}", response_model=FilingsResponse)
async def get_filings(
    ticker: str,
    form_type: Literal["10-K", "10-Q"] = "10-K",
    limit: int = Query(default=3, ge=1, le=10),
) -> FilingsResponse:
    """Latest SEC filings with parsed sections (Risk Factors, MD&A, Business)."""
    return await edgar_service.get_filings(ticker, form_type, limit)
