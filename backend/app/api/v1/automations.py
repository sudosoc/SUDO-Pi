from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.services import automation_service

router = APIRouter(prefix="/automations", tags=["Automations"])


class AutomationBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    enabled: bool = True
    trigger_type: str = Field("metric")
    metric: Optional[str] = None
    operator: str = Field(">", pattern=r"^[<>]$")
    threshold: float = 90.0
    duration_sec: int = Field(60, ge=0, le=86_400)
    service_name: Optional[str] = Field(None, max_length=120)
    action_type: str = Field("notify")
    action_target: Optional[str] = Field(None, max_length=255)
    cooldown_sec: int = Field(300, ge=30, le=86_400)


class AutomationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    enabled: Optional[bool] = None
    trigger_type: Optional[str] = None
    metric: Optional[str] = None
    operator: Optional[str] = Field(None, pattern=r"^[<>]$")
    threshold: Optional[float] = None
    duration_sec: Optional[int] = Field(None, ge=0, le=86_400)
    service_name: Optional[str] = None
    action_type: Optional[str] = None
    action_target: Optional[str] = None
    cooldown_sec: Optional[int] = Field(None, ge=30, le=86_400)


@router.get("")
async def list_automations(_: ActiveUser, db: DBSession) -> list[dict]:
    return await automation_service.list_automations(db)


@router.post("", dependencies=[CsrfVerified])
async def create(body: AutomationBody, _: AdminUser, db: DBSession) -> dict:
    try:
        return await automation_service.create(db, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.put("/{auto_id}", dependencies=[CsrfVerified])
async def update(auto_id: int, body: AutomationUpdate, _: AdminUser, db: DBSession) -> dict:
    try:
        updated = await automation_service.update(db, auto_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if updated is None:
        raise HTTPException(404, "Automation not found")
    return updated


@router.delete("/{auto_id}", dependencies=[CsrfVerified])
async def delete(auto_id: int, _: AdminUser, db: DBSession) -> dict:
    if not await automation_service.delete_automation(db, auto_id):
        raise HTTPException(404, "Automation not found")
    return {"detail": "Automation deleted"}


@router.post("/{auto_id}/test", dependencies=[CsrfVerified])
async def test(auto_id: int, _: AdminUser, db: DBSession) -> dict:
    try:
        return await automation_service.test_automation(db, auto_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/events")
async def list_events(_: ActiveUser, db: DBSession) -> list[dict]:
    return await automation_service.list_events(db)
