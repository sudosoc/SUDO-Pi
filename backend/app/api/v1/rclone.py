from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import rclone_service

router = APIRouter(prefix="/rclone", tags=["Rclone"])

# ─── Request models ───────────────────────────────────────────────────────────


class AddRemoteBody(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1)
    config: dict = Field(default_factory=dict)


class SyncBody(BaseModel):
    remote_path: str = Field(min_length=1)
    include_configs: bool = True


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/providers")
async def list_providers() -> list[dict]:
    """Return the list of supported cloud storage providers (no auth required)."""
    return rclone_service.CLOUD_PROVIDERS


@router.get("/status")
async def get_status(_: ActiveUser) -> dict:
    """Return rclone installation status, version, and configured remotes."""
    return await rclone_service.get_status()


@router.post("/install", dependencies=[CsrfVerified])
async def install_rclone(_: AdminUser) -> dict:
    """Download and install rclone from rclone.org."""
    return await rclone_service.install_rclone()


@router.get("/remotes")
async def list_remotes(_: ActiveUser) -> list[dict]:
    """Return all configured rclone remotes."""
    return await rclone_service.get_remotes()


@router.post("/remotes", dependencies=[CsrfVerified])
async def add_remote(body: AddRemoteBody, _: AdminUser) -> dict:
    """Add a new rclone remote."""
    return await rclone_service.add_remote(
        name=body.name,
        provider_type=body.provider,
        config_params=body.config,
    )


@router.delete("/remotes/{name}", dependencies=[CsrfVerified])
async def remove_remote(name: str, _: AdminUser) -> dict:
    """Remove an rclone remote by name."""
    await rclone_service.remove_remote(name)
    return {"detail": f"Remote '{name}' removed"}


@router.post("/remotes/{name}/test", dependencies=[CsrfVerified])
async def test_remote(name: str, _: AdminUser) -> dict:
    """Test connectivity to an rclone remote."""
    return await rclone_service.test_remote(name)


@router.get("/remotes/{name}/files")
async def list_remote_files(name: str, path: str = "", _: ActiveUser = None) -> list[dict]:
    """List files at a given path within a configured remote."""
    remote_path = f"{name}:{path}"
    return await rclone_service.list_remote_files(remote_path)


@router.post("/sync", dependencies=[CsrfVerified])
async def sync_to_remote(body: SyncBody, _: AdminUser) -> dict:
    """Trigger an immediate rclone sync of the backup directory to a remote."""
    from pathlib import Path
    local = rclone_service.BACKUP_DIR
    return await rclone_service.sync_to_remote(
        remote_path=body.remote_path,
        local_dir=local,
    )
