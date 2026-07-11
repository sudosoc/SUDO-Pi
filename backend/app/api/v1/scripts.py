from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import script_service

router = APIRouter(prefix="/scripts", tags=["Scripts"])


class ScriptCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    content: str = Field(default="", max_length=100_000)
    language: str = Field(default="bash")
    description: str = Field(default="")


class ScriptUpdateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    content: str = Field(default="", max_length=100_000)
    description: str = Field(default="")


@router.get("")
async def list_scripts(_: ActiveUser) -> list[dict]:
    return await script_service.list_scripts()


@router.get("/history")
async def all_history(limit: int = 50, _: ActiveUser = None) -> list[dict]:
    return await script_service.get_history(limit=limit)


@router.get("/{script_id}")
async def get_script(script_id: int, _: ActiveUser) -> dict:
    try:
        return await script_service.get_script(script_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("", dependencies=[CsrfVerified])
async def create_script(body: ScriptCreateBody, _: AdminUser) -> dict:
    if body.language not in ("bash", "python"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Language must be 'bash' or 'python'")
    return await script_service.create_script(
        body.name, body.content, body.language, body.description
    )


@router.put("/{script_id}", dependencies=[CsrfVerified])
async def update_script(script_id: int, body: ScriptUpdateBody, _: AdminUser) -> dict:
    try:
        return await script_service.update_script(
            script_id, body.name, body.content, body.description
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.delete("/{script_id}", dependencies=[CsrfVerified])
async def delete_script(script_id: int, _: AdminUser) -> dict:
    try:
        await script_service.delete_script(script_id)
        return {"detail": f"Script {script_id} deleted"}
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/{script_id}/run", dependencies=[CsrfVerified])
async def run_script(script_id: int, _: AdminUser) -> dict:
    try:
        return await script_service.run_script(script_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.get("/{script_id}/history")
async def script_history(script_id: int, limit: int = 20, _: ActiveUser = None) -> list[dict]:
    return await script_service.get_history(script_id=script_id, limit=limit)
