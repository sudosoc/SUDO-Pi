from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserUpdate


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = UserRepository(db)

    async def create_user(self, data: UserCreate) -> User:
        if await self.repo.username_exists(data.username):
            raise ValueError(f"Username '{data.username}' is already taken")
        if await self.repo.email_exists(data.email):
            raise ValueError(f"Email '{data.email}' is already registered")
        return await self.repo.create(
            username=data.username,
            email=data.email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
            role=data.role,
            is_active=True,
        )

    async def update_user(self, user_id: int, data: UserUpdate) -> User:
        user = await self.repo.get_by_id(user_id)
        if user is None:
            raise ValueError("User not found")
        if user.is_system and data.role is not None and data.role != UserRole.ADMIN:
            raise ValueError("Cannot change system admin role")
        update_kwargs = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        return await self.repo.update(user, **update_kwargs)

    async def delete_user(self, user_id: int, requesting_user: User) -> None:
        user = await self.repo.get_by_id(user_id)
        if user is None:
            raise ValueError("User not found")
        if user.is_system:
            raise ValueError("Cannot delete system user")
        if user.id == requesting_user.id:
            raise ValueError("Cannot delete yourself")
        await self.repo.delete(user)

    async def get_user(self, user_id: int) -> User:
        user = await self.repo.get_by_id(user_id)
        if user is None:
            raise ValueError("User not found")
        return user

    async def list_users(self, skip: int = 0, limit: int = 100) -> tuple[list[User], int]:
        users = await self.repo.get_all(skip=skip, limit=limit)
        total = await self.repo.count()
        return users, total
