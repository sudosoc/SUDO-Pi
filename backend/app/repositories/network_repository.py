from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import ApConfig, WifiProfile
from app.repositories.base import BaseRepository


class WifiProfileRepository(BaseRepository[WifiProfile]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(WifiProfile, db)

    async def get_by_ssid(self, ssid: str) -> WifiProfile | None:
        result = await self.db.execute(select(WifiProfile).where(WifiProfile.ssid == ssid))
        return result.scalar_one_or_none()

    async def get_saved_profiles(self) -> list[WifiProfile]:
        result = await self.db.execute(
            select(WifiProfile).where(WifiProfile.is_saved == True).order_by(WifiProfile.priority.desc())
        )
        return list(result.scalars().all())

    async def get_active_profile(self) -> WifiProfile | None:
        result = await self.db.execute(select(WifiProfile).where(WifiProfile.is_active == True))
        return result.scalar_one_or_none()

    async def deactivate_all(self) -> None:
        profiles = await self.get_saved_profiles()
        for p in profiles:
            p.is_active = False
            self.db.add(p)
        await self.db.flush()


class ApConfigRepository(BaseRepository[ApConfig]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(ApConfig, db)

    async def get_current(self) -> ApConfig | None:
        result = await self.db.execute(select(ApConfig).limit(1))
        return result.scalar_one_or_none()
