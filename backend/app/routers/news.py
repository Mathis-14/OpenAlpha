from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Query

from app.models.news import NewsResponse
from app.services import news_service

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("/{ticker}", response_model=NewsResponse)
async def get_news(
    ticker: str,
    limit: int = Query(default=10, ge=1, le=50),
) -> NewsResponse:
    """Latest news articles from Yahoo Finance RSS."""
    try:
        return await news_service.get_news(ticker, limit)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch news for '{ticker}': {exc}",
        ) from exc
