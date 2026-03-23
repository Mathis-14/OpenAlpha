from fastapi import APIRouter
from fastapi import HTTPException

from app.models.macro import MacroSnapshot
from app.services import fred_service

router = APIRouter(prefix="/api/macro", tags=["macro"])


@router.get("", response_model=MacroSnapshot)
async def get_macro_data() -> MacroSnapshot:
    """Current macroeconomic indicators with short history."""
    try:
        return await fred_service.get_macro_snapshot()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch macro data from FRED: {exc}",
        ) from exc
