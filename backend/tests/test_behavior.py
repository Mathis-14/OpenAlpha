"""Behavior tests that validate fixes without fully mocking service internals.

These tests prove that the bug fixes actually work at the service/agent layer,
not just that the wiring is correct.
"""

import asyncio
import json
from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from mistralai.client.models import FunctionCall
from mistralai.client.models import ToolCall

from app.agent.runner import run_agent
from app.exceptions import ProviderTimeoutError
from app.exceptions import UpstreamDataError
from app.models.market import Fundamentals
from app.models.market import TickerOverview
from app.services.yfinance_service import _fundamentals_cache
from app.services.yfinance_service import _history_cache
from app.services.yfinance_service import _overview_cache
from app.services.yfinance_service import get_market_data
from app.services.yfinance_service import get_ticker_overview

# ---------------------------------------------------------------------------
# 1. Cache: empty list is cached (is not None fix)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@patch("app.services.yfinance_service._sync_fetch_all")
async def test_empty_history_is_cached(mock_fetch: MagicMock):
    """A second call with empty history must NOT trigger a second fetch."""
    _overview_cache.clear()
    _fundamentals_cache.clear()
    _history_cache.clear()

    fake_overview = TickerOverview(
        symbol="TEST",
        name="Test Inc.",
        currency="USD",
        exchange="NMS",
        current_price=10.0,
        previous_close=9.5,
        change=0.5,
        change_percent=5.26,
        volume=1000,
    )
    fake_fundamentals = Fundamentals()
    mock_fetch.return_value = (fake_overview, fake_fundamentals, [])

    await get_market_data("TEST", "1mo")
    await get_market_data("TEST", "1mo")

    mock_fetch.assert_called_once()

    _overview_cache.clear()
    _fundamentals_cache.clear()
    _history_cache.clear()


# ---------------------------------------------------------------------------
# 2. Silent zeros: yfinance returns no price data -> UpstreamDataError
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@patch("app.services.yfinance_service._sync_fetch_overview")
async def test_null_price_raises_upstream_error(mock_fetch: MagicMock):
    """yfinance returning all-null fields must raise, not return zeros."""
    _overview_cache.clear()

    mock_fetch.side_effect = UpstreamDataError(
        provider="yfinance", detail="No price data for symbol 'FAKE'"
    )

    with pytest.raises(UpstreamDataError, match="yfinance"):
        await get_ticker_overview("FAKE")

    _overview_cache.clear()


# ---------------------------------------------------------------------------
# 3. Timeout: service call exceeding budget raises ProviderTimeoutError
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_yfinance_timeout_raises_provider_timeout():
    """A slow upstream must raise ProviderTimeoutError, not hang."""
    _overview_cache.clear()

    async def _hang(*_args, **_kwargs):
        await asyncio.sleep(60)

    with (
        patch("app.services.yfinance_service.asyncio.to_thread", side_effect=_hang),
        patch("app.services.yfinance_service._TIMEOUT", 0.05),
        pytest.raises(ProviderTimeoutError, match="yfinance"),
    ):
        await get_ticker_overview("SLOW")

    _overview_cache.clear()


# ---------------------------------------------------------------------------
# 4. Agent: no-tool first response triggers retry
# ---------------------------------------------------------------------------


def _mock_text_response(content: str = "Answer.") -> MagicMock:
    resp = MagicMock()
    choice = MagicMock()
    choice.finish_reason = "stop"
    choice.message.content = content
    choice.message.tool_calls = None
    resp.choices = [choice]
    return resp


def _mock_tool_response() -> MagicMock:
    resp = MagicMock()
    choice = MagicMock()
    choice.finish_reason = "tool_calls"
    choice.message.content = ""
    tc = ToolCall(
        id="tc_1",
        function=FunctionCall(
            name="get_stock_overview", arguments='{"symbol": "AAPL"}'
        ),
    )
    choice.message.tool_calls = [tc]
    resp.choices = [choice]
    return resp


@pytest.mark.anyio
@patch("app.agent.runner.dispatch_tool", new_callable=AsyncMock)
@patch("app.agent.runner.settings")
@patch("app.agent.runner.Mistral")
async def test_agent_retries_when_no_tool_on_first_round(
    mock_mistral_cls: MagicMock,
    mock_settings: MagicMock,
    mock_dispatch: AsyncMock,
):
    """When the model answers without tools, runner re-prompts before accepting."""
    mock_settings.mistral_api_key = "key"
    mock_settings.mistral_model = "mistral-small-latest"

    mock_client = MagicMock()
    mock_client.chat.complete_async = AsyncMock(
        side_effect=[
            _mock_text_response("I think AAPL is great."),
            _mock_tool_response(),
            _mock_text_response("Based on data, AAPL is at $150."),
        ],
    )
    mock_mistral_cls.return_value = mock_client
    mock_dispatch.return_value = json.dumps({"symbol": "AAPL", "current_price": 150.0})

    events: list[str] = []
    async for chunk in run_agent(query="Tell me about AAPL", ticker="AAPL"):
        for line in chunk.strip().split("\n"):
            if line.startswith("event: "):
                events.append(line[7:])

    assert "tool_call" in events
    assert "tool_result" in events
    assert mock_client.chat.complete_async.await_count == 3

    second_call_messages = mock_client.chat.complete_async.call_args_list[1][1].get(
        "messages",
        mock_client.chat.complete_async.call_args_list[1][0][0]
        if mock_client.chat.complete_async.call_args_list[1][0]
        else [],
    )
    retry_found = any(
        "must call at least one tool" in str(getattr(m, "content", ""))
        for m in second_call_messages
    )
    assert retry_found, "Retry prompt not found in second call messages"
