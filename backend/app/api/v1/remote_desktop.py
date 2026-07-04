from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import remote_desktop_service

router = APIRouter(prefix="/remote-desktop", tags=["Remote Desktop"])


@router.get("/status")
async def get_status(_: ActiveUser) -> dict:
    return await remote_desktop_service.get_status()


@router.post("/install", dependencies=[CsrfVerified])
async def install(_: AdminUser) -> dict:
    try:
        return await remote_desktop_service.install()
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/start", dependencies=[CsrfVerified])
async def start(_: AdminUser) -> dict:
    try:
        return await remote_desktop_service.start()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))


@router.post("/stop", dependencies=[CsrfVerified])
async def stop(_: AdminUser) -> dict:
    return await remote_desktop_service.stop()


@router.post("/restart", dependencies=[CsrfVerified])
async def restart(_: AdminUser) -> dict:
    try:
        return await remote_desktop_service.restart()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))


@router.post("/regenerate-password", dependencies=[CsrfVerified])
async def regenerate_password(_: AdminUser) -> dict:
    try:
        return await remote_desktop_service.regenerate_password()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
