from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import process_service

router = APIRouter(prefix="/processes", tags=["Processes"])


class KillRequest(BaseModel):
    signal: int = 15


@router.get("")
async def list_processes(_: ActiveUser) -> list[dict]:
    return await process_service.list_processes()


@router.post("/{pid}/kill", dependencies=[CsrfVerified])
async def kill_process(pid: int, body: KillRequest, _: AdminUser) -> dict:
    ok, err = await process_service.kill_process(pid, body.signal)
    if not ok:
        raise HTTPException(status_code=400, detail=err or f"Failed to kill PID {pid}")
    return {"killed": True, "pid": pid, "signal": body.signal}


@router.get("/{pid}/environ")
async def get_process_environ(pid: int, _: AdminUser) -> dict:
    if pid <= 0:
        raise HTTPException(status_code=400, detail="Invalid PID")
    env, err = await process_service.get_process_environ(pid)
    if env is None:
        raise HTTPException(status_code=404, detail=err or f"Cannot read environ for PID {pid}")
    return {"pid": pid, "environ": env}


@router.get("/ports")
async def get_open_ports(_: ActiveUser) -> list[dict]:
    return await process_service.get_open_ports()
