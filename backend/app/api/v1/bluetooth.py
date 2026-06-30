from __future__ import annotations

import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, OperatorUser, CsrfVerified
from app.services import bluetooth_service

router = APIRouter(prefix="/bluetooth", tags=["bluetooth"])


class MacRequest(BaseModel):
    mac: str

    @property
    def validated_mac(self) -> str:
        if not re.fullmatch(r"([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}", self.mac):
            raise ValueError("Invalid MAC address")
        return self.mac


@router.get("/devices")
async def list_devices(_: ActiveUser = None):
    try:
        return await bluetooth_service.list_paired_devices()
    except Exception as exc:
        raise HTTPException(503, f"Bluetooth unavailable: {exc}")


@router.get("/scan")
async def scan_devices(_: OperatorUser = None):
    try:
        return await bluetooth_service.scan_devices()
    except Exception as exc:
        raise HTTPException(503, f"Scan failed: {exc}")


@router.post("/pair", dependencies=[CsrfVerified])
async def pair_device(body: MacRequest, _: OperatorUser = None):
    try:
        return await bluetooth_service.pair_device(body.mac)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/connect", dependencies=[CsrfVerified])
async def connect_device(body: MacRequest, _: OperatorUser = None):
    try:
        return await bluetooth_service.pair_device(body.mac)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/disconnect", dependencies=[CsrfVerified])
async def disconnect_device(body: MacRequest, _: OperatorUser = None):
    try:
        return await bluetooth_service.disconnect_device(body.mac)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/devices/{mac}", dependencies=[CsrfVerified])
async def remove_device(mac: str, _: OperatorUser = None):
    if not re.fullmatch(r"([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}", mac):
        raise HTTPException(400, "Invalid MAC address format")
    try:
        return await bluetooth_service.remove_device(mac)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
