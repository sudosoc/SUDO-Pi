from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.core.security import verify_password
from app.services import system_user_service
from app.services.audit_service import AuditService

router = APIRouter(prefix="/system-users", tags=["System Users"])


# ─── Step-up auth ─────────────────────────────────────────────────────────────


class StepUp(BaseModel):
    """Sensitive Pi-user actions re-confirm the admin's dashboard password.

    `system_password` is accepted for backward compatibility with older
    clients but is no longer required or verified.
    """
    dashboard_password: str = Field(..., min_length=1, max_length=128)
    system_password: Optional[str] = Field(None, max_length=128)


async def _verify_step_up(step: StepUp, current_user) -> None:
    """Re-confirm the caller's dashboard admin password (re-auth).

    AdminUser already guarantees the dashboard role; here we re-check the
    dashboard password so a walk-up session can't perform OS-level changes.
    """
    if not verify_password(step.dashboard_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Dashboard password is incorrect")


# ─── Request bodies ───────────────────────────────────────────────────────────


class CreateUserBody(StepUp):
    username: str
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)
    shell: str = Field("/bin/bash", max_length=128)
    create_home: bool = True
    is_sudo: bool = False
    extra_groups: list[str] = Field(default_factory=list)


class DeleteUserBody(StepUp):
    remove_home: bool = False


class SetPasswordBody(StepUp):
    password: str = Field(..., min_length=6, max_length=128)


class LockBody(StepUp):
    locked: bool


class GroupsBody(StepUp):
    groups: list[str] = Field(default_factory=list)
    is_sudo: Optional[bool] = None


class ShellBody(StepUp):
    shell: str = Field(..., max_length=128)


class GrantAccessBody(StepUp):
    username: str
    path: str
    perms: str = Field("rx", max_length=3)
    recursive: bool = False


class RevokeAccessBody(StepUp):
    username: str
    path: str
    recursive: bool = False


# ─── Read (no step-up needed — admin can browse) ──────────────────────────────


@router.get("")
async def list_users(_: AdminUser, include_system: bool = False) -> dict:
    users = await system_user_service.list_users(include_system=include_system)
    return {"users": users}


@router.get("/groups")
async def list_groups(_: AdminUser) -> dict:
    return {"groups": await system_user_service.list_groups()}


@router.get("/shells")
async def shells(_: AdminUser) -> dict:
    return {"shells": await system_user_service.available_shells()}


@router.get("/file-access")
async def get_file_access(path: str, _: AdminUser) -> dict:
    try:
        return await system_user_service.list_file_access(path)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


# ─── Write (step-up required) ─────────────────────────────────────────────────


@router.post("", dependencies=[CsrfVerified])
async def create_user(body: CreateUserBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.create_user(
            body.username, body.password,
            full_name=body.full_name, shell=body.shell,
            create_home=body.create_home, is_sudo=body.is_sudo,
            extra_groups=body.extra_groups,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    await AuditService(db).log("system_user.create", user=current_user, resource=body.username, status_code=200)
    return result


@router.delete("/{username}", dependencies=[CsrfVerified])
async def delete_user(username: str, body: DeleteUserBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.delete_user(username, remove_home=body.remove_home)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    await AuditService(db).log("system_user.delete", user=current_user, resource=username, status_code=200)
    return result


@router.post("/{username}/password", dependencies=[CsrfVerified])
async def set_password(username: str, body: SetPasswordBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.set_password(username, body.password)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    await AuditService(db).log("system_user.password", user=current_user, resource=username, status_code=200)
    return result


@router.post("/{username}/lock", dependencies=[CsrfVerified])
async def set_locked(username: str, body: LockBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.set_locked(username, body.locked)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    await AuditService(db).log("system_user.lock", user=current_user, resource=f"{username}:{body.locked}", status_code=200)
    return result


@router.post("/{username}/groups", dependencies=[CsrfVerified])
async def set_groups(username: str, body: GroupsBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.set_groups(username, body.groups, is_sudo=body.is_sudo)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    await AuditService(db).log("system_user.groups", user=current_user, resource=username, status_code=200)
    return result


@router.post("/{username}/shell", dependencies=[CsrfVerified])
async def set_shell(username: str, body: ShellBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.set_shell(username, body.shell)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    return result


@router.post("/file-access/grant", dependencies=[CsrfVerified])
async def grant_access(body: GrantAccessBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.grant_file_access(
            body.path, body.username, body.perms, recursive=body.recursive,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))
    await AuditService(db).log("system_user.acl.grant", user=current_user, resource=body.path, status_code=200)
    return result


@router.post("/file-access/revoke", dependencies=[CsrfVerified])
async def revoke_access(body: RevokeAccessBody, current_user: AdminUser, db: DBSession) -> dict:
    await _verify_step_up(body, current_user)
    try:
        result = await system_user_service.revoke_file_access(
            body.path, body.username, recursive=body.recursive,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))
    await AuditService(db).log("system_user.acl.revoke", user=current_user, resource=body.path, status_code=200)
    return result
