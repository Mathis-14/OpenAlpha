from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agent.runner import run_agent
from app.models.agent import AgentRequest

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("")
async def agent_chat(request: AgentRequest) -> StreamingResponse:
    """Chat with the OpenAlpha AI agent. Returns Server-Sent Events."""
    return StreamingResponse(
        run_agent(
            query=request.query,
            ticker=request.ticker,
            dashboard_context=request.dashboard_context,
            country=request.country,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
