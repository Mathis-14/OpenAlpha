from fastapi import APIRouter

from app.models.macro import MacroSnapshot
from app.services import fred_service

router = APIRouter(prefix="/api/macro", tags=["macro"])


@router.get("", response_model=MacroSnapshot)
async def get_macro_data() -> MacroSnapshot:
    """Current macroeconomic indicators with short history."""
    return await fred_service.get_macro_snapshot()
