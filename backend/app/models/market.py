from datetime import date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

PeriodType = Literal["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"]


class PricePoint(BaseModel):
    date: date | datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class TickerOverview(BaseModel):
    symbol: str
    name: str
    currency: str = "USD"
    exchange: str = ""
    current_price: float
    previous_close: float
    change: float
    change_percent: float
    volume: int
    market_cap: int | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None


class Fundamentals(BaseModel):
    pe_ratio: float | None = None
    forward_pe: float | None = None
    eps: float | None = None
    revenue: int | None = None
    ebitda: int | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    profit_margin: float | None = None
    debt_to_equity: float | None = None
    return_on_equity: float | None = None
    dividend_yield: float | None = None


class MarketResponse(BaseModel):
    overview: TickerOverview
    fundamentals: Fundamentals
    price_history: list[PricePoint]
