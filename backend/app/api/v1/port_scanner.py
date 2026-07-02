from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import ActiveUser
from app.services import port_scanner_service

router = APIRouter(prefix="/port-scanner", tags=["PortScanner"])


@router.get("/scan")
async def scan_network(_: ActiveUser) -> list[dict]:
    """Trigger a fresh port scan of all AP clients and the Pi itself."""
    try:
        return await port_scanner_service.scan_network()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Port scan failed: {exc}",
        ) from exc


@router.get("/cached")
async def get_cached_scan(_: ActiveUser) -> list[dict]:
    """Return the most recent cached scan results without triggering a new scan.
    Falls back to a live scan if no cache is available or cache is stale."""
    try:
        return await port_scanner_service.get_last_scan()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve scan results: {exc}",
        ) from exc
