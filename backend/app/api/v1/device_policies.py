from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.services import device_policy_service, network_service, device_bandwidth_service, known_device_service

router = APIRouter(prefix="/device-policies", tags=["Device Policies"])


class CurfewEntry(BaseModel):
    days: list[int] = Field(..., description="List of weekday ints: 0=Mon … 6=Sun")
    start: str = Field(..., pattern=r"^\d{1,2}:\d{2}$")
    end: str = Field(..., pattern=r"^\d{1,2}:\d{2}$")


class PolicyBody(BaseModel):
    hostname: Optional[str] = Field(None, max_length=255)
    last_ip: Optional[str] = Field(None, max_length=45)
    download_kbps: Optional[int] = Field(None, ge=0, le=1_000_000)
    upload_kbps: Optional[int] = Field(None, ge=0, le=1_000_000)
    blocked: Optional[bool] = None
    schedule_enabled: Optional[bool] = None
    block_start: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    block_end: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    curfew_schedule: Optional[list[CurfewEntry]] = None
    monthly_quota_mb: Optional[int] = Field(None, ge=0)
    quota_reset_day: Optional[int] = Field(None, ge=1, le=28)


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
    curfew = [e.model_dump() for e in body.curfew_schedule] if body.curfew_schedule is not None else None
    try:
        return await device_policy_service.upsert_policy(
            db, mac,
            hostname=body.hostname,
            last_ip=body.last_ip,
            download_kbps=body.download_kbps,
            upload_kbps=body.upload_kbps,
            blocked=body.blocked,
            schedule_enabled=body.schedule_enabled,
            block_start=body.block_start,
            block_end=body.block_end,
            curfew_schedule=curfew,
            monthly_quota_mb=body.monthly_quota_mb,
            quota_reset_day=body.quota_reset_day,
        )
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


@router.get("/{mac}/bandwidth-history")
async def get_bandwidth_history(
    mac: str,
    _: ActiveUser,
    db: DBSession,
    hours: int = Query(24, ge=1, le=720),
) -> list[dict]:
    """Per-device bandwidth history for the last N hours (default 24)."""
    return await device_bandwidth_service.get_history(db, mac, hours=hours)


@router.get("/{mac}/bandwidth-monthly")
async def get_monthly_bandwidth(mac: str, _: ActiveUser, db: DBSession) -> dict:
    """Current month-to-date data usage for a device."""
    return await device_bandwidth_service.get_monthly_summary(db, mac)


@router.get("/known-devices")
async def list_known_devices(_: ActiveUser, db: DBSession) -> list[dict]:
    """All devices ever seen on the AP, sorted by most-recently-seen."""
    return await known_device_service.get_all(db)
