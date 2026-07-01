from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query

from app.core.dependencies import ActiveUser, DBSession
from app.models.audit import AuditLog
from app.services.audit_service import AuditService

router = APIRouter(prefix="/logs", tags=["Logs"])



@router.get("/audit")
async def get_audit_logs(
    _: ActiveUser,
    db: DBSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> dict:
    service = AuditService(db)
    logs, total = await service.get_logs(
        skip=skip,
        limit=limit,
        user_id=user_id,
        action=action,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        "items": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "username": log.username,
                "action": log.action,
                "resource": log.resource,
                "ip_address": log.ip_address,
                "status_code": log.status_code,
                "details": log.details,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/system")
async def get_system_logs(
    _: ActiveUser,
    unit: str | None = Query(None),
    lines: int = Query(200, ge=1, le=2000),
) -> list[dict]:
    from app.services import system_service
    return await system_service.get_journal_logs(unit=unit, lines=lines)
