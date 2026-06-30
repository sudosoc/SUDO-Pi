from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(User, db)

    async def get_by_username(self, username: str) -> User | None:
        result = await self.db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_active_users(self, *, skip: int = 0, limit: int = 100) -> list[User]:
        result = await self.db.execute(
            select(User).where(User.is_active == True).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def username_exists(self, username: str) -> bool:
        result = await self.db.execute(select(User.id).where(User.username == username))
        return result.scalar_one_or_none() is not None

    async def email_exists(self, email: str) -> bool:
        result = await self.db.execute(select(User.id).where(User.email == email))
        return result.scalar_one_or_none() is not None

    async def update_login_success(self, user: User, ip_address: str | None) -> User:
        return await self.update(
            user,
            last_login_at=datetime.utcnow(),
            last_login_ip=ip_address,
            failed_login_count=0,
            locked_until=None,
        )

    async def increment_failed_login(self, user: User) -> User:
        return await self.update(user, failed_login_count=user.failed_login_count + 1)

    async def lock_user(self, user: User, until: datetime) -> User:
        return await self.update(user, locked_until=until)
