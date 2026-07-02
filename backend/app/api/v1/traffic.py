from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import network_traffic_service

router = APIRouter(prefix="/traffic", tags=["Traffic"])


@router.get("/stats")
async def get_traffic_stats(_: ActiveUser) -> list[dict]:
    """Return per-device traffic statistics from iptables accounting chains."""
    try:
        return await network_traffic_service.get_traffic_stats()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve traffic stats: {exc}",
        ) from exc


@router.get("/aggregate")
async def get_aggregate_stats(_: ActiveUser) -> dict:
    """Return aggregate bandwidth stats across all AP clients."""
    try:
        return await network_traffic_service.get_aggregate_stats()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve aggregate stats: {exc}",
        ) from exc


@router.post("/reset", dependencies=[CsrfVerified])
async def reset_counters(_: AdminUser) -> dict:
    """Zero all iptables accounting counters (admin only)."""
    try:
        await network_traffic_service.reset_counters()
        return {"detail": "Traffic counters reset successfully"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset counters: {exc}",
        ) from exc
