from fastapi import APIRouter

from app.models.market import Fundamentals
from app.models.market import MarketResponse
from app.models.market import PeriodType
from app.models.market import PricePoint
from app.models.market import TickerOverview
from app.services import yfinance_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/{ticker}", response_model=MarketResponse)
async def get_market_data(
    ticker: str,
    period: PeriodType = "1mo",
) -> MarketResponse:
    """Full market data: overview + fundamentals + price history."""
    return await yfinance_service.get_market_data(ticker, period)


@router.get("/{ticker}/overview", response_model=TickerOverview)
async def get_ticker_overview(ticker: str) -> TickerOverview:
    """Current price, volume, market cap, 52-week range."""
    return await yfinance_service.get_ticker_overview(ticker)


@router.get("/{ticker}/fundamentals", response_model=Fundamentals)
async def get_fundamentals(ticker: str) -> Fundamentals:
    """Key financial fundamentals: P/E, EPS, revenue, margins."""
    return await yfinance_service.get_fundamentals(ticker)


@router.get("/{ticker}/history", response_model=list[PricePoint])
async def get_price_history(
    ticker: str,
    period: PeriodType = "1mo",
) -> list[PricePoint]:
    """OHLCV price history for a given period."""
    return await yfinance_service.get_price_history(ticker, period)
