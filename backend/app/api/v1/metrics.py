from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import ActiveUser, DBSession
from app.services.metrics_service import get_history, detect_anomalies, get_anomaly_history

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/history")
async def get_metrics_history(
    _: ActiveUser,
    db: DBSession,
    hours: Annotated[int, Query(ge=1, le=168)] = 1,
) -> list[dict]:
    """Return historical metrics snapshots for the last N hours (max 168 = 7 days)."""
    return await get_history(db, hours=hours)


@router.get("/anomalies")
async def get_current_anomalies(_: ActiveUser, db: DBSession) -> list[dict]:
    """
    Return current anomaly status using Z-score detection over the last 60 minutes.
    Each entry describes a metric that is statistically unusual.
    """
    return await detect_anomalies(db)


@router.get("/anomalies/history")
async def get_anomalies_history(
    _: ActiveUser,
    db: DBSession,
    hours: Annotated[int, Query(ge=1, le=168)] = 24,
) -> list[dict]:
    """Return historical anomaly events detected over the last N hours."""
    return await get_anomaly_history(db, hours=hours)
