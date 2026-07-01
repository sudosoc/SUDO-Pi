from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class AlertRule(Base, TimestampMixin):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    metric: Mapped[str] = mapped_column(String(32), nullable=False)
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    service_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    channel_config: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<AlertRule id={self.id} name={self.name} metric={self.metric}>"


class AlertHistory(Base):
    __tablename__ = "alert_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rule_name: Mapped[str] = mapped_column(Text, nullable=False)
    metric: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return f"<AlertHistory id={self.id} rule_name={self.rule_name} sent_at={self.sent_at}>"
