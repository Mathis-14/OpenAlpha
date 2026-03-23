from datetime import date

from pydantic import BaseModel


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
