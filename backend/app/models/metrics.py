from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MetricsSnapshot(Base):
    __tablename__ = "metrics_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    cpu_percent: Mapped[float] = mapped_column(Float, nullable=False)
    ram_percent: Mapped[float] = mapped_column(Float, nullable=False)
    disk_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_cpu: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_rx_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_tx_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        return f"<MetricsSnapshot id={self.id} recorded_at={self.recorded_at}>"
