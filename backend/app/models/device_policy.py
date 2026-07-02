from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _utcnow


class DevicePolicy(Base):
    """Per-device network policy for AP clients.

    Bandwidth limits are enforced with tc (HTB egress for download,
    ingress police for upload) and blocking/schedules with iptables.
    A policy row exists only for devices the admin has customized.
    """

    __tablename__ = "device_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    mac: Mapped[str] = mapped_column(String(17), nullable=False, unique=True, index=True)
    # Last-seen hostname/IP snapshots so the UI can label offline devices
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # Bandwidth limits in kbit/s; 0 = unlimited
    download_kbps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    upload_kbps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Hard block (no internet at all times)
    blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Daily internet curfew, e.g. 22:00 → 06:00 (local Pi time)
    schedule_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    block_start: Mapped[str] = mapped_column(String(5), nullable=False, default="22:00")
    block_end: Mapped[str] = mapped_column(String(5), nullable=False, default="06:00")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<DevicePolicy mac={self.mac} blocked={self.blocked} dl={self.download_kbps}>"

    def to_dict(self) -> dict:
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
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
