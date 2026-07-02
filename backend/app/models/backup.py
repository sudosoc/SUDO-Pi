from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum as SAEnum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class BackupType(str, enum.Enum):
    SYSTEM = "system"
    CONFIG = "config"
    SD_IMAGE = "sd_image"


class BackupStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    backup_type: Mapped[BackupType] = mapped_column(
        SAEnum(BackupType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    status: Mapped[BackupStatus] = mapped_column(
        SAEnum(BackupStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=BackupStatus.PENDING,
    )
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    cloud_synced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cloud_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<BackupRecord id={self.id} name={self.name} status={self.status}>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "backup_type": self.backup_type.value,
            "status": self.status.value,
            "size_bytes": self.size_bytes,
            "path": self.path,
            "checksum": self.checksum,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
            "cloud_synced": self.cloud_synced,
            "cloud_synced_at": self.cloud_synced_at.isoformat() if self.cloud_synced_at else None,
        }


class BackupSchedule(Base):
    __tablename__ = "backup_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    backup_type: Mapped[BackupType] = mapped_column(
        SAEnum(BackupType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        unique=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cron_expression: Mapped[str] = mapped_column(String(64), nullable=False, default="0 2 * * *")
    keep_count: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    destination: Mapped[str] = mapped_column(String(32), nullable=False, default="local")
    rclone_remote: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<BackupSchedule id={self.id} type={self.backup_type} enabled={self.enabled}>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "backup_type": self.backup_type.value,
            "enabled": self.enabled,
            "cron_expression": self.cron_expression,
            "keep_count": self.keep_count,
            "destination": self.destination,
            "rclone_remote": self.rclone_remote,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
        }
