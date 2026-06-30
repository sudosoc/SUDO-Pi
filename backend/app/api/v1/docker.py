from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.dependencies import ActiveUser, AdminUser, OperatorUser, CsrfVerified
from app.services import docker_service

router = APIRouter(prefix="/docker", tags=["docker"])


@router.get("/containers")
async def list_containers(all: bool = True, _: ActiveUser = None):
    try:
        return await docker_service.list_containers(all_containers=all)
    except RuntimeError as exc:
        raise HTTPException(503, f"Docker unavailable: {exc}")


@router.post("/containers/{container_id}/{action}", dependencies=[CsrfVerified])
async def container_action(container_id: str, action: str, _: OperatorUser = None):
    allowed = {"start", "stop", "restart", "pause", "unpause"}
    if action not in allowed:
        raise HTTPException(400, f"Action must be one of: {', '.join(allowed)}")
    try:
        return await docker_service.container_action(container_id, action)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/containers/{container_id}", dependencies=[CsrfVerified])
async def remove_container(container_id: str, force: bool = False, _: AdminUser = None):
    try:
        return await docker_service.remove_container(container_id, force=force)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/images")
async def list_images(_: ActiveUser = None):
    try:
        return await docker_service.list_images()
    except RuntimeError as exc:
        raise HTTPException(503, f"Docker unavailable: {exc}")


@router.delete("/images/{image_id}", dependencies=[CsrfVerified])
async def remove_image(image_id: str, force: bool = False, _: AdminUser = None):
    try:
        return await docker_service.remove_image(image_id, force=force)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
