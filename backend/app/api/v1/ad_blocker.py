from __future__ import annotations

from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import ad_blocker_service

router = APIRouter(prefix="/ad-blocker", tags=["AdBlocker"])


class EnableRequest(BaseModel):
    lists: list[str]


@router.get("/status")
async def get_status(_: ActiveUser) -> dict:
    """Return current ad blocker status including domain count and active lists."""
    return await ad_blocker_service.get_status()


@router.get("/lists")
async def get_available_lists(_: ActiveUser) -> list[dict]:
    """Return available blocklist sources."""
    return await ad_blocker_service.get_available_lists()


@router.post("/enable", dependencies=[CsrfVerified])
async def enable_ad_blocker(body: EnableRequest, _: AdminUser) -> dict:
    """Download selected blocklists and enable DNS ad blocking."""
    try:
        result = await ad_blocker_service.enable(body.lists)
        return {"detail": f"Ad blocker enabled with {result['domain_count']} domains", **result}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enable ad blocker: {exc}",
        ) from exc


@router.post("/disable", dependencies=[CsrfVerified])
async def disable_ad_blocker(_: AdminUser) -> dict:
    """Disable DNS ad blocking and restart dnsmasq."""
    try:
        await ad_blocker_service.disable()
        return {"detail": "Ad blocker disabled"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disable ad blocker: {exc}",
        ) from exc


@router.post("/update", dependencies=[CsrfVerified])
async def update_blocklist(_: AdminUser) -> dict:
    """Re-download and rebuild the active blocklists."""
    try:
        result = await ad_blocker_service.update()
        return {"detail": f"Blocklist updated with {result['domain_count']} domains", **result}
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update blocklist: {exc}",
        ) from exc
