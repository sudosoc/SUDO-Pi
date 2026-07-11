from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class DeviceBandwidth(Base):
    """Per-5-minute bandwidth sample for each AP station.

    rx_mb / tx_mb are the *delta* bytes received/transmitted in that interval
    (not cumulative), so they can be summed over any window to get usage.
    monthly_rx_mb / monthly_tx_mb are running month-to-date totals reset on
    quota_reset_day or on the 1st of the month when no quota is configured.
    """

    __tablename__ = "device_bandwidth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mac: Mapped[str] = mapped_column(String(17), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    # Interval deltas (MB per collection interval, typically 5 min)
    rx_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tx_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Running month-to-date totals (updated in place every sample)
    monthly_rx_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    monthly_tx_mb: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "mac": self.mac,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "rx_mb": round(self.rx_mb, 3),
            "tx_mb": round(self.tx_mb, 3),
            "monthly_rx_mb": round(self.monthly_rx_mb, 3),
            "monthly_tx_mb": round(self.monthly_tx_mb, 3),
        }
