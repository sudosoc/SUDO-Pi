from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class NetworkProfileSecurity(str, enum.Enum):
    OPEN = "open"
    WPA2 = "wpa2"
    WPA3 = "wpa3"
    WPA2_WPA3 = "wpa2_wpa3"


class WifiProfile(Base, TimestampMixin):
    __tablename__ = "wifi_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ssid: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    password: Mapped[str | None] = mapped_column(Text, nullable=True)
    security: Mapped[NetworkProfileSecurity] = mapped_column(
        Enum(NetworkProfileSecurity, values_callable=lambda x: [e.value for e in x]),
        default=NetworkProfileSecurity.WPA2,
        nullable=False,
    )
    is_saved: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    use_dhcp: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    static_ip: Mapped[str | None] = mapped_column(String(15), nullable=True)
    static_gateway: Mapped[str | None] = mapped_column(String(15), nullable=True)
    static_dns: Mapped[str | None] = mapped_column(String(64), nullable=True)
    static_prefix: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<WifiProfile id={self.id} ssid={self.ssid}>"


class ApConfig(Base, TimestampMixin):
    __tablename__ = "ap_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ssid: Mapped[str] = mapped_column(String(64), nullable=False)
    password: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), default="EG", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    hide_ssid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_clients: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    band: Mapped[str] = mapped_column(String(8), default="2.4GHz", nullable=False)

    def __repr__(self) -> str:
        return f"<ApConfig id={self.id} ssid={self.ssid}>"
