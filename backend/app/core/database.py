from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, MappedColumn, mapped_column
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import DateTime
from datetime import datetime, timezone

from app.core.config import settings


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()


AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: MappedColumn[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
    )
    updated_at: MappedColumn[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables() -> None:
    from app.models import (  # noqa: F401
        user, audit, network, session as sess, metrics, alerts, uptime, backup,
        os_update, device_policy, automation, known_device, device_bandwidth,
        docker_stats_history,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_apply_lightweight_migrations)


def _apply_lightweight_migrations(conn) -> None:
    """Add columns that create_all() can't add to pre-existing tables (SQLite).

    Idempotent: checks PRAGMA table_info before each ALTER, so it's safe to
    run on every startup — new installs get the column from create_all, older
    databases get it added here.
    """
    from sqlalchemy import text

    def _columns(table: str) -> set[str]:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return {r[1] for r in rows}

    if "allowed_pages" not in _columns("users"):
        conn.execute(text("ALTER TABLE users ADD COLUMN allowed_pages TEXT"))

    # device_policies: per-day curfew + monthly quota columns
    dp_cols = _columns("device_policies")
    if "curfew_schedule" not in dp_cols:
        conn.execute(text("ALTER TABLE device_policies ADD COLUMN curfew_schedule TEXT"))
    if "monthly_quota_mb" not in dp_cols:
        conn.execute(text("ALTER TABLE device_policies ADD COLUMN monthly_quota_mb INTEGER NOT NULL DEFAULT 0"))
    if "quota_reset_day" not in dp_cols:
        conn.execute(text("ALTER TABLE device_policies ADD COLUMN quota_reset_day INTEGER NOT NULL DEFAULT 1"))

    # alerts: new_device metric support — alert_history may lack rule_id NOT NULL
    # (handled by the existing nullable FK on AlertHistory.rule_id)
