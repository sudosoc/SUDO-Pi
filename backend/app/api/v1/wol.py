from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import wol_service

router = APIRouter(prefix="/wol", tags=["WakeOnLAN"])


class DeviceBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    mac: str = Field(..., min_length=14, max_length=17)
    ip: str = Field(default="")
    broadcast: str = Field(default="255.255.255.255")


@router.get("/devices")
async def list_devices(_: ActiveUser) -> list[dict]:
    return await wol_service.list_devices()


@router.post("/devices", dependencies=[CsrfVerified])
async def add_device(body: DeviceBody, _: AdminUser) -> dict:
    try:
        return await wol_service.add_device(body.name, body.mac, body.ip, body.broadcast)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.put("/devices/{device_id}", dependencies=[CsrfVerified])
async def update_device(device_id: int, body: DeviceBody, _: AdminUser) -> dict:
    try:
        return await wol_service.update_device(device_id, body.name, body.mac, body.ip, body.broadcast)
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(code, str(exc)) from exc


@router.delete("/devices/{device_id}", dependencies=[CsrfVerified])
async def delete_device(device_id: int, _: AdminUser) -> dict:
    await wol_service.delete_device(device_id)
    return {"detail": f"Device {device_id} deleted"}


@router.post("/devices/{device_id}/wake", dependencies=[CsrfVerified])
async def wake_device(device_id: int, _: AdminUser) -> dict:
    try:
        return await wol_service.wake_device(device_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
