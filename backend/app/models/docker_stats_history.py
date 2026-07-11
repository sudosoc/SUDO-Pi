from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class DockerStatsHistory(Base):
    """30-second snapshots of Docker container resource usage.

    Rows are pruned to the last 24 hours on every collection cycle
    so the table stays bounded without manual maintenance.
    """

    __tablename__ = "docker_stats_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    container_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    container_name: Mapped[str] = mapped_column(String(255), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    cpu_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mem_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mem_limit_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_rx_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_tx_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    def to_dict(self) -> dict:
        return {
            "container_id": self.container_id[:12],
            "container_name": self.container_name,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "cpu_percent": round(self.cpu_percent, 2),
            "mem_mb": round(self.mem_mb, 1),
            "mem_limit_mb": round(self.mem_limit_mb, 1),
            "net_rx_mb": round(self.net_rx_mb, 3),
            "net_tx_mb": round(self.net_tx_mb, 3),
        }
