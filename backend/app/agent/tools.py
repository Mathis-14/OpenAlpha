import json
import logging
from typing import Any

from app.services import edgar_service
from app.services import fred_service
from app.services import news_service
from app.services import yfinance_service

logger = logging.getLogger(__name__)

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_stock_overview",
            "description": (
                "Get current stock data: price, change, volume, market cap, "
                "52-week range. Use for a quick snapshot of any publicly traded stock."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Ticker symbol (e.g. AAPL, MSFT, TSLA)",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_fundamentals",
            "description": (
                "Get financial ratios and metrics: P/E, EPS, revenue, EBITDA, "
                "margins, debt-to-equity, ROE, dividend yield."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Ticker symbol (e.g. AAPL, MSFT, TSLA)",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_price_history",
            "description": (
                "Get OHLCV price history for a stock over a specified period. "
                "Useful for trend analysis and price movements."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Ticker symbol",
                    },
                    "period": {
                        "type": "string",
                        "enum": [
                            "1d",
                            "5d",
                            "1mo",
                            "3mo",
                            "6mo",
                            "1y",
                            "2y",
                            "5y",
                            "max",
                        ],
                        "description": "Time period for history (default: 1mo)",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_macro_snapshot",
            "description": (
                "Get key macroeconomic indicators: Fed Funds rate, CPI, "
                "real GDP growth, 10-year Treasury yield, unemployment rate. "
                "No parameters needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sec_filings",
            "description": (
                "Get recent SEC filings (10-K annual or 10-Q quarterly reports) "
                "for a company. Returns key sections like Risk Factors and MD&A."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {
                        "type": "string",
                        "description": "Ticker symbol",
                    },
                    "form_type": {
                        "type": "string",
                        "enum": ["10-K", "10-Q"],
                        "description": "Filing type (default: 10-K)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of filings to return (default: 1)",
                    },
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_news",
            "description": (
                "Get latest news articles for a stock from Yahoo Finance. "
                "Returns headlines, sources, and summaries."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {
                        "type": "string",
                        "description": "Ticker symbol",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max articles to return (default: 5)",
                    },
                },
                "required": ["ticker"],
            },
        },
    },
]

_MAX_HISTORY_POINTS = 30
_MAX_FILING_SECTION_CHARS = 2000


def _truncate_history(data: dict[str, Any]) -> dict[str, Any]:
    """Keep only the most recent data points to fit in LLM context."""
    history = data.get("price_history", [])
    if len(history) > _MAX_HISTORY_POINTS:
        data["price_history"] = history[-_MAX_HISTORY_POINTS:]
        data["_note"] = f"Showing last {_MAX_HISTORY_POINTS} of {len(history)} points"
    return data


def _truncate_filings(data: dict[str, Any]) -> dict[str, Any]:
    """Truncate filing sections to keep context manageable."""
    for filing in data.get("filings", []):
        for section in filing.get("sections", []):
            content = section.get("content", "")
            if len(content) > _MAX_FILING_SECTION_CHARS:
                section["content"] = (
                    content[:_MAX_FILING_SECTION_CHARS]
                    + "\n\n[...truncated for brevity]"
                )
    return data


async def dispatch_tool(name: str, arguments: dict[str, Any]) -> str:
    """Execute a tool by name and return the result as a JSON string."""
    result: dict[str, Any]

    if name == "get_stock_overview":
        overview = await yfinance_service.get_ticker_overview(arguments["symbol"])
        result = overview.model_dump()

    elif name == "get_stock_fundamentals":
        fundamentals = await yfinance_service.get_fundamentals(arguments["symbol"])
        result = fundamentals.model_dump()

    elif name == "get_price_history":
        period = arguments.get("period", "1mo")
        history = await yfinance_service.get_price_history(arguments["symbol"], period)
        result = _truncate_history({"price_history": [p.model_dump() for p in history]})

    elif name == "get_macro_snapshot":
        snapshot = await fred_service.get_macro_snapshot()
        result = snapshot.model_dump()

    elif name == "get_sec_filings":
        filings = await edgar_service.get_filings(
            ticker=arguments["ticker"],
            form_type=arguments.get("form_type", "10-K"),
            limit=arguments.get("limit", 1),
        )
        result = _truncate_filings(filings.model_dump())

    elif name == "get_news":
        news = await news_service.get_news(
            ticker=arguments["ticker"],
            limit=arguments.get("limit", 5),
        )
        result = news.model_dump()

    else:
        result = {"error": f"Unknown tool: {name}"}

    return json.dumps(result, default=str)
