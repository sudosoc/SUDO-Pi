from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import ActiveUser
from app.services import smart_service

router = APIRouter(prefix="/smart", tags=["SMART"])


@router.get("/disks")
async def list_disks(_: ActiveUser) -> list[dict]:
    return await smart_service.list_smart_disks()


@router.get("/disk/{device:path}")
async def get_disk(device: str, _: ActiveUser) -> dict:
    try:
        return await smart_service.get_disk_smart(f"/{device}")
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
