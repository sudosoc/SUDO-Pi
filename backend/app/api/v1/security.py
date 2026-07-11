from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, get_current_user
from app.models.user import UserRole
from app.services import security_service
from app.services.audit_service import get_audit_logs

router = APIRouter(prefix="/security", tags=["security"])


class UnbanRequest(BaseModel):
    ip: str


@router.get("/fail2ban")
async def get_fail2ban_status(_: AdminUser = None):
    return await security_service.get_fail2ban_status()


@router.post("/fail2ban/{jail}/unban", dependencies=[CsrfVerified])
async def unban_ip(jail: str, body: UnbanRequest, _: AdminUser = None):
    try:
        return await security_service.unban_ip(jail, body.ip)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/sessions")
async def get_sessions(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    is_admin = current_user.role == UserRole.ADMIN
    return await security_service.get_active_sessions(db, current_user.id, is_admin)


@router.delete("/sessions/{jti}", dependencies=[CsrfVerified])
async def revoke_session(
    jti: str,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    try:
        return await security_service.revoke_session(jti, db)
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.delete("/sessions", dependencies=[CsrfVerified])
async def revoke_all_sessions(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    return await security_service.revoke_all_sessions(db)


@router.get("/audit")
async def get_audit_log(
    skip: int = 0,
    limit: int = 100,
    username: str | None = None,
    action: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    return await get_audit_logs(db, skip=skip, limit=limit, username=username, action=action, status=status)


@router.get("/firewall")
async def get_firewall_rules(_: AdminUser = None):
    return await security_service.get_firewall_rules()


@router.get("/ssh-attempts")
async def get_ssh_attempts(_: AdminUser = None):
    return await security_service.get_ssh_attempts()
