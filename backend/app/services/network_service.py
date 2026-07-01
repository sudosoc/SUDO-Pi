from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.network import ApConfig, NetworkProfileSecurity, WifiProfile
from app.repositories.network_repository import ApConfigRepository, WifiProfileRepository
from app.schemas.network import (
    ApClientInfo,
    ApConfigResponse,
    ApStatusResponse,
    WifiConnectRequest,
    WifiScanResult,
    WifiStatusResponse,
)


async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "Command timed out"
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


def _dbm_to_percent(dbm: int) -> int:
    if dbm <= -100:
        return 0
    if dbm >= -50:
        return 100
    return 2 * (dbm + 100)


async def scan_wifi(interface: str = None) -> list[WifiScanResult]:
    iface = interface or settings.INET_INTERFACE
    code, out, err = await _run(
        ["sudo", "nmcli", "-t", "-f", "SSID,BSSID,SIGNAL,FREQ,SECURITY", "dev", "wifi", "list", "ifname", iface],
        timeout=15.0,
    )
    if code != 0:
        logger.warning("nmcli wifi scan failed: {}", err)
        return []

    results: list[WifiScanResult] = []
    seen_ssids: set[str] = set()

    for line in out.strip().splitlines():
        parts = line.split(":")
        if len(parts) < 5:
            continue
        ssid = parts[0].strip()
        bssid = ":".join(parts[1:7]) if len(parts) >= 7 else parts[1]
        try:
            signal = int(parts[-4]) if len(parts) >= 5 else 0
        except ValueError:
            signal = 0
        freq_str = parts[-3] if len(parts) >= 5 else "2437"
        security = parts[-1].strip() if parts[-1].strip() else "OPEN"

        try:
            freq_mhz = int(re.sub(r"[^\d]", "", freq_str))
        except ValueError:
            freq_mhz = 2437

        channel = max(1, (freq_mhz - 2407) // 5) if freq_mhz < 5000 else max(36, (freq_mhz - 5000) // 5)
        dbm = signal - 110 if signal > 0 else -90
        percent = _dbm_to_percent(dbm)

        if not ssid or ssid in seen_ssids:
            continue
        seen_ssids.add(ssid)

        results.append(
            WifiScanResult(
                ssid=ssid,
                bssid=bssid,
                signal_dbm=dbm,
                signal_percent=percent,
                frequency_mhz=freq_mhz,
                channel=channel,
                security=security,
                is_connected=False,
                is_saved=False,
            )
        )

    results.sort(key=lambda r: r.signal_dbm, reverse=True)
    return results


async def get_wifi_status(interface: str = None) -> WifiStatusResponse:
    iface = interface or settings.INET_INTERFACE
    code, out, err = await _run(
        ["nmcli", "-t", "-f", "GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS,IP4.GATEWAY,IP4.DNS,WIFI-PROPERTIES.SIGNAL",
         "dev", "show", iface],
    )

    data: dict[str, str] = {}
    for line in out.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            data[k.strip()] = v.strip()

    is_connected = "connected" in data.get("GENERAL.STATE", "").lower()
    ssid: str | None = None

    if is_connected:
        code2, out2, _ = await _run(
            ["nmcli", "-t", "-f", "active,ssid,bssid,signal,rate", "dev", "wifi", "list", "ifname", iface]
        )
        for line2 in out2.splitlines():
            if line2.startswith("yes:") or line2.startswith("*"):
                parts2 = line2.lstrip("*yes:").split(":")
                if parts2:
                    ssid = parts2[0].strip()
                break

    ip = data.get("IP4.ADDRESS[1]", "").split("/")[0] or None
    gateway = data.get("IP4.GATEWAY") or None
    dns_raw = data.get("IP4.DNS[1]", "")
    dns = [dns_raw] if dns_raw else []

    code3, out3, _ = await _run(["cat", "/sys/class/net/" + iface + "/statistics/rx_bytes"])
    code4, out4, _ = await _run(["cat", "/sys/class/net/" + iface + "/statistics/tx_bytes"])

    try:
        rx = int(out3.strip())
    except ValueError:
        rx = 0
    try:
        tx = int(out4.strip())
    except ValueError:
        tx = 0

    try:
        signal_val = int(data.get("WIFI-PROPERTIES.SIGNAL", "0") or 0)
    except ValueError:
        signal_val = 0
    dbm = signal_val - 110 if signal_val > 0 else None
    percent = _dbm_to_percent(dbm) if dbm is not None else None

    return WifiStatusResponse(
        is_connected=is_connected,
        interface=iface,
        ssid=ssid,
        bssid=None,
        signal_dbm=dbm,
        signal_percent=percent,
        ip_address=ip,
        gateway=gateway,
        dns=dns,
        speed_mbps=None,
        rx_bytes=rx,
        tx_bytes=tx,
        uptime_seconds=None,
    )


async def connect_wifi(request: WifiConnectRequest, db: AsyncSession) -> bool:
    iface = settings.INET_INTERFACE
    cmd = ["sudo", "nmcli", "dev", "wifi", "connect", request.ssid, "ifname", iface]

    if request.password:
        cmd += ["password", request.password]

    code, out, err = await _run(cmd, timeout=30.0)
    if code != 0:
        logger.error("WiFi connect failed: {}", err)
        return False

    if request.save:
        repo = WifiProfileRepository(db)
        existing = await repo.get_by_ssid(request.ssid)
        await repo.deactivate_all()
        if existing:
            await repo.update(
                existing,
                is_active=True,
                priority=request.priority,
                last_connected_at=datetime.now(timezone.utc),
            )
        else:
            await repo.create(
                ssid=request.ssid,
                password=request.password,
                security=request.security,
                is_saved=True,
                is_active=True,
                priority=request.priority,
                use_dhcp=request.use_dhcp,
                static_ip=request.static_ip,
                static_gateway=request.static_gateway,
                static_dns=request.static_dns,
                static_prefix=request.static_prefix,
                last_connected_at=datetime.now(timezone.utc),
            )

    logger.info("Connected to WiFi network: {}", request.ssid)
    return True


async def disconnect_wifi() -> bool:
    iface = settings.INET_INTERFACE
    code, _, err = await _run(["sudo", "nmcli", "dev", "disconnect", iface])
    if code != 0:
        logger.error("WiFi disconnect failed: {}", err)
        return False
    return True


async def get_ap_clients() -> list[ApClientInfo]:
    clients: list[ApClientInfo] = []
    try:
        code, out, _ = await _run(["sudo", "cat", "/var/lib/misc/dnsmasq.leases"], timeout=5.0)
        if code == 0:
            for line in out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 4:
                    clients.append(
                        ApClientInfo(
                            mac_address=parts[1],
                            ip_address=parts[2],
                            hostname=parts[3] if parts[3] != "*" else None,
                            signal_dbm=None,
                            connected_since=None,
                        )
                    )
    except Exception as exc:
        logger.debug("Could not read dnsmasq leases: {}", exc)

    if not clients:
        try:
            code2, out2, _ = await _run(
                ["sudo", "iw", "dev", settings.AP_INTERFACE, "station", "dump"],
                timeout=5.0,
            )
            if code2 == 0:
                current_mac: str | None = None
                current_signal: int | None = None
                for line in out2.splitlines():
                    line = line.strip()
                    m = re.match(r"Station\s+([0-9a-f:]{17})", line, re.IGNORECASE)
                    if m:
                        current_mac = m.group(1)
                        current_signal = None
                    elif current_mac and "signal:" in line.lower():
                        sig_match = re.search(r"-?\d+", line)
                        if sig_match:
                            current_signal = int(sig_match.group())
                        clients.append(
                            ApClientInfo(
                                mac_address=current_mac,
                                ip_address=None,
                                hostname=None,
                                signal_dbm=current_signal,
                                connected_since=None,
                            )
                        )
                        current_mac = None
        except Exception:
            pass

    return clients


async def get_ap_status(db: AsyncSession) -> ApStatusResponse:
    repo = ApConfigRepository(db)
    ap_config = await repo.get_current()

    if ap_config is None:
        ap_config = ApConfig(
            ssid=settings.AP_DEFAULT_SSID,
            password=settings.AP_DEFAULT_PASSWORD,
            channel=settings.AP_CHANNEL,
            country_code=settings.AP_COUNTRY_CODE,
            is_active=True,
            hide_ssid=False,
            max_clients=20,
            band="2.4GHz",
        )

    code, out, _ = await _run(["sudo", "systemctl", "is-active", "hostapd"])
    is_running = out.strip() == "active"

    clients = await get_ap_clients()

    return ApStatusResponse(
        is_running=is_running,
        interface=settings.AP_INTERFACE,
        ip_address=settings.AP_IP,
        config=ApConfigResponse(
            ssid=ap_config.ssid,
            channel=ap_config.channel,
            country_code=ap_config.country_code,
            hide_ssid=ap_config.hide_ssid,
            max_clients=ap_config.max_clients,
            is_active=ap_config.is_active,
            band=ap_config.band,
            ip_address=settings.AP_IP,
            subnet=settings.AP_SUBNET,
        ),
        clients=clients,
        client_count=len(clients),
    )


def _write_hostapd_conf(ssid: str, password: str, channel: int, country: str, hide: bool) -> None:
    conf = f"""interface={settings.AP_INTERFACE}
driver=nl80211
ssid={ssid}
hw_mode=g
channel={channel}
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid={"1" if hide else "0"}
wpa=2
wpa_passphrase={password}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
country_code={country}
"""
    settings.HOSTAPD_CONF_PATH.write_text(conf)
    logger.info("hostapd.conf updated for SSID={}", ssid)


async def get_arp_table() -> list[dict]:
    """Return ARP cache entries from /proc/net/arp."""
    entries: list[dict] = []
    try:
        with open("/proc/net/arp") as f:
            lines = f.readlines()
        for line in lines[1:]:
            parts = line.split()
            if len(parts) < 6:
                continue
            ip, _hw, flags, mac, _mask, iface = parts[:6]
            if mac == "00:00:00:00:00:00":
                continue
            entries.append({
                "ip_address": ip,
                "mac_address": mac,
                "interface": iface,
                "hostname": None,
                "vendor": None,
                "is_ap_client": iface == settings.AP_INTERFACE,
                "last_seen": None,
                "connected_since": None,
                "signal_dbm": None,
            })
    except OSError as exc:
        logger.warning("Could not read ARP table: {}", exc)
    return entries


async def update_ap_config(ssid: str, password: str, channel: int, country: str, hide: bool, db: AsyncSession) -> bool:
    try:
        _write_hostapd_conf(ssid, password, channel, country, hide)
    except PermissionError:
        logger.error("Permission denied writing hostapd.conf — running as root?")
        return False

    repo = ApConfigRepository(db)
    existing = await repo.get_current()
    if existing:
        await repo.update(existing, ssid=ssid, password=password, channel=channel, country_code=country, hide_ssid=hide)
    else:
        await repo.create(ssid=ssid, password=password, channel=channel, country_code=country, hide_ssid=hide)

    code, _, err = await _run(["sudo", "systemctl", "restart", "hostapd"], timeout=15.0)
    if code != 0:
        logger.error("Failed to restart hostapd: {}", err)
        return False

    logger.info("AP configuration updated and hostapd restarted")
    return True
