from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UptimeRecord(Base):
    __tablename__ = "uptime_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    service_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # "up" / "down" / "failed"
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<UptimeRecord id={self.id} service={self.service_name} status={self.status}>"


class UptimeSummary(Base):
    __tablename__ = "uptime_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    service_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(8), nullable=False)  # "24h", "7d", "30d"
    uptime_pct: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    checks_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checks_up: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_down_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<UptimeSummary service={self.service_name} period={self.period} pct={self.uptime_pct}>"
