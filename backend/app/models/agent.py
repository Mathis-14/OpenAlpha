from pydantic import BaseModel
from pydantic import Field


class AgentRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    ticker: str | None = None
