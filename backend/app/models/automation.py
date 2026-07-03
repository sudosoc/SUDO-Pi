from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class Automation(Base):
    """A trigger → action rule evaluated by the automation loop.

    trigger_type:
      "metric"        → metric {>,<} threshold held for duration_sec
      "service_down"  → systemd service is not active

    action_type:
      "notify"          → record an event the dashboard surfaces
      "restart_service" → systemctl restart <action_target>
      "run_command"     → run <action_target> in a shell
      "reboot"          → shutdown -r
    """

    __tablename__ = "automations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False, default="metric")
    metric: Mapped[str | None] = mapped_column(String(16), nullable=True)      # cpu|ram|disk|temp
    operator: Mapped[str] = mapped_column(String(2), nullable=False, default=">")
    threshold: Mapped[float] = mapped_column(Float, nullable=False, default=90.0)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    service_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    action_type: Mapped[str] = mapped_column(String(32), nullable=False, default="notify")
    action_target: Mapped[str | None] = mapped_column(String(255), nullable=True)

    cooldown_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "enabled": self.enabled,
            "trigger_type": self.trigger_type,
            "metric": self.metric,
            "operator": self.operator,
            "threshold": self.threshold,
            "duration_sec": self.duration_sec,
            "service_name": self.service_name,
            "action_type": self.action_type,
            "action_target": self.action_target,
            "cooldown_sec": self.cooldown_sec,
            "last_triggered_at": self.last_triggered_at.isoformat() if self.last_triggered_at else None,
            "trigger_count": self.trigger_count,
        }


class AutomationEvent(Base):
    __tablename__ = "automation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    automation_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    automation_name: Mapped[str] = mapped_column(String(120), nullable=False)
    fired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    detail: Mapped[str] = mapped_column(String(500), nullable=False)
    action_type: Mapped[str] = mapped_column(String(32), nullable=False)
    action_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "automation_id": self.automation_id,
            "automation_name": self.automation_name,
            "fired_at": self.fired_at.isoformat() if self.fired_at else None,
            "detail": self.detail,
            "action_type": self.action_type,
            "action_result": self.action_result,
            "success": self.success,
        }
