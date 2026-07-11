from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import reverse_proxy_service

router = APIRouter(prefix="/reverse-proxy", tags=["ReverseProxy"])


class ProxyHostBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    domain: str = Field(..., min_length=3, max_length=255)
    upstream_host: str = Field(..., min_length=1, max_length=255)
    upstream_port: int = Field(..., ge=1, le=65535)
    enabled: bool = True


class ToggleBody(BaseModel):
    enabled: bool


@router.get("")
async def list_hosts(_: ActiveUser) -> list[dict]:
    return await reverse_proxy_service.list_hosts()


@router.post("", dependencies=[CsrfVerified])
async def add_host(body: ProxyHostBody, _: AdminUser) -> dict:
    try:
        return await reverse_proxy_service.add_host(
            body.name, body.domain, body.upstream_host, body.upstream_port, body.enabled
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.put("/{name}", dependencies=[CsrfVerified])
async def update_host(name: str, body: ProxyHostBody, _: AdminUser) -> dict:
    try:
        return await reverse_proxy_service.update_host(
            name, body.domain, body.upstream_host, body.upstream_port, body.enabled
        )
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(code, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.delete("/{name}", dependencies=[CsrfVerified])
async def delete_host(name: str, _: AdminUser) -> dict:
    try:
        await reverse_proxy_service.delete_host(name)
        return {"detail": f"Host '{name}' deleted"}
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.patch("/{name}/toggle", dependencies=[CsrfVerified])
async def toggle_host(name: str, body: ToggleBody, _: AdminUser) -> dict:
    try:
        return await reverse_proxy_service.toggle_host(name, body.enabled)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
