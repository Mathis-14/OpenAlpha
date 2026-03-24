"""Shared Mistral client mocks for agent tests."""

import asyncio
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock
from unittest.mock import MagicMock


def mock_stream_async(content: str = "Final answer.") -> AsyncMock:
    """AsyncMock for ``client.chat.stream_async`` yielding one text_delta chunk."""

    async def stream() -> AsyncGenerator[MagicMock, None]:
        chunk = MagicMock()
        chunk.data = MagicMock()
        chunk.data.choices = [MagicMock()]
        chunk.data.choices[0].delta = MagicMock()
        chunk.data.choices[0].delta.content = content
        yield chunk

    return AsyncMock(return_value=stream())


def mock_stream_async_with_pause(
    first_content: str = "Partial answer.",
    second_content: str = "Final answer.",
    pause_seconds: float = 1.0,
) -> AsyncMock:
    """AsyncMock yielding one chunk, then pausing before the next."""

    async def stream() -> AsyncGenerator[MagicMock, None]:
        first_chunk = MagicMock()
        first_chunk.data = MagicMock()
        first_chunk.data.choices = [MagicMock()]
        first_chunk.data.choices[0].delta = MagicMock()
        first_chunk.data.choices[0].delta.content = first_content
        yield first_chunk

        await asyncio.sleep(pause_seconds)

        second_chunk = MagicMock()
        second_chunk.data = MagicMock()
        second_chunk.data.choices = [MagicMock()]
        second_chunk.data.choices[0].delta = MagicMock()
        second_chunk.data.choices[0].delta.content = second_content
        yield second_chunk

    return AsyncMock(return_value=stream())
