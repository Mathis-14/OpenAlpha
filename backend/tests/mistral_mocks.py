"""Shared Mistral client mocks for agent tests."""

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
