from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession, OperatorUser
from app.schemas.network import (
    ApConfigUpdate,
    ApStatusResponse,
    WifiConnectRequest,
    WifiProfileResponse,
    WifiScanResult,
    WifiStatusResponse,
    WifiPriorityUpdate,
)
from app.services import network_service
from app.services.audit_service import AuditService
from app.repositories.network_repository import WifiProfileRepository

router = APIRouter(prefix="/network", tags=["Network"])


@router.get("/ap", response_model=ApStatusResponse)
async def get_ap_status(db: DBSession, _: ActiveUser) -> ApStatusResponse:
    return await network_service.get_ap_status(db)


@router.put("/ap", dependencies=[CsrfVerified])
async def update_ap(
    body: ApConfigUpdate,
    db: DBSession,
    current_user: AdminUser,
) -> dict:
    audit = AuditService(db)
    success = await network_service.update_ap_config(
        body.ssid, body.password, body.channel, body.country_code, body.hide_ssid, db
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update AP configuration")
    await audit.log("network.ap.update", user=current_user, resource=f"ssid={body.ssid}", status_code=200)
    return {"detail": "AP configuration updated and restarted"}


@router.get("/ap/clients", response_model=list)
async def get_ap_clients(_: ActiveUser) -> list:
    return await network_service.get_ap_clients()


@router.get("/wifi/status", response_model=WifiStatusResponse)
async def get_wifi_status(_: ActiveUser) -> WifiStatusResponse:
    return await network_service.get_wifi_status()


@router.get("/wifi/scan", response_model=list[WifiScanResult])
async def scan_wifi(_: ActiveUser) -> list[WifiScanResult]:
    return await network_service.scan_wifi()


@router.get("/wifi/saved", response_model=list[WifiProfileResponse])
async def get_saved_networks(db: DBSession, _: ActiveUser) -> list[WifiProfileResponse]:
    repo = WifiProfileRepository(db)
    profiles = await repo.get_saved_profiles()
    return [WifiProfileResponse.model_validate(p) for p in profiles]


@router.post("/wifi/connect", dependencies=[CsrfVerified])
async def connect_wifi(
    body: WifiConnectRequest,
    db: DBSession,
    current_user: OperatorUser,
) -> dict:
    audit = AuditService(db)
    success = await network_service.connect_wifi(body, db)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to connect to Wi-Fi")
    await audit.log("network.wifi.connect", user=current_user, resource=body.ssid, status_code=200)
    return {"detail": f"Connected to {body.ssid}"}


@router.post("/wifi/disconnect", dependencies=[CsrfVerified])
async def disconnect_wifi(current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    success = await network_service.disconnect_wifi()
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to disconnect")
    await audit.log("network.wifi.disconnect", user=current_user, status_code=200)
    return {"detail": "Disconnected from Wi-Fi"}


@router.delete("/wifi/{profile_id}", dependencies=[CsrfVerified])
async def delete_wifi_profile(
    profile_id: int,
    db: DBSession,
    current_user: OperatorUser,
) -> dict:
    audit = AuditService(db)
    repo = WifiProfileRepository(db)
    profile = await repo.get_by_id(profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    ssid = profile.ssid
    await repo.delete(profile)
    await audit.log("network.wifi.profile.delete", user=current_user, resource=ssid, status_code=200)
    return {"detail": f"Profile {ssid} deleted"}


@router.get("/arp")
async def get_arp_table(_: ActiveUser) -> list[dict]:
    return await network_service.get_arp_table()


@router.put("/wifi/{profile_id}/priority", dependencies=[CsrfVerified])
async def update_wifi_priority(
    profile_id: int,
    body: WifiPriorityUpdate,
    db: DBSession,
    current_user: OperatorUser,
) -> dict:
    repo = WifiProfileRepository(db)
    profile = await repo.get_by_id(profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    await repo.update(profile, priority=body.priority)
    return {"detail": "Priority updated"}
