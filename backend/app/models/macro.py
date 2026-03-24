from datetime import date
from enum import StrEnum

from pydantic import BaseModel


class MacroIndicatorSlug(StrEnum):
    FED_FUNDS = "fed-funds"
    CPI = "cpi"
    GDP_GROWTH = "gdp-growth"
    TREASURY_10Y = "treasury-10y"
    UNEMPLOYMENT = "unemployment"


class MacroHistoryRange(StrEnum):
    ONE_YEAR = "1y"
    THREE_YEARS = "3y"
    FIVE_YEARS = "5y"
    TEN_YEARS = "10y"
    MAX = "max"


class MacroCountry(StrEnum):
    US = "us"
    FR = "fr"


class MacroDataPoint(BaseModel):
    date: date
    value: float


class MacroIndicator(BaseModel):
    series_id: str
    name: str
    latest_value: float
    latest_date: date
    unit: str
    history: list[MacroDataPoint]


class MacroSnapshot(BaseModel):
    fed_funds_rate: MacroIndicator
    cpi: MacroIndicator
    gdp_growth: MacroIndicator
    treasury_10y: MacroIndicator
    unemployment: MacroIndicator
