from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.services import device_policy_service, network_service

router = APIRouter(prefix="/device-policies", tags=["Device Policies"])


class PolicyBody(BaseModel):
    hostname: Optional[str] = Field(None, max_length=255)
    last_ip: Optional[str] = Field(None, max_length=45)
    download_kbps: Optional[int] = Field(None, ge=0, le=1_000_000)
    upload_kbps: Optional[int] = Field(None, ge=0, le=1_000_000)
    blocked: Optional[bool] = None
    schedule_enabled: Optional[bool] = None
    block_start: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    block_end: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")


@router.get("")
async def list_policies(_: ActiveUser, db: DBSession) -> dict:
    """All saved policies + currently connected AP clients, for a merged view."""
    policies = await device_policy_service.list_policies(db)
    try:
        clients = await network_service.get_ap_clients()
    except Exception:
        clients = []
    return {"policies": policies, "clients": clients}


@router.put("/{mac}", dependencies=[CsrfVerified])
async def upsert_policy(mac: str, body: PolicyBody, _: AdminUser, db: DBSession) -> dict:
    try:
        return await device_policy_service.upsert_policy(db, mac, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Failed to apply policy: {exc}")


@router.delete("/{mac}", dependencies=[CsrfVerified])
async def delete_policy(mac: str, _: AdminUser, db: DBSession) -> dict:
    try:
        deleted = await device_policy_service.delete_policy(db, mac)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not deleted:
        raise HTTPException(404, "No policy for that device")
    return {"detail": "Policy removed and enforcement rebuilt"}


@router.post("/{mac}/block", dependencies=[CsrfVerified])
async def block_device(mac: str, _: AdminUser, db: DBSession) -> dict:
    try:
        return await device_policy_service.upsert_policy(db, mac, blocked=True)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/{mac}/unblock", dependencies=[CsrfVerified])
async def unblock_device(mac: str, _: AdminUser, db: DBSession) -> dict:
    try:
        return await device_policy_service.upsert_policy(db, mac, blocked=False)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/apply", dependencies=[CsrfVerified])
async def reapply(_: AdminUser, db: DBSession) -> dict:
    stats = await device_policy_service.reapply_all(db)
    return {"detail": "Enforcement rebuilt", **stats}
