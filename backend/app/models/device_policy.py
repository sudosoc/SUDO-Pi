from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class DevicePolicy(Base):
    """Per-device network policy for AP clients.

    Bandwidth limits are enforced with tc (HTB egress for download,
    ingress police for upload) and blocking/schedules with iptables.
    A policy row exists only for devices the admin has customized.

    Curfew can be expressed in two ways (mutually exclusive; curfew_schedule
    takes priority when it is not NULL):
      - Simple daily:  schedule_enabled + block_start + block_end  (same window every day)
      - Per-day grid:  curfew_schedule JSON — [{days:[0,1,2], start:"22:00", end:"06:00"}, …]
                       days use Python weekday() numbering: 0=Mon … 6=Sun

    Quota:
      - monthly_quota_mb = 0  →  no limit
      - monthly_quota_mb > 0  →  block device when (monthly_rx_mb + monthly_tx_mb) exceeds limit
      - quota_reset_day:  day of month (1–28) on which usage counters reset
    """

    __tablename__ = "device_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    mac: Mapped[str] = mapped_column(String(17), nullable=False, unique=True, index=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # Bandwidth limits in kbit/s; 0 = unlimited
    download_kbps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    upload_kbps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Hard block (no internet at all times)
    blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Simple daily curfew (overridden by curfew_schedule when set)
    schedule_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    block_start: Mapped[str] = mapped_column(String(5), nullable=False, default="22:00")
    block_end: Mapped[str] = mapped_column(String(5), nullable=False, default="06:00")

    # Per-day curfew schedule JSON (overrides simple schedule when not NULL)
    # Format: '[{"days":[0,1,2,3,4],"start":"22:00","end":"06:00"},{"days":[5,6],"start":"23:00","end":"07:00"}]'
    curfew_schedule: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Monthly data quota
    monthly_quota_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quota_reset_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<DevicePolicy mac={self.mac} blocked={self.blocked} dl={self.download_kbps}>"

    def to_dict(self) -> dict:
        import json as _json
        return {
            "id": self.id,
            "mac": self.mac,
            "hostname": self.hostname,
            "last_ip": self.last_ip,
            "download_kbps": self.download_kbps,
            "upload_kbps": self.upload_kbps,
            "blocked": self.blocked,
            "schedule_enabled": self.schedule_enabled,
            "block_start": self.block_start,
            "block_end": self.block_end,
            "curfew_schedule": _json.loads(self.curfew_schedule) if self.curfew_schedule else None,
            "monthly_quota_mb": self.monthly_quota_mb,
            "quota_reset_day": self.quota_reset_day,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
