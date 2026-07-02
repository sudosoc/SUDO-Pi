from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import compose_service

router = APIRouter(prefix="/compose", tags=["Compose"])


class StackCreate(BaseModel):
    name: str = Field(..., pattern=r"^[a-z0-9][a-z0-9\-]*$", max_length=50)
    content: str


@router.get("/stacks")
async def list_stacks(_: ActiveUser = None):
    try:
        return await compose_service.list_stacks()
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/stacks", dependencies=[CsrfVerified])
async def create_stack(body: StackCreate, _: AdminUser = None):
    try:
        return await compose_service.create_stack(body.name, body.content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.get("/stacks/{name}")
async def get_stack(name: str, _: ActiveUser = None):
    try:
        return await compose_service.get_stack_status(name)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/stacks/{name}/start", dependencies=[CsrfVerified])
async def start_stack(name: str, _: AdminUser = None):
    try:
        return await compose_service.start_stack(name)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/stacks/{name}/stop", dependencies=[CsrfVerified])
async def stop_stack(name: str, _: AdminUser = None):
    try:
        return await compose_service.stop_stack(name)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/stacks/{name}", dependencies=[CsrfVerified])
async def remove_stack(
    name: str,
    remove_volumes: bool = Query(False),
    _: AdminUser = None,
):
    try:
        return await compose_service.remove_stack(name, remove_volumes=remove_volumes)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/stacks/{name}/logs")
async def get_stack_logs(name: str, lines: int = Query(100, ge=1, le=5000), _: ActiveUser = None):
    try:
        logs = await compose_service.get_stack_logs(name, lines=lines)
        return {"logs": logs}
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/stacks/{name}/pull", dependencies=[CsrfVerified])
async def pull_stack_images(name: str, _: AdminUser = None):
    try:
        return await compose_service.pull_stack_images(name)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
