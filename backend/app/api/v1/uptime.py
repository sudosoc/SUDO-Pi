from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.services import uptime_service

router = APIRouter(prefix="/uptime", tags=["Uptime"])


@router.get("/summary")
async def get_uptime_summary(_: ActiveUser, db: DBSession) -> list[dict]:
    """Return all monitored services with current status and uptime percentages."""
    return await uptime_service.get_uptime_summary(db)


@router.get("/services/{service_name}/history")
async def get_service_history(
    service_name: str,
    _: ActiveUser,
    db: DBSession,
    hours: Annotated[int, Query(ge=1, le=720)] = 24,
) -> list[dict]:
    """Return uptime check history for a specific service (default last 24h)."""
    if service_name not in uptime_service.MONITORED_SERVICES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service '{service_name}' is not monitored",
        )
    return await uptime_service.get_service_history(db, service_name, hours=hours)


@router.post("/check-now", dependencies=[CsrfVerified])
async def trigger_uptime_check(_: AdminUser, db: DBSession) -> dict:
    """Trigger an immediate uptime check for all monitored services."""
    results = await uptime_service.run_uptime_check(db)
    up_count = sum(1 for r in results if r["status"] == "up")
    return {
        "checked": len(results),
        "up": up_count,
        "down": len(results) - up_count,
        "services": results,
    }
