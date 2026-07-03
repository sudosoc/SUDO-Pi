from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import dns_service

router = APIRouter(prefix="/dns", tags=["DNS"])


class RecordBody(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=253)
    ip: str = Field(..., min_length=7, max_length=15)


class LeaseBody(BaseModel):
    mac: str = Field(..., min_length=17, max_length=17)
    ip: str = Field(..., min_length=7, max_length=15)
    hostname: str | None = Field(None, max_length=253)


@router.get("")
async def get_all(_: ActiveUser) -> dict:
    data = await dns_service.get_all()
    data["upstream"] = await dns_service.get_upstream()
    return data


@router.post("/records", dependencies=[CsrfVerified])
async def add_record(body: RecordBody, _: AdminUser) -> dict:
    try:
        return await dns_service.add_record(body.hostname, body.ip)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/records/{hostname}", dependencies=[CsrfVerified])
async def delete_record(hostname: str, _: AdminUser) -> dict:
    try:
        return await dns_service.delete_record(hostname)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/leases", dependencies=[CsrfVerified])
async def add_lease(body: LeaseBody, _: AdminUser) -> dict:
    try:
        return await dns_service.add_lease(body.mac, body.ip, body.hostname)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/leases/{mac}", dependencies=[CsrfVerified])
async def delete_lease(mac: str, _: AdminUser) -> dict:
    try:
        return await dns_service.delete_lease(mac)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
