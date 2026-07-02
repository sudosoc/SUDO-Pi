from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import app_store_service

router = APIRouter(prefix="/app-store", tags=["AppStore"])


class UninstallBody(BaseModel):
    remove_data: bool = False


@router.get("/apps")
async def list_apps(_: ActiveUser = None):
    try:
        return await app_store_service.list_apps()
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.get("/apps/{app_id}")
async def get_app(app_id: str, _: ActiveUser = None):
    try:
        return await app_store_service.get_app(app_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/apps/{app_id}/install", dependencies=[CsrfVerified])
async def install_app(app_id: str, _: AdminUser = None):
    try:
        return await app_store_service.install_app(app_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/apps/{app_id}/uninstall", dependencies=[CsrfVerified])
async def uninstall_app(app_id: str, body: UninstallBody, _: AdminUser = None):
    try:
        return await app_store_service.uninstall_app(app_id, remove_data=body.remove_data)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))
