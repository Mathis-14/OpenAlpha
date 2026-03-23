import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from mistralai.client import Mistral
from mistralai.client.models import AssistantMessage
from mistralai.client.models import Function
from mistralai.client.models import SystemMessage
from mistralai.client.models import Tool
from mistralai.client.models import ToolCall
from mistralai.client.models import ToolMessage
from mistralai.client.models import UserMessage

from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import TOOL_DEFINITIONS
from app.agent.tools import dispatch_tool
from app.config import settings

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 10

Messages = list[SystemMessage | UserMessage | AssistantMessage | ToolMessage]


def _sse(event: str, data: dict[str, Any]) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_user_content(query: str, ticker: str | None) -> str:
    if ticker:
        return f"{query}\n\n[Context: the user is asking about ticker {ticker.upper()}]"
    return query


def _build_tools() -> list[Tool]:
    """Convert raw tool dicts to SDK Tool objects."""
    tools: list[Tool] = []
    for defn in TOOL_DEFINITIONS:
        fn = defn["function"]
        tools.append(
            Tool(
                function=Function(
                    name=fn["name"],
                    description=fn.get("description", ""),
                    parameters=fn.get("parameters", {}),
                ),
            )
        )
    return tools


async def run_agent(
    query: str,
    ticker: str | None = None,
) -> AsyncGenerator[str, None]:
    """Execute the Mistral tool-use loop and yield SSE events.

    Event types:
        tool_call   - agent is invoking a tool  (name, arguments)
        tool_result - tool execution finished    (name, success)
        text        - final text from the model  (content)
        done        - stream complete            ({})
        error       - something went wrong       (message)
    """
    if not settings.mistral_api_key:
        yield _sse("error", {"message": "MISTRAL_API_KEY is not configured"})
        return

    client = Mistral(api_key=settings.mistral_api_key)
    sdk_tools = _build_tools()

    messages: Messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        UserMessage(content=_build_user_content(query, ticker)),
    ]

    for _round_idx in range(_MAX_TOOL_ROUNDS):
        try:
            response = await client.chat.complete_async(
                model=settings.mistral_model,
                messages=messages,
                tools=sdk_tools,
                tool_choice="auto",
            )
        except Exception as exc:
            logger.exception("Mistral API call failed")
            yield _sse("error", {"message": f"LLM request failed: {exc}"})
            return

        if response is None or not response.choices:
            yield _sse("error", {"message": "Empty response from LLM"})
            return

        choice = response.choices[0]
        msg = choice.message

        tool_calls: list[ToolCall] = list(msg.tool_calls) if msg.tool_calls else []
        has_tool_calls = choice.finish_reason == "tool_calls" and len(tool_calls) > 0

        if not has_tool_calls:
            content = str(msg.content) if msg.content else ""
            yield _sse("text", {"content": content})
            break

        messages.append(
            AssistantMessage(
                content=str(msg.content) if msg.content else "",
                tool_calls=tool_calls,
            )
        )

        for tc in tool_calls:
            fn_name = tc.function.name
            raw_args = tc.function.arguments
            try:
                fn_args: dict[str, Any] = json.loads(
                    raw_args if isinstance(raw_args, str) else json.dumps(raw_args)
                )
            except (json.JSONDecodeError, TypeError):
                fn_args = {}

            yield _sse("tool_call", {"name": fn_name, "arguments": fn_args})

            try:
                result_str = await dispatch_tool(fn_name, fn_args)
                yield _sse(
                    "tool_result",
                    {"name": fn_name, "success": True},
                )
            except Exception as exc:
                logger.exception("Tool %s failed", fn_name)
                result_str = json.dumps({"error": str(exc)})
                yield _sse(
                    "tool_result",
                    {"name": fn_name, "success": False, "error": str(exc)},
                )

            messages.append(
                ToolMessage(
                    name=fn_name,
                    content=result_str,
                    tool_call_id=tc.id,
                )
            )
    else:
        yield _sse(
            "error",
            {"message": f"Agent exceeded maximum tool rounds ({_MAX_TOOL_ROUNDS})"},
        )

    yield _sse("done", {})
