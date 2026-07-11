from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from app.core.dependencies import ActiveUser
from app.services import ups_service

router = APIRouter(prefix="/ups", tags=["UPS"])


@router.get("/status")
async def get_status(ups_name: Optional[str] = None, _: ActiveUser = None) -> dict:
    return await ups_service.get_ups_status(ups_name)


@router.get("/devices")
async def list_devices(_: ActiveUser) -> list[str]:
    return await ups_service.list_ups_devices()
