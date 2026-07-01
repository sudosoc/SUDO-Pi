from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, IPvAnyAddress

from app.models.network import NetworkProfileSecurity


class ApConfigUpdate(BaseModel):
    ssid: str = Field(..., min_length=1, max_length=32)
    # None means "keep the existing password unchanged"
    password: str | None = Field(None, min_length=8, max_length=63)
    channel: int = Field(6, ge=1, le=13)
    country_code: str = Field("EG", min_length=2, max_length=2)
    hide_ssid: bool = False
    max_clients: int = Field(20, ge=1, le=255)


class ApConfigResponse(BaseModel):
    ssid: str
    channel: int
    country_code: str
    hide_ssid: bool
    max_clients: int
    is_active: bool
    band: str
    ip_address: str
    subnet: str

    model_config = {"from_attributes": True}


class ApClientInfo(BaseModel):
    mac_address: str
    ip_address: str | None
    hostname: str | None
    signal_dbm: int | None
    connected_since: str | None


class ApStatusResponse(BaseModel):
    is_running: bool
    interface: str
    ip_address: str
    config: ApConfigResponse
    clients: list[ApClientInfo]
    client_count: int


class WifiScanResult(BaseModel):
    ssid: str
    bssid: str
    signal_dbm: int
    signal_percent: int
    frequency_mhz: int
    channel: int
    security: str
    is_connected: bool
    is_saved: bool


class WifiConnectRequest(BaseModel):
    ssid: str = Field(..., min_length=1, max_length=32)
    password: str | None = Field(None, max_length=63)
    security: NetworkProfileSecurity = NetworkProfileSecurity.WPA2
    use_dhcp: bool = True
    static_ip: str | None = None
    static_gateway: str | None = None
    static_dns: str | None = None
    static_prefix: int | None = Field(None, ge=8, le=30)
    save: bool = True
    priority: int = Field(0, ge=0, le=100)


class WifiProfileResponse(BaseModel):
    id: int
    ssid: str
    security: NetworkProfileSecurity
    is_active: bool
    priority: int
    use_dhcp: bool
    static_ip: str | None
    last_connected_at: datetime | None

    model_config = {"from_attributes": True}


class WifiStatusResponse(BaseModel):
    is_connected: bool
    interface: str
    ssid: str | None
    bssid: str | None
    signal_dbm: int | None
    signal_percent: int | None
    ip_address: str | None
    gateway: str | None
    dns: list[str]
    speed_mbps: int | None
    rx_bytes: int
    tx_bytes: int
    uptime_seconds: float | None


class WifiPriorityUpdate(BaseModel):
    priority: int = Field(..., ge=0, le=100)
