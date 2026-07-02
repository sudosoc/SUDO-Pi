from __future__ import annotations

import asyncio
import json
import socket
import time
from pathlib import Path

from loguru import logger

from app.services.network_traffic_service import _parse_leases, _parse_arp, AP_SUBNET_PREFIX


SCAN_CACHE_FILE = "/tmp/sudo-pi-scan.json"
CACHE_TTL_SECONDS = 60
PI_IP = "192.168.4.1"

COMMON_PORTS: dict[int, str] = {
    21: "FTP",
    22: "SSH",
    25: "SMTP",
    53: "DNS",
    80: "HTTP",
    139: "SMB",
    443: "HTTPS",
    445: "SMB",
    1883: "MQTT",
    2375: "Docker",
    3000: "Dev Server",
    3306: "MySQL",
    5000: "Flask/API",
    5432: "PostgreSQL",
    6379: "Redis",
    8080: "HTTP Alt",
    8096: "Jellyfin",
    8443: "HTTPS Alt",
    8888: "Jupyter",
    9000: "Portainer",
    9090: "Prometheus",
    27017: "MongoDB",
    32400: "Plex",
    8883: "MQTT TLS",
}


async def scan_port(ip: str, port: int, timeout: float = 0.5) -> bool:
    """Attempt an async TCP connect to ip:port. Returns True if successful."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout,
        )
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        return False


async def _resolve_hostname(ip: str) -> str | None:
    """Attempt a reverse DNS lookup. Returns None on failure."""
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, socket.gethostbyaddr, ip),
            timeout=1.0,
        )
        return result[0]
    except Exception:
        return None


async def scan_device(ip: str) -> dict:
    """Scan all COMMON_PORTS on a single device concurrently."""
    t_start = time.monotonic()

    leases = _parse_leases()
    arp = _parse_arp()

    lease_info = leases.get(ip, {})
    mac = lease_info.get("mac") or arp.get(ip) or "unknown"
    hostname = lease_info.get("hostname") or await _resolve_hostname(ip)

    tasks = {port: scan_port(ip, port) for port in COMMON_PORTS}
    results = await asyncio.gather(*tasks.values())

    open_ports = [
        {"port": port, "service": COMMON_PORTS[port]}
        for port, is_open in zip(tasks.keys(), results)
        if is_open
    ]
    open_ports.sort(key=lambda x: x["port"])

    scan_time_ms = round((time.monotonic() - t_start) * 1000)

    return {
        "ip": ip,
        "hostname": hostname,
        "mac": mac,
        "open_ports": open_ports,
        "scan_time_ms": scan_time_ms,
    }


async def scan_network() -> list[dict]:
    """Scan all AP clients plus the Pi itself, with max 5 concurrent device scans."""
    leases = _parse_leases()
    client_ips = sorted(
        {ip for ip in leases if ip.startswith(AP_SUBNET_PREFIX) and ip != PI_IP}
    )

    # Always include the Pi itself
    all_ips = [PI_IP] + [ip for ip in client_ips if ip != PI_IP]

    semaphore = asyncio.Semaphore(5)

    async def bounded_scan(ip: str) -> dict:
        async with semaphore:
            return await scan_device(ip)

    results = await asyncio.gather(*[bounded_scan(ip) for ip in all_ips])
    scan_results = list(results)

    # Cache the result
    try:
        cache_data = {
            "timestamp": time.time(),
            "results": scan_results,
        }
        Path(SCAN_CACHE_FILE).write_text(json.dumps(cache_data))
    except OSError as exc:
        logger.debug("Could not write scan cache: {}", exc)

    return scan_results


async def get_last_scan() -> list[dict]:
    """Return cached scan results if fresh (< 60 s), otherwise trigger a new scan."""
    try:
        text = Path(SCAN_CACHE_FILE).read_text()
        data = json.loads(text)
        age = time.time() - data.get("timestamp", 0)
        if age < CACHE_TTL_SECONDS:
            return data["results"]
    except (OSError, json.JSONDecodeError, KeyError):
        pass
    return await scan_network()
