import json
from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from mistralai.client.models import FunctionCall
from mistralai.client.models import ToolCall


def _parse_sse(body: str) -> list[dict[str, object]]:
    """Parse raw SSE text into a list of {event, data} dicts."""
    events: list[dict[str, object]] = []
    for block in body.strip().split("\n\n"):
        event_type = ""
        data: object = None
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if event_type:
            events.append({"event": event_type, "data": data})
    return events


def _mock_text_response(content: str = "AAPL looks strong.") -> MagicMock:
    resp = MagicMock()
    choice = MagicMock()
    choice.finish_reason = "stop"
    choice.message.content = content
    choice.message.tool_calls = None
    resp.choices = [choice]
    return resp


def _mock_tool_response(
    tool_name: str = "get_stock_overview",
    tool_args: str = '{"symbol": "AAPL"}',
    tool_id: str = "tc_001",
) -> MagicMock:
    resp = MagicMock()
    choice = MagicMock()
    choice.finish_reason = "tool_calls"
    choice.message.content = ""

    tc = ToolCall(
        id=tool_id,
        function=FunctionCall(name=tool_name, arguments=tool_args),
    )
    choice.message.tool_calls = [tc]

    resp.choices = [choice]
    return resp


@pytest.mark.anyio
@patch("app.agent.runner.dispatch_tool", new_callable=AsyncMock)
@patch("app.agent.runner.settings")
@patch("app.agent.runner.Mistral")
async def test_agent_no_tool_triggers_retry(
    mock_mistral_cls: MagicMock,
    mock_settings: MagicMock,
    mock_dispatch: AsyncMock,
    client: AsyncClient,
):
    """First response has no tool calls -> runner re-prompts, second uses tool."""
    mock_settings.mistral_api_key = "test-key"
    mock_settings.mistral_model = "mistral-small-latest"

    mock_client = MagicMock()
    mock_client.chat.complete_async = AsyncMock(
        side_effect=[
            _mock_text_response("AAPL is trading at $150."),
            _mock_tool_response(),
            _mock_text_response("Based on the data, AAPL is at $150."),
        ],
    )
    mock_mistral_cls.return_value = mock_client

    mock_dispatch.return_value = json.dumps(
        {"symbol": "AAPL", "current_price": 150.0},
    )

    response = await client.post(
        "/api/agent",
        json={"query": "Tell me about AAPL", "ticker": "AAPL"},
    )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" in event_types
    assert "tool_result" in event_types
    assert "text" in event_types
    assert "done" in event_types
    assert mock_client.chat.complete_async.await_count == 3


@pytest.mark.anyio
@patch("app.agent.runner.settings")
@patch("app.agent.runner.Mistral")
async def test_agent_no_tool_after_retry_yields_text(
    mock_mistral_cls: MagicMock,
    mock_settings: MagicMock,
    client: AsyncClient,
):
    """Both responses have no tool calls -> yield text after retry exhausted."""
    mock_settings.mistral_api_key = "test-key"
    mock_settings.mistral_model = "mistral-small-latest"

    mock_client = MagicMock()
    mock_client.chat.complete_async = AsyncMock(
        side_effect=[
            _mock_text_response("I think AAPL is good."),
            _mock_text_response("AAPL is trading at $150."),
        ],
    )
    mock_mistral_cls.return_value = mock_client

    response = await client.post(
        "/api/agent",
        json={"query": "Tell me about AAPL", "ticker": "AAPL"},
    )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" not in event_types
    assert "text" in event_types
    assert "done" in event_types
    assert mock_client.chat.complete_async.await_count == 2


@pytest.mark.anyio
@patch("app.agent.runner.dispatch_tool", new_callable=AsyncMock)
@patch("app.agent.runner.settings")
@patch("app.agent.runner.Mistral")
async def test_agent_with_tool_call(
    mock_mistral_cls: MagicMock,
    mock_settings: MagicMock,
    mock_dispatch: AsyncMock,
    client: AsyncClient,
):
    mock_settings.mistral_api_key = "test-key"
    mock_settings.mistral_model = "mistral-small-latest"

    mock_client = MagicMock()
    mock_client.chat.complete_async = AsyncMock(
        side_effect=[
            _mock_tool_response(),
            _mock_text_response("AAPL is at $150 with a P/E of 25."),
        ],
    )
    mock_mistral_cls.return_value = mock_client

    mock_dispatch.return_value = json.dumps(
        {"symbol": "AAPL", "current_price": 150.0, "change_percent": 1.2},
    )

    response = await client.post(
        "/api/agent",
        json={"query": "Analyze AAPL", "ticker": "AAPL"},
    )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" in event_types
    assert "tool_result" in event_types
    assert "text" in event_types
    assert "done" in event_types

    tool_call_event = next(e for e in events if e["event"] == "tool_call")
    assert isinstance(tool_call_event["data"], dict)
    assert tool_call_event["data"]["name"] == "get_stock_overview"

    mock_dispatch.assert_awaited_once()


@pytest.mark.anyio
@patch("app.agent.runner.settings")
async def test_agent_missing_api_key(
    mock_settings: MagicMock,
    client: AsyncClient,
):
    mock_settings.mistral_api_key = ""

    response = await client.post(
        "/api/agent",
        json={"query": "Analyze AAPL"},
    )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events[0]["event"] == "error"
    assert "MISTRAL_API_KEY" in str(events[0]["data"])


@pytest.mark.anyio
async def test_agent_empty_query_returns_422(client: AsyncClient):
    response = await client.post(
        "/api/agent",
        json={"query": ""},
    )
    assert response.status_code == 422


@pytest.mark.anyio
@patch("app.agent.runner.dispatch_tool", new_callable=AsyncMock)
@patch("app.agent.runner.settings")
@patch("app.agent.runner.Mistral")
async def test_agent_tool_failure_continues(
    mock_mistral_cls: MagicMock,
    mock_settings: MagicMock,
    mock_dispatch: AsyncMock,
    client: AsyncClient,
):
    """When a tool raises an exception, the agent should report the error and continue."""
    mock_settings.mistral_api_key = "test-key"
    mock_settings.mistral_model = "mistral-small-latest"

    mock_client = MagicMock()
    mock_client.chat.complete_async = AsyncMock(
        side_effect=[
            _mock_tool_response(),
            _mock_text_response("I could not retrieve the data."),
        ],
    )
    mock_mistral_cls.return_value = mock_client

    mock_dispatch.side_effect = Exception("Yahoo Finance timeout")

    response = await client.post(
        "/api/agent",
        json={"query": "Price of AAPL?", "ticker": "AAPL"},
    )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    event_types = [e["event"] for e in events]

    assert "tool_call" in event_types
    assert "tool_result" in event_types

    result_event = next(e for e in events if e["event"] == "tool_result")
    assert isinstance(result_event["data"], dict)
    assert result_event["data"]["success"] is False

    assert "text" in event_types
    assert "done" in event_types
