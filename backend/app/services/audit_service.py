from __future__ import annotations

from datetime import datetime, timezone

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.user import User
from app.repositories.audit_repository import AuditRepository


class AuditService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AuditRepository(db)

    async def log(
        self,
        action: str,
        *,
        user: User | None = None,
        resource: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        status_code: int | None = None,
        details: str | None = None,
    ) -> AuditLog:
        entry = await self.repo.create(
            user_id=user.id if user else None,
            username=user.username if user else None,
            action=action,
            resource=resource,
            ip_address=ip_address,
            user_agent=user_agent,
            status_code=status_code,
            details=details,
            created_at=datetime.now(timezone.utc),
        )
        logger.bind(audit=True).info(
            "AUDIT | action={} user={} resource={} ip={} status={}",
            action,
            user.username if user else "anonymous",
            resource,
            ip_address,
            status_code,
        )
        return entry

    async def get_logs(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        user_id: int | None = None,
        action: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> tuple[list[AuditLog], int]:
        return await self.repo.get_paginated(
            skip=skip,
            limit=limit,
            user_id=user_id,
            action=action,
            start_date=start_date,
            end_date=end_date,
        )


async def get_audit_logs(
    db: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 100,
    username: str | None = None,
    action: str | None = None,
    status: str | None = None,
) -> dict:
    """Standalone helper used by the security API router."""
    from app.repositories.audit_repository import AuditRepository
    repo = AuditRepository(db)
    items, total = await repo.get_paginated(
        skip=skip,
        limit=min(limit, 500),
        action=action,
    )
    result = []
    for entry in items:
        row = {
            "id": entry.id,
            "timestamp": entry.created_at.isoformat() if entry.created_at else None,
            "username": entry.username or "system",
            "action": entry.action or "",
            "resource": entry.resource or "",
            "ip_address": entry.ip_address or "",
            "status": "success" if (entry.status_code or 200) < 400 else "failure",
            "detail": entry.details or "",
        }
        if username and row["username"] != username:
            continue
        if status and row["status"] != status:
            continue
        result.append(row)
    return {"items": result, "total": total}
