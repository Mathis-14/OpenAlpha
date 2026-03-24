import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp
from starlette.types import Receive
from starlette.types import Scope
from starlette.types import Send

from app.config import settings
from app.exceptions import InvalidTickerError
from app.exceptions import ProviderTimeoutError
from app.exceptions import UpstreamDataError
from app.routers import agent
from app.routers import filings
from app.routers import macro
from app.routers import market
from app.routers import news

logger = logging.getLogger(__name__)


class CatchAllErrorMiddleware:
    """ASGI middleware that catches unhandled exceptions and returns 500 JSON."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        except (UpstreamDataError, InvalidTickerError, ProviderTimeoutError):
            raise
        except Exception:
            logger.exception("Unhandled error")
            response = JSONResponse(
                status_code=500, content={"error": "internal_error"}
            )
            await response(scope, receive, send)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    yield


app = FastAPI(
    title="OpenAlpha",
    description="Open source financial data aggregator with AI agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(CatchAllErrorMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router)
app.include_router(macro.router)
app.include_router(filings.router)
app.include_router(news.router)
app.include_router(agent.router)


@app.exception_handler(UpstreamDataError)
async def _upstream_error_handler(
    _request: Request, exc: UpstreamDataError
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": "upstream_unavailable", "provider": exc.provider},
    )


@app.exception_handler(InvalidTickerError)
async def _invalid_ticker_handler(
    _request: Request, exc: InvalidTickerError
) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"error": "invalid_ticker", "ticker": exc.ticker},
    )


@app.exception_handler(ProviderTimeoutError)
async def _timeout_handler(
    _request: Request, exc: ProviderTimeoutError
) -> JSONResponse:
    return JSONResponse(
        status_code=504,
        content={"error": "provider_timeout", "provider": exc.provider},
    )


@app.get("/health")
async def health_check() -> dict[str, Any]:
    return {"status": "ok"}
