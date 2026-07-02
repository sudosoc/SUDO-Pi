from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class UpdateTrigger(str, enum.Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    ROLLBACK = "rollback"


class UpdateRunStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class UpdateRun(Base):
    __tablename__ = "update_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trigger: Mapped[UpdateTrigger] = mapped_column(
        SAEnum(UpdateTrigger, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=UpdateTrigger.MANUAL,
    )
    status: Mapped[UpdateRunStatus] = mapped_column(
        SAEnum(UpdateRunStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=UpdateRunStatus.RUNNING,
    )
    # JSON list of {name, old_version, new_version}
    packages_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Tail-capped apt output
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<UpdateRun id={self.id} trigger={self.trigger} status={self.status}>"

    def to_dict(self) -> dict:
        import json

        try:
            packages = json.loads(self.packages_json) if self.packages_json else []
        except Exception:
            packages = []
        return {
            "id": self.id,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "trigger": self.trigger.value,
            "status": self.status.value,
            "packages": packages,
            "output": self.output,
            "error": self.error,
        }


class UpdateSchedule(Base):
    __tablename__ = "update_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    run_time: Mapped[str] = mapped_column(String(8), nullable=False, default="04:00")
    # "daily" or csv of day abbreviations e.g. "mon,wed,fri"
    days: Mapped[str] = mapped_column(String(64), nullable=False, default="daily")
    security_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auto_reboot_if_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<UpdateSchedule id={self.id} enabled={self.enabled} time={self.run_time}>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "enabled": self.enabled,
            "run_time": self.run_time,
            "days": self.days,
            "security_only": self.security_only,
            "auto_reboot_if_required": self.auto_reboot_if_required,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
        }
