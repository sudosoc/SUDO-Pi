from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.services import backup_service

router = APIRouter(prefix="/backup", tags=["Backup"])

# ─── Request / Response models ────────────────────────────────────────────────


class BackupNameBody(BaseModel):
    name: Optional[str] = None


class ScheduleUpdateBody(BaseModel):
    backup_type: str
    enabled: bool
    cron_expression: str = Field(default="0 2 * * *", min_length=5)
    keep_count: int = Field(default=5, ge=1, le=100)
    destination: str = Field(default="local")
    rclone_remote: Optional[str] = None


class SnapshotImportBody(BaseModel):
    # The raw snapshot dict — validated at the service layer
    data: dict


# ─── Backup list & metadata ───────────────────────────────────────────────────


@router.get("/list")
async def list_backups(_: ActiveUser, db: DBSession) -> list[dict]:
    """Return all backup records ordered by date descending."""
    return await backup_service.list_backups(db)


@router.get("/disk-usage")
async def get_disk_usage(_: ActiveUser, db: DBSession) -> dict:
    """Return disk usage info for the backup directory."""
    return await backup_service.get_backup_disk_usage(db)


# ─── Create backups ───────────────────────────────────────────────────────────


@router.post("/system", dependencies=[CsrfVerified])
async def create_system_backup(
    body: BackupNameBody,
    background_tasks: BackgroundTasks,
    _: AdminUser,
    db: DBSession,
) -> dict:
    """Trigger a system backup (runs in background)."""
    record = await backup_service.create_system_backup(db, name=body.name)
    return {"detail": "System backup started", "backup_id": record.id, "status": record.status.value}


@router.post("/config", dependencies=[CsrfVerified])
async def create_config_backup(
    body: BackupNameBody,
    background_tasks: BackgroundTasks,
    _: AdminUser,
    db: DBSession,
) -> dict:
    """Trigger a configuration-only backup."""
    record = await backup_service.create_config_backup(db, name=body.name)
    return {"detail": "Config backup started", "backup_id": record.id, "status": record.status.value}


@router.post("/full", dependencies=[CsrfVerified])
async def create_full_backup(
    body: BackupNameBody,
    background_tasks: BackgroundTasks,
    _: AdminUser,
    db: DBSession,
) -> dict:
    """Trigger a full restore backup (comprehensive system archive)."""
    record = await backup_service.create_sd_image_backup(db, name=body.name)
    return {"detail": "Full backup started", "backup_id": record.id, "status": record.status.value}


# ─── Per-backup actions ───────────────────────────────────────────────────────


@router.get("/{backup_id}/download")
async def download_backup(backup_id: int, _: AdminUser, db: DBSession) -> FileResponse:
    """Download a completed backup archive."""
    path = await backup_service.get_backup_file_path(db, backup_id)
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
    )


@router.delete("/{backup_id}", dependencies=[CsrfVerified])
async def delete_backup(backup_id: int, _: AdminUser, db: DBSession) -> dict:
    """Delete a backup record and its file from disk."""
    await backup_service.delete_backup(db, backup_id)
    return {"detail": f"Backup {backup_id} deleted"}


@router.post("/{backup_id}/restore", dependencies=[CsrfVerified])
async def restore_backup(backup_id: int, _: AdminUser, db: DBSession) -> dict:
    """Restore a config or full backup to the system."""
    return await backup_service.restore_config_backup(db, backup_id)


# ─── Schedules ───────────────────────────────────────────────────────────────


@router.get("/schedule")
async def get_schedule(_: ActiveUser, db: DBSession) -> list[dict]:
    """Return all configured backup schedules."""
    return await backup_service.get_schedule(db)


@router.put("/schedule", dependencies=[CsrfVerified])
async def update_schedule(body: ScheduleUpdateBody, _: AdminUser, db: DBSession) -> dict:
    """Create or update a backup schedule for the given backup type."""
    return await backup_service.update_schedule(
        db,
        backup_type=body.backup_type,
        enabled=body.enabled,
        cron_expression=body.cron_expression,
        keep_count=body.keep_count,
        destination=body.destination,
        rclone_remote=body.rclone_remote,
    )


# ─── Snapshot export / import ─────────────────────────────────────────────────


@router.get("/snapshot/export")
async def export_snapshot(_: AdminUser, db: DBSession) -> JSONResponse:
    """Export all SUDO-Pi settings as a downloadable JSON snapshot."""
    snapshot = await backup_service.export_snapshot(db)
    import json
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"sudopi_snapshot_{ts}.json"
    return JSONResponse(
        content=snapshot,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/snapshot/import", dependencies=[CsrfVerified])
async def import_snapshot(body: SnapshotImportBody, _: AdminUser, db: DBSession) -> dict:
    """Import and apply a SUDO-Pi settings snapshot."""
    return await backup_service.import_snapshot(db, body.data)
