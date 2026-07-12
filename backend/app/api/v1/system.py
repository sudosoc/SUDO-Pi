from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query, WebSocket, status
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel, field_validator

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession, OperatorUser
from app.schemas.system import ProcessInfo, ServiceInfo, SystemStats
from app.services import system_service
from app.services.audit_service import AuditService
from app.websockets.system_ws import handle_system_websocket

router = APIRouter(prefix="/system", tags=["System"])


class HostnameRequest(BaseModel):
    hostname: str

    @field_validator("hostname")
    @classmethod
    def validate_hostname(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$", v):
            raise ValueError("Invalid hostname")
        return v


class TimezoneRequest(BaseModel):
    timezone: str

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z][A-Za-z0-9_+\-/]{1,63}$", v):
            raise ValueError("Invalid timezone")
        return v


class CpuGovernorRequest(BaseModel):
    governor: str

    @field_validator("governor")
    @classmethod
    def validate_governor(cls, v: str) -> str:
        allowed = {"performance", "powersave", "ondemand", "conservative", "schedutil", "userspace"}
        if v not in allowed:
            raise ValueError(f"Governor must be one of: {', '.join(sorted(allowed))}")
        return v


@router.get("/config")
async def get_system_config(_: AdminUser) -> dict:
    return await system_service.get_system_config()


@router.get("/stats", response_model=SystemStats)
async def get_stats(_: ActiveUser) -> SystemStats:
    return await system_service.get_full_system_stats()


@router.get("/processes", response_model=list[ProcessInfo])
async def get_processes(_: ActiveUser, limit: int = Query(25, ge=1, le=100)) -> list[ProcessInfo]:
    return system_service._get_top_processes(n=limit)


@router.post("/processes/{pid}/kill", dependencies=[CsrfVerified])
async def kill_process(pid: int, current_user: OperatorUser, db: DBSession) -> dict:
    if pid <= 1:
        raise HTTPException(400, "Cannot kill PID 1 or lower")
    audit = AuditService(db)
    try:
        await system_service.kill_process(pid)
    except (PermissionError, ProcessLookupError) as exc:
        raise HTTPException(400, str(exc))
    await audit.log("process.kill", user=current_user, resource=str(pid), status_code=200)
    return {"detail": f"Process {pid} killed"}


@router.get("/services", response_model=list[ServiceInfo])
async def get_services(_: ActiveUser) -> list[ServiceInfo]:
    return await system_service.get_services_status()


@router.post("/services/{name}/{action}", dependencies=[CsrfVerified])
async def control_service(
    name: str,
    action: str,
    current_user: OperatorUser,
    db: DBSession,
) -> dict:
    audit = AuditService(db)
    try:
        success = await system_service.control_service(name, action)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to {action} {name}")

    await audit.log(f"service.{action}", user=current_user, resource=name, status_code=200)
    return {"detail": f"Service {name} {action}ed successfully"}


@router.get("/logs")
async def get_logs(
    _: ActiveUser,
    unit: str | None = Query(None),
    lines: int = Query(200, ge=1, le=1000),
) -> list[dict]:
    return await system_service.get_journal_logs(unit=unit, lines=lines)


@router.post("/hostname", dependencies=[CsrfVerified])
async def set_hostname(body: HostnameRequest, current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    ok = await system_service.set_hostname(body.hostname)
    if not ok:
        raise HTTPException(500, "Failed to set hostname")
    await audit.log("system.set_hostname", user=current_user, resource=body.hostname, status_code=200)
    return {"detail": f"Hostname set to {body.hostname}"}


@router.post("/timezone", dependencies=[CsrfVerified])
async def set_timezone(body: TimezoneRequest, current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    ok = await system_service.set_timezone(body.timezone)
    if not ok:
        raise HTTPException(500, "Failed to set timezone")
    await audit.log("system.set_timezone", user=current_user, resource=body.timezone, status_code=200)
    return {"detail": f"Timezone set to {body.timezone}"}


@router.get("/cpu-freq")
async def get_cpu_freq(_: ActiveUser) -> dict:
    return await system_service.get_cpu_freq_info()


@router.post("/cpu-governor", dependencies=[CsrfVerified])
async def set_cpu_governor(body: CpuGovernorRequest, current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    ok = await system_service.set_cpu_governor(body.governor)
    if not ok:
        raise HTTPException(500, "Failed to set CPU governor (cpufreq may not be supported)")
    await audit.log("system.set_cpu_governor", user=current_user, resource=body.governor, status_code=200)
    return {"governor": body.governor}


@router.get("/hardware")
async def get_hardware_info(_: ActiveUser) -> dict:
    return await system_service.get_hardware_info()


@router.get("/boot-log")
async def get_boot_log(
    _: ActiveUser,
    boot: int = Query(0, ge=0, le=5),
    lines: int = Query(500, ge=1, le=2000),
) -> list[dict]:
    return await system_service.get_boot_log(boot=boot, lines=lines)


@router.get("/net-interfaces")
async def get_net_interfaces(_: ActiveUser) -> list[dict]:
    return await system_service.get_net_interfaces()


@router.post("/ntp", dependencies=[CsrfVerified])
async def set_ntp(
    body: dict,
    current_user: AdminUser,
    db: DBSession,
) -> dict:
    enabled: bool = bool(body.get("enabled", True))
    audit = AuditService(db)
    ok = await system_service.set_ntp(enabled)
    if not ok:
        raise HTTPException(500, "Failed to configure NTP")
    await audit.log("system.set_ntp", user=current_user, resource=str(enabled), status_code=200)
    return {"detail": f"NTP {'enabled' if enabled else 'disabled'}"}


@router.get("/backup")
async def download_backup(_: AdminUser) -> FileResponse:
    import tarfile, tempfile
    from pathlib import Path
    from app.core.config import settings, BASE_DIR

    tmp = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False)
    tmp.close()
    with tarfile.open(tmp.name, "w:gz") as tar:
        db_url = settings.DATABASE_URL.replace("sqlite+aiosqlite:///./", "").replace("sqlite+aiosqlite:///", "")
        db_path = Path(db_url) if Path(db_url).is_absolute() else BASE_DIR / "backend" / db_url
        if db_path.exists():
            tar.add(str(db_path), arcname="sudo_pi.db")
        env_path = BASE_DIR / "backend" / ".env"
        if env_path.exists():
            tar.add(str(env_path), arcname=".env")
    return FileResponse(tmp.name, media_type="application/gzip", filename="sudo-pi-backup.tar.gz")


@router.post("/reboot", dependencies=[CsrfVerified])
async def reboot(current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    await audit.log("system.reboot", user=current_user, status_code=200)
    await system_service.reboot_system()
    return {"detail": "System rebooting"}


@router.post("/shutdown", dependencies=[CsrfVerified])
async def shutdown(current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    await audit.log("system.shutdown", user=current_user, status_code=200)
    await system_service.shutdown_system()
    return {"detail": "System shutting down"}


@router.post("/update", dependencies=[CsrfVerified])
async def software_update(current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        result = await system_service.start_software_update()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    await audit.log("system.update", user=current_user, status_code=200)
    return result


@router.get("/update/status")
async def software_update_status(_: AdminUser) -> dict:
    return await system_service.get_software_update_status()


@router.websocket("/ws")
async def system_ws(websocket: WebSocket) -> None:
    await handle_system_websocket(websocket)
