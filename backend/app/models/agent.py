from typing import Literal

from pydantic import BaseModel
from pydantic import Field

from app.models.macro import MacroCountry


class AgentRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    ticker: str | None = None
    dashboard_context: Literal["macro"] | None = None
    country: MacroCountry | None = None
