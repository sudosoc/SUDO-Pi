from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import storage_service

router = APIRouter(prefix="/storage", tags=["Storage"])


class MountRequest(BaseModel):
    device: str
    mountpoint: str
    fstype: Optional[str] = None


class UnmountRequest(BaseModel):
    path: str


class FormatRequest(BaseModel):
    device: str
    fstype: str
    label: str = ""


class EjectRequest(BaseModel):
    device: str


@router.get("/devices")
async def get_block_devices(_: ActiveUser) -> list[dict]:
    return await storage_service.get_block_devices()


@router.get("/usb")
async def get_usb_devices(_: ActiveUser) -> list[dict]:
    return await storage_service.get_usb_devices()


@router.get("/usage")
async def get_disk_usage(_: ActiveUser) -> list[dict]:
    return await storage_service.get_disk_usage()


@router.get("/io-stats")
async def get_io_stats(_: ActiveUser) -> list[dict]:
    return await storage_service.get_io_stats()


@router.post("/mount", dependencies=[CsrfVerified])
async def mount_device(body: MountRequest, _: AdminUser) -> dict:
    success, error = await storage_service.mount_device(
        body.device, body.mountpoint, body.fstype
    )
    if not success:
        raise HTTPException(status_code=500, detail=error or "Mount failed")
    return {"detail": f"Mounted {body.device} at {body.mountpoint}"}


@router.post("/unmount", dependencies=[CsrfVerified])
async def unmount_device(body: UnmountRequest, _: AdminUser) -> dict:
    success, error = await storage_service.unmount_device(body.path)
    if not success:
        raise HTTPException(status_code=500, detail=error or "Unmount failed")
    return {"detail": f"Unmounted {body.path}"}


@router.post("/format", dependencies=[CsrfVerified])
async def format_device(body: FormatRequest, _: AdminUser) -> dict:
    success, output = await storage_service.format_device(
        body.device, body.fstype, body.label
    )
    if not success:
        raise HTTPException(status_code=500, detail=output or "Format failed")
    return {"detail": f"Formatted {body.device} as {body.fstype}", "output": output}


@router.post("/eject", dependencies=[CsrfVerified])
async def eject_device(body: EjectRequest, _: AdminUser) -> dict:
    success, error = await storage_service.eject_device(body.device)
    if not success:
        raise HTTPException(status_code=500, detail=error or "Eject failed")
    return {"detail": f"Ejected {body.device}"}
