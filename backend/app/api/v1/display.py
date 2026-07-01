from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import display_service

router = APIRouter(prefix="/display", tags=["Display"])


class PowerRequest(BaseModel):
    on: bool


class ResolutionRequest(BaseModel):
    display: str
    resolution: str
    refresh_rate: str = ""


class RotateRequest(BaseModel):
    display: str
    rotation: str


class GpuMemoryRequest(BaseModel):
    mb: int


@router.get("/status")
async def get_display_status(_: ActiveUser) -> dict:
    return await display_service.get_display_status()


@router.get("/resolutions")
async def get_available_resolutions(_: ActiveUser) -> list[str]:
    return await display_service.get_available_resolutions()


@router.post("/power", dependencies=[CsrfVerified])
async def set_display_power(body: PowerRequest, _: AdminUser) -> dict:
    ok = await display_service.set_display_power(body.on)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to set display power")
    state = "on" if body.on else "off"
    return {"detail": f"Display turned {state}"}


@router.post("/resolution", dependencies=[CsrfVerified])
async def set_resolution(body: ResolutionRequest, _: AdminUser) -> dict:
    success, error = await display_service.set_resolution_xrandr(
        body.display, body.resolution, body.refresh_rate
    )
    if not success:
        raise HTTPException(status_code=500, detail=error or "Failed to set resolution")
    return {"detail": f"Resolution set to {body.resolution} on {body.display}"}


@router.post("/rotate", dependencies=[CsrfVerified])
async def rotate_display(body: RotateRequest, _: AdminUser) -> dict:
    success, error = await display_service.rotate_display(body.display, body.rotation)
    if not success:
        raise HTTPException(status_code=500, detail=error or "Failed to rotate display")
    return {"detail": f"Display {body.display} rotated to {body.rotation}"}


@router.get("/gpu-memory")
async def get_gpu_memory(_: ActiveUser) -> dict:
    mb = await display_service.get_gpu_memory()
    return {"gpu_memory_mb": mb}


@router.post("/gpu-memory", dependencies=[CsrfVerified])
async def set_gpu_memory(body: GpuMemoryRequest, _: AdminUser) -> dict:
    ok = await display_service.set_gpu_memory(body.mb)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GPU memory value. Allowed: 16, 32, 64, 128, 256, 512 MB",
        )
    return {"detail": f"GPU memory set to {body.mb}MB. Reboot required to take effect."}
