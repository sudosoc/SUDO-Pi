from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import snapshot_service

router = APIRouter(prefix="/snapshots", tags=["Snapshots"])


class SnapshotCreateBody(BaseModel):
    label: Optional[str] = None


@router.get("")
async def list_snapshots(_: ActiveUser) -> list[dict]:
    return await snapshot_service.list_snapshots()


@router.post("", dependencies=[CsrfVerified])
async def create_snapshot(
    body: SnapshotCreateBody,
    _: AdminUser,
    background_tasks: BackgroundTasks,
) -> dict:
    try:
        return await snapshot_service.create_snapshot(body.label or "")
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.delete("/{snapshot_id}", dependencies=[CsrfVerified])
async def delete_snapshot(snapshot_id: int, _: AdminUser) -> dict:
    try:
        await snapshot_service.delete_snapshot(snapshot_id)
        return {"detail": f"Snapshot {snapshot_id} deleted"}
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.get("/{snapshot_id}/download")
async def download_snapshot(snapshot_id: int, _: AdminUser) -> FileResponse:
    try:
        path = await snapshot_service.get_snapshot_path(snapshot_id)
        return FileResponse(
            path=str(path),
            filename=path.name,
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{path.name}"'},
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/{snapshot_id}/restore", dependencies=[CsrfVerified])
async def restore_snapshot(snapshot_id: int, _: AdminUser) -> dict:
    try:
        return await snapshot_service.restore_snapshot(snapshot_id)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
