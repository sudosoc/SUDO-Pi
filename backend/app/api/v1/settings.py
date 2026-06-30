from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependencies import AdminUser, CsrfVerified, DBSession
from app.services import system_service
from app.services.audit_service import AuditService

router = APIRouter(prefix="/settings", tags=["Settings"])


class HostnameUpdate(BaseModel):
    hostname: str


class TimezoneUpdate(BaseModel):
    timezone: str


class SshConfigUpdate(BaseModel):
    enabled: bool
    port: int = 22
    password_auth: bool = True


@router.get("")
async def get_settings(_: AdminUser) -> dict:
    import socket, platform, subprocess
    hostname = socket.gethostname()

    tz = "UTC"
    try:
        result = subprocess.run(["timedatectl", "show", "--property=Timezone", "--value"], capture_output=True, text=True, timeout=3)
        tz = result.stdout.strip() or "UTC"
    except Exception:
        pass

    ssh_active = "inactive"
    try:
        result = subprocess.run(["systemctl", "is-active", "ssh"], capture_output=True, text=True, timeout=3)
        ssh_active = result.stdout.strip()
    except Exception:
        pass

    return {
        "hostname": hostname,
        "timezone": tz,
        "ssh": {
            "is_active": ssh_active == "active",
        },
        "ap": {
            "interface": settings.AP_INTERFACE,
            "ip": settings.AP_IP,
        },
        "app": {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "env": settings.APP_ENV,
        },
    }


@router.put("/hostname", dependencies=[CsrfVerified])
async def update_hostname(body: HostnameUpdate, current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    success = await system_service.set_hostname(body.hostname)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to set hostname")
    await audit.log("settings.hostname.update", user=current_user, resource=body.hostname, status_code=200)
    return {"detail": f"Hostname set to {body.hostname}"}


@router.put("/timezone", dependencies=[CsrfVerified])
async def update_timezone(body: TimezoneUpdate, current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    success = await system_service.set_timezone(body.timezone)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to set timezone")
    await audit.log("settings.timezone.update", user=current_user, resource=body.timezone, status_code=200)
    return {"detail": f"Timezone set to {body.timezone}"}


@router.put("/ssh", dependencies=[CsrfVerified])
async def update_ssh(body: SshConfigUpdate, current_user: AdminUser, db: DBSession) -> dict:
    audit = AuditService(db)
    action = "start" if body.enabled else "stop"
    success = await system_service.control_service("ssh", action)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update SSH")
    await audit.log("settings.ssh.update", user=current_user, resource=action, status_code=200)
    return {"detail": f"SSH {action}ed"}
