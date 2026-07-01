from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import ActiveUser, DBSession
from app.services.metrics_service import get_history

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/history")
async def get_metrics_history(
    _: ActiveUser,
    db: DBSession,
    hours: Annotated[int, Query(ge=1, le=168)] = 1,
) -> list[dict]:
    """Return historical metrics snapshots for the last N hours (max 168 = 7 days)."""
    return await get_history(db, hours=hours)
