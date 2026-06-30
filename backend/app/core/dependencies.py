from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionFactory
from app.core.security import (
    CSRF_COOKIE_NAME,
    ACCESS_COOKIE_NAME,
    verify_access_token,
)
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository
from app.repositories.session_repository import SessionRepository


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user_payload(
    request: Request,
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE_NAME)] = None,
) -> dict:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = access_token
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        raise credentials_exc

    payload = verify_access_token(token)
    if payload is None:
        raise credentials_exc

    return payload


async def get_current_user(
    payload: Annotated[dict, Depends(get_current_user_payload)],
    db: DBSession,
):
    from app.models.user import User

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    repo = UserRepository(db)
    user = await repo.get_by_id(int(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


CurrentUser = Annotated[object, Depends(get_current_user)]


async def get_current_active_user(current_user: CurrentUser):
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return current_user


ActiveUser = Annotated[object, Depends(get_current_active_user)]


async def require_admin(current_user: ActiveUser):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


AdminUser = Annotated[object, Depends(require_admin)]


async def require_operator(current_user: ActiveUser):
    if current_user.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator access required")
    return current_user


OperatorUser = Annotated[object, Depends(require_operator)]


async def verify_csrf(
    request: Request,
    csrf_token_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE_NAME)] = None,
    x_csrf_token: Annotated[str | None, Header(alias="x-csrf-token")] = None,
) -> None:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    if not csrf_token_cookie or not x_csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token missing")
    if csrf_token_cookie != x_csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token mismatch")


CsrfVerified = Annotated[None, Depends(verify_csrf)]
