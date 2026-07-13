from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "SUDO-Pi"
    APP_VERSION: str = "1.0.0"
    APP_ENV: Literal["development", "production"] = "production"
    DEBUG: bool = False

    SECRET_KEY: str = secrets.token_urlsafe(64)
    RSA_PRIVATE_KEY_PATH: Path = BASE_DIR / "keys" / "private.pem"
    RSA_PUBLIC_KEY_PATH: Path = BASE_DIR / "keys" / "public.pem"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/sudo_pi.db"

    CORS_ORIGINS: list[str] = [
        "https://sudo.local",
        "https://sudo-pi.local",
        "https://192.168.4.1",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    AP_INTERFACE: str = "wlan0"
    AP_IP: str = "192.168.4.1"
    AP_SUBNET: str = "192.168.4.0/24"
    AP_DHCP_START: str = "192.168.4.100"
    AP_DHCP_END: str = "192.168.4.200"
    AP_DEFAULT_SSID: str = "SUDO-Pi"
    AP_DEFAULT_PASSWORD: str = "sudopi2024"
    AP_CHANNEL: int = 6
    AP_COUNTRY_CODE: str = "EG"

    INET_INTERFACE: str = "wlan1"

    HOSTAPD_CONF_PATH: Path = Path("/etc/hostapd/hostapd.conf")
    DNSMASQ_CONF_PATH: Path = Path("/etc/dnsmasq.conf")

    LOG_LEVEL: str = "INFO"
    LOG_DIR: Path = BASE_DIR / "logs"
    LOG_ROTATION: str = "10 MB"
    LOG_RETENTION: str = "30 days"

    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_API: str = "200/minute"

    MAX_UPLOAD_SIZE_MB: int = 100
    ALLOWED_UPLOAD_EXTENSIONS: set[str] = set()

    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"
    ADMIN_EMAIL: str = "admin@pi.local"

    NGINX_CERT_PATH: Path = Path("/etc/nginx/ssl/sudo-pi.crt")
    NGINX_KEY_PATH: Path = Path("/etc/nginx/ssl/sudo-pi.key")

    SYSTEM_METRICS_INTERVAL: float = 2.0
    WS_HEARTBEAT_INTERVAL: float = 30.0
    WS_HEARTBEAT_TIMEOUT: float = 60.0

    @field_validator("LOG_DIR", "RSA_PRIVATE_KEY_PATH", "RSA_PUBLIC_KEY_PATH", mode="before")
    @classmethod
    def ensure_path(cls, v: str | Path) -> Path:
        return Path(v)

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def database_sync_url(self) -> str:
        return self.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
