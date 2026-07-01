from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Request
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_csrf_token,
    hash_password,
    verify_password,
    verify_access_token,
    verify_refresh_token,
)
from app.core.config import settings
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.repositories.session_repository import SessionRepository
from app.schemas.auth import AuthResponse, UserInfoResponse


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 401) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.session_repo = SessionRepository(db)

    async def authenticate(self, username: str, password: str, ip_address: str | None = None) -> tuple[User, str, str, str]:
        user = await self.user_repo.get_by_username(username)
        if user is None:
            raise AuthError("Invalid credentials")

        if not user.is_active:
            raise AuthError("Account is disabled", 403)

        now = datetime.now(timezone.utc)
        if user.locked_until and user.locked_until > now:
            remaining = int((user.locked_until - now).total_seconds())
            raise AuthError(f"Account locked. Try again in {remaining} seconds.", 429)

        if not verify_password(password, user.hashed_password):
            await self.user_repo.increment_failed_login(user)
            if user.failed_login_count + 1 >= LOCKOUT_THRESHOLD:
                lock_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                await self.user_repo.lock_user(user, lock_until)
                logger.warning("User {} locked after {} failed attempts", username, LOCKOUT_THRESHOLD)
                raise AuthError(f"Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes.", 429)
            raise AuthError("Invalid credentials")

        await self.user_repo.update_login_success(user, ip_address)

        access_token = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role.value, "username": user.username},
        )
        refresh_token, jti, expires_at = create_refresh_token(subject=user.id)
        csrf_token = generate_csrf_token()

        await self.session_repo.create(
            jti=jti,
            user_id=user.id,
            created_at=now,
            expires_at=expires_at,
            ip_address=ip_address,
        )

        logger.info("User {} authenticated from {}", username, ip_address)
        return user, access_token, refresh_token, csrf_token

    async def refresh_tokens(self, refresh_token: str, ip_address: str | None = None) -> tuple[str, str, str]:
        payload = verify_refresh_token(refresh_token)
        if payload is None:
            raise AuthError("Invalid refresh token")

        jti = payload.get("jti")
        user_id = payload.get("sub")

        if await self.session_repo.is_jti_revoked(jti):
            raise AuthError("Refresh token has been revoked")

        user = await self.user_repo.get_by_id(int(user_id))
        if user is None or not user.is_active:
            raise AuthError("User not found or inactive")

        await self.session_repo.revoke_token(jti)

        new_access = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role.value, "username": user.username},
        )
        new_refresh, new_jti, expires_at = create_refresh_token(subject=user.id)
        csrf_token = generate_csrf_token()

        now = datetime.now(timezone.utc)
        await self.session_repo.create(
            jti=new_jti,
            user_id=user.id,
            created_at=now,
            expires_at=expires_at,
            ip_address=ip_address,
        )

        return new_access, new_refresh, csrf_token

    async def logout(self, refresh_token: str) -> None:
        payload = verify_refresh_token(refresh_token)
        if payload:
            jti = payload.get("jti")
            if jti:
                await self.session_repo.revoke_token(jti)

    async def logout_all(self, user_id: int) -> None:
        await self.session_repo.revoke_all_user_tokens(user_id)

    async def change_password(self, user: User, current_password: str, new_password: str) -> None:
        if not verify_password(current_password, user.hashed_password):
            raise AuthError("Current password is incorrect", 400)
        new_hash = hash_password(new_password)
        await self.user_repo.update(user, hashed_password=new_hash)
        await self.session_repo.revoke_all_user_tokens(user.id)
        logger.info("Password changed for user {}", user.username)

    async def ensure_admin_exists(self) -> None:
        admin = await self.user_repo.get_by_username(settings.ADMIN_USERNAME)
        if admin is None:
            hashed = hash_password(settings.ADMIN_PASSWORD)
            await self.user_repo.create(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hashed,
                role=UserRole.ADMIN,
                is_active=True,
                is_system=True,
            )
            logger.info("Default admin user created")
