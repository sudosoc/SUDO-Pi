from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)

CSRF_COOKIE_NAME = "csrf_token"
ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def _truncate_for_bcrypt(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) <= 72:
        return password
    return encoded[:72].decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    return pwd_context.hash(_truncate_for_bcrypt(password))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_truncate_for_bcrypt(plain), hashed)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(subject: str | int, extra_claims: dict[str, Any] | None = None) -> str:
    now = _utcnow()
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
        "type": TOKEN_TYPE_ACCESS,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str | int) -> tuple[str, str, datetime]:
    now = _utcnow()
    jti = str(uuid.uuid4())
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now,
        "exp": expires_at,
        "jti": jti,
        "type": TOKEN_TYPE_REFRESH,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti, expires_at


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def verify_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = decode_token(token)
        if payload.get("type") != TOKEN_TYPE_ACCESS:
            return None
        return payload
    except JWTError:
        return None


def verify_refresh_token(token: str) -> dict[str, Any] | None:
    try:
        payload = decode_token(token)
        if payload.get("type") != TOKEN_TYPE_REFRESH:
            return None
        return payload
    except JWTError:
        return None


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_auth_cookies(
    response: Any,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
    *,
    secure: bool = True,
) -> None:
    cookie_opts: dict[str, Any] = {
        "httponly": True,
        "secure": secure,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(ACCESS_COOKIE_NAME, access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **cookie_opts)
    response.set_cookie(REFRESH_COOKIE_NAME, refresh_token, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **cookie_opts)
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Any, *, secure: bool = True) -> None:
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, CSRF_COOKIE_NAME):
        response.delete_cookie(name, path="/", secure=secure, httponly=name != CSRF_COOKIE_NAME, samesite="lax")
