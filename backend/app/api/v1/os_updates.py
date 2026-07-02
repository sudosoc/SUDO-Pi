from __future__ import annotations

import asyncio
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.services import os_update_service

router = APIRouter(prefix="/os-updates", tags=["OS Updates"])


class UpgradeBody(BaseModel):
    # None/empty → upgrade everything upgradable
    packages: Optional[list[str]] = None

    @field_validator("packages")
    @classmethod
    def validate_names(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        cleaned = [p.strip() for p in v if p.strip()]
        for name in cleaned:
            if not re.match(r"^[A-Za-z0-9.+:~_-]+$", name):
                raise ValueError(f"Invalid package name: {name!r}")
        return cleaned or None


class RollbackBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    version: str = Field(..., min_length=1, max_length=64)


class ScheduleBody(BaseModel):
    enabled: Optional[bool] = None
    run_time: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    days: Optional[str] = Field(None, max_length=64)
    security_only: Optional[bool] = None
    auto_reboot_if_required: Optional[bool] = None


@router.get("/status")
async def get_status(_: ActiveUser, db: DBSession) -> dict:
    return await os_update_service.get_status(db)


@router.post("/check", dependencies=[CsrfVerified])
async def check_updates(_: AdminUser) -> dict:
    try:
        packages = await os_update_service.check_updates()
        return {"detail": f"Found {len(packages)} upgradable packages", "packages": packages}
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/packages")
async def get_packages(_: ActiveUser) -> dict:
    packages, checked_at = os_update_service.get_cached_packages()
    return {
        "packages": packages,
        "checked_at": checked_at.isoformat() if checked_at else None,
    }


@router.post("/upgrade", dependencies=[CsrfVerified])
async def start_upgrade(body: UpgradeBody, _: AdminUser, db: DBSession) -> dict:
    """Kick off an upgrade in the background and return the run id for polling."""
    packages, _checked = os_update_service.get_cached_packages()
    if not packages:
        raise HTTPException(400, "No upgradable packages cached — run a check first")

    run = await os_update_service.create_run(db, "manual")
    asyncio.create_task(os_update_service.execute_run_background(run.id, body.packages))
    return {"detail": "Upgrade started", "run_id": run.id}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, _: ActiveUser, db: DBSession) -> dict:
    run = await os_update_service.get_run(db, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/history")
async def get_history(_: ActiveUser, db: DBSession) -> list[dict]:
    return await os_update_service.get_history(db)


@router.post("/rollback", dependencies=[CsrfVerified])
async def rollback(body: RollbackBody, _: AdminUser, db: DBSession) -> dict:
    try:
        return await os_update_service.rollback_package(db, body.name, body.version)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/schedule")
async def get_schedule(_: ActiveUser, db: DBSession) -> dict:
    return await os_update_service.get_schedule(db)


@router.put("/schedule", dependencies=[CsrfVerified])
async def update_schedule(body: ScheduleBody, _: AdminUser, db: DBSession) -> dict:
    try:
        schedule = await os_update_service.update_schedule(db, **body.model_dump())
        await db.commit()
        return schedule
    except ValueError as exc:
        raise HTTPException(400, str(exc))
