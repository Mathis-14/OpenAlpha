from datetime import datetime

from pydantic import BaseModel


class NewsArticle(BaseModel):
    title: str
    source: str
    published: datetime | None = None
    summary: str
    url: str


class NewsResponse(BaseModel):
    ticker: str
    articles: list[NewsArticle]
