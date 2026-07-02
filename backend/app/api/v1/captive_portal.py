from __future__ import annotations

from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, Request, status

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import captive_portal_service

router = APIRouter(prefix="/captive-portal", tags=["CaptivePortal"])


class EnableRequest(BaseModel):
    title: str = "Welcome to SUDO-Pi"
    message: str = "Please accept the terms to connect to the internet."


class AcceptRequest(BaseModel):
    mac: str


@router.get("/status")
async def get_status(_: ActiveUser) -> dict:
    """Return captive portal status."""
    return await captive_portal_service.get_status()


@router.post("/enable", dependencies=[CsrfVerified])
async def enable_portal(body: EnableRequest, _: AdminUser) -> dict:
    """Enable the captive portal with a custom title and message."""
    try:
        await captive_portal_service.enable(body.title, body.message)
        return {"detail": "Captive portal enabled"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enable captive portal: {exc}",
        ) from exc


@router.post("/disable", dependencies=[CsrfVerified])
async def disable_portal(_: AdminUser) -> dict:
    """Disable the captive portal and remove redirect rules."""
    try:
        await captive_portal_service.disable()
        return {"detail": "Captive portal disabled"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disable captive portal: {exc}",
        ) from exc


@router.post("/accept")
async def accept_device(body: AcceptRequest) -> dict:
    """Allow a device past the captive portal. Public endpoint — no auth required."""
    try:
        await captive_portal_service.accept_device(body.mac)
        return {"detail": "Device accepted", "mac": body.mac}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept device: {exc}",
        ) from exc


@router.get("/client-mac")
async def get_client_mac(request: Request) -> dict:
    """Return the MAC address of the requesting client from the ARP table.
    Public endpoint so the captive portal page can resolve its own MAC."""
    client_ip = request.client.host if request.client else None
    mac: str | None = None
    if client_ip:
        from app.services.network_traffic_service import _parse_arp
        arp = _parse_arp()
        mac = arp.get(client_ip)
    return {"mac": mac, "ip": client_ip}


@router.get("/allowed")
async def get_allowed_devices(_: ActiveUser) -> list[str]:
    """Return the list of allowed (already-accepted) MAC addresses."""
    return await captive_portal_service.get_allowed_devices()


@router.post("/clear-allowed", dependencies=[CsrfVerified])
async def clear_allowed_devices(_: AdminUser) -> dict:
    """Remove all allowed MAC entries and reset their iptables rules."""
    try:
        await captive_portal_service.clear_allowed_devices()
        return {"detail": "All allowed devices cleared"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear allowed devices: {exc}",
        ) from exc
