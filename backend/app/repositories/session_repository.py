from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import RefreshToken
from app.repositories.base import BaseRepository


class SessionRepository(BaseRepository[RefreshToken]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(RefreshToken, db)

    async def get_by_jti(self, jti: str) -> RefreshToken | None:
        result = await self.db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
        return result.scalar_one_or_none()

    async def is_jti_revoked(self, jti: str) -> bool:
        token = await self.get_by_jti(jti)
        if token is None:
            return True
        return token.is_revoked

    async def revoke_token(self, jti: str) -> None:
        await self.db.execute(
            update(RefreshToken).where(RefreshToken.jti == jti).values(is_revoked=True)
        )
        await self.db.flush()

    async def revoke_all_user_tokens(self, user_id: int) -> None:
        await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked == False)
            .values(is_revoked=True)
        )
        await self.db.flush()

    async def cleanup_expired(self) -> int:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.expires_at < now)
        )
        tokens = result.scalars().all()
        for token in tokens:
            await self.db.delete(token)
        await self.db.flush()
        return len(tokens)

    async def get_active_sessions(self, user_id: int) -> list[RefreshToken]:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.is_revoked == False,
                RefreshToken.expires_at > now,
            )
        )
        return list(result.scalars().all())

    async def get_all_active_sessions(self) -> list[RefreshToken]:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.is_revoked == False,
                RefreshToken.expires_at > now,
            ).order_by(RefreshToken.created_at.desc())
        )
        return list(result.scalars().all())
