import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.core.dependencies import AdminUser, CsrfVerified
from app.services import ssh_service

router = APIRouter(prefix="/ssh", tags=["ssh"])

_ALLOWED_SSH_KEYS = {
    "Port",
    "PasswordAuthentication",
    "PubkeyAuthentication",
    "PermitRootLogin",
    "MaxAuthTries",
    "LoginGraceTime",
    "AllowUsers",
    "DenyUsers",
    "Protocol",
    "X11Forwarding",
    "UsePAM",
}

_VALID_USERS_RE = re.compile(r"^[a-z_][a-z0-9_\-]{0,31}$")


class UpdateConfigRequest(BaseModel):
    key: str
    value: str

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if v not in _ALLOWED_SSH_KEYS:
            raise ValueError(f"Key {v!r} is not allowed")
        return v

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Value must not be empty")
        return v


class AddKeyRequest(BaseModel):
    key: str

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Key must not be empty")
        return v


class GenerateKeyRequest(BaseModel):
    key_type: str = "ed25519"
    comment: str = "sudo-pi-generated"

    @field_validator("key_type")
    @classmethod
    def validate_key_type(cls, v: str) -> str:
        if v not in ("ed25519", "rsa", "ecdsa"):
            raise ValueError("key_type must be ed25519, rsa, or ecdsa")
        return v

    @field_validator("comment")
    @classmethod
    def validate_comment(cls, v: str) -> str:
        # Strip any shell-unsafe characters
        return re.sub(r"[^\w\-@\. ]", "", v)[:64]


def _validate_user(user: str) -> str:
    if not _VALID_USERS_RE.match(user):
        raise HTTPException(400, "Invalid username")
    return user


@router.get("/config")
async def get_config(_: AdminUser = None):
    return await ssh_service.get_ssh_config()


@router.put("/config", dependencies=[CsrfVerified])
async def update_config(body: UpdateConfigRequest, _: AdminUser = None):
    try:
        ok = await ssh_service.update_ssh_config(body.key, body.value)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not ok:
        raise HTTPException(500, "Failed to update SSH config")
    return {"ok": True}


@router.get("/keys/{user}")
async def get_keys(user: str, _: AdminUser = None):
    _validate_user(user)
    return await ssh_service.get_authorized_keys(user)


@router.post("/keys/{user}", dependencies=[CsrfVerified])
async def add_key(user: str, body: AddKeyRequest, _: AdminUser = None):
    _validate_user(user)
    try:
        ok = await ssh_service.add_authorized_key(user, body.key)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not ok:
        raise HTTPException(500, "Failed to add key")
    return {"ok": True}


@router.delete("/keys/{user}/{key_index}", dependencies=[CsrfVerified])
async def delete_key(user: str, key_index: int, _: AdminUser = None):
    _validate_user(user)
    if key_index < 0:
        raise HTTPException(400, "Invalid key index")
    ok = await ssh_service.delete_authorized_key(user, key_index)
    if not ok:
        raise HTTPException(404, "Key not found")
    return {"ok": True}


@router.post("/generate", dependencies=[CsrfVerified])
async def generate_keys(body: GenerateKeyRequest, _: AdminUser = None):
    try:
        result = await ssh_service.generate_key_pair(body.key_type, body.comment)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))
    return result


@router.get("/sessions")
async def get_sessions(_: AdminUser = None):
    return await ssh_service.get_active_ssh_sessions()


@router.get("/status")
async def get_status(_: AdminUser = None):
    return await ssh_service.get_ssh_service_status()


@router.post("/restart", dependencies=[CsrfVerified])
async def restart_ssh(_: AdminUser = None):
    ok = await ssh_service.restart_ssh_service()
    if not ok:
        raise HTTPException(500, "Failed to restart SSH service")
    return {"ok": True}
