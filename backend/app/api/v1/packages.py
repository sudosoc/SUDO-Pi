from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
import re

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import package_service

router = APIRouter(prefix="/packages", tags=["packages"])


class InstallRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9][a-z0-9+\-\.]{0,127}$", v):
            raise ValueError("Invalid package name")
        return v


@router.get("")
async def list_packages(skip: int = 0, limit: int = 200, _: ActiveUser = None):
    return await package_service.list_installed(skip=skip, limit=limit)


@router.get("/search")
async def search_packages(q: str, _: ActiveUser = None):
    if not q or len(q) > 100:
        raise HTTPException(400, "Query must be 1-100 characters")
    return await package_service.search_packages(q)


@router.post("/install", dependencies=[CsrfVerified])
async def install_package(body: InstallRequest, _: AdminUser = None):
    try:
        return await package_service.install_package(body.name)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))


@router.post("/upgrade", dependencies=[CsrfVerified])
async def upgrade_all(_: AdminUser = None):
    try:
        return await package_service.upgrade_all()
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/{name}", dependencies=[CsrfVerified])
async def remove_package(name: str, _: AdminUser = None):
    if not re.match(r"^[a-z0-9][a-z0-9+\-\.]{0,127}$", name):
        raise HTTPException(400, "Invalid package name")
    try:
        return await package_service.remove_package(name)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))
