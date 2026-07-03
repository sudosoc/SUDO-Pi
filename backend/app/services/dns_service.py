from __future__ import annotations

import asyncio
import re

from loguru import logger

# =============================================================================
# Local DNS + static DHCP lease management via a dedicated dnsmasq include file.
#
# We own /etc/dnsmasq.d/sudo-pi-dns.conf exclusively and rebuild it from the
# parsed set of records on every change, then reload dnsmasq. dnsmasq reads
# /etc/dnsmasq.d/* through conf-dir, so this composes with the main config
# and the ad-blocker include without touching either.
#
#   address=/<host>/<ip>      → local DNS name resolves to <ip>
#   dhcp-host=<mac>,<ip>,<hn> → always hand <ip> to <mac> (static reservation)
# =============================================================================

CONF_PATH = "/etc/dnsmasq.d/sudo-pi-dns.conf"

_IP_RE = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$")
_HOST_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-.]{0,251}[a-zA-Z0-9])?$")
_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")

_HEADER = (
    "# Managed by SUDO-Pi — do not edit by hand.\n"
    "# Rebuilt whenever DNS records or static leases change.\n\n"
)


def _validate_ip(ip: str) -> str:
    ip = ip.strip()
    m = _IP_RE.match(ip)
    if not m or any(int(o) > 255 for o in m.groups()):
        raise ValueError(f"Invalid IPv4 address: {ip!r}")
    return ip


def _validate_host(host: str) -> str:
    host = host.strip().lower()
    if not _HOST_RE.match(host):
        raise ValueError(f"Invalid hostname: {host!r}")
    return host


def _validate_mac(mac: str) -> str:
    mac = mac.strip().lower()
    if not _MAC_RE.match(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    return mac


async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode or 0, out.decode(errors="replace").strip()
    except asyncio.TimeoutError:
        return -1, "timed out"
    except FileNotFoundError:
        return 127, "command not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


async def _read_conf() -> str:
    code, out = await _run(["cat", CONF_PATH], timeout=5.0)
    return out if code == 0 else ""


async def ensure_conf_dir_loaded() -> None:
    """Guarantee the main dnsmasq config loads /etc/dnsmasq.d/.

    Older SUDO-Pi installs shipped a /etc/dnsmasq.conf without a conf-dir
    directive, so every drop-in (ad-blocker, DNS records, static leases) was
    written but silently ignored. This self-heals that in place, idempotently,
    so a plain backend deploy is enough — no full re-setup required.
    """
    code, out = await _run(["cat", "/etc/dnsmasq.conf"], timeout=5.0)
    if code == 0 and "conf-dir=/etc/dnsmasq.d" in out:
        return
    await _run(
        ["sudo", "sh", "-c",
         "grep -q '^conf-dir=/etc/dnsmasq.d' /etc/dnsmasq.conf 2>/dev/null || "
         "echo 'conf-dir=/etc/dnsmasq.d/,*.conf' >> /etc/dnsmasq.conf"],
        timeout=8.0,
    )
    logger.info("dnsmasq conf-dir directive ensured in /etc/dnsmasq.conf")


def _parse(raw: str) -> tuple[list[dict], list[dict]]:
    records: list[dict] = []
    leases: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("address=/"):
            # address=/host/ip
            parts = line[len("address=/"):].split("/")
            if len(parts) == 2 and parts[0] and parts[1]:
                records.append({"hostname": parts[0], "ip": parts[1]})
        elif line.startswith("dhcp-host="):
            fields = line[len("dhcp-host="):].split(",")
            if len(fields) >= 2:
                leases.append({
                    "mac": fields[0],
                    "ip": fields[1],
                    "hostname": fields[2] if len(fields) > 2 else None,
                })
    return records, leases


def _render(records: list[dict], leases: list[dict]) -> str:
    lines = [_HEADER.rstrip("\n")]
    if records:
        lines.append("\n# Local DNS records")
        for r in records:
            lines.append(f"address=/{r['hostname']}/{r['ip']}")
    if leases:
        lines.append("\n# Static DHCP reservations")
        for l in leases:
            if l.get("hostname"):
                lines.append(f"dhcp-host={l['mac']},{l['ip']},{l['hostname']}")
            else:
                lines.append(f"dhcp-host={l['mac']},{l['ip']}")
    return "\n".join(lines) + "\n"


async def _write_and_reload(records: list[dict], leases: list[dict]) -> None:
    await ensure_conf_dir_loaded()
    content = _render(records, leases)
    # tee via sudo so the unprivileged service user can write to /etc
    proc = await asyncio.create_subprocess_exec(
        "sudo", "tee", CONF_PATH,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    await asyncio.wait_for(proc.communicate(content.encode()), timeout=10.0)
    code, out = await _run(["sudo", "systemctl", "restart", "dnsmasq"], timeout=15.0)
    if code != 0:
        raise RuntimeError(f"dnsmasq reload failed: {out[-300:]}")
    logger.info("DNS config rebuilt: {} records, {} leases", len(records), len(leases))


# ─── Public API ──────────────────────────────────────────────────────────────


async def get_all() -> dict:
    records, leases = _parse(await _read_conf())
    return {"records": records, "leases": leases}


async def add_record(hostname: str, ip: str) -> dict:
    hostname = _validate_host(hostname)
    ip = _validate_ip(ip)
    records, leases = _parse(await _read_conf())
    records = [r for r in records if r["hostname"] != hostname]
    records.append({"hostname": hostname, "ip": ip})
    await _write_and_reload(records, leases)
    return {"records": records, "leases": leases}


async def delete_record(hostname: str) -> dict:
    hostname = hostname.strip().lower()
    records, leases = _parse(await _read_conf())
    records = [r for r in records if r["hostname"] != hostname]
    await _write_and_reload(records, leases)
    return {"records": records, "leases": leases}


async def add_lease(mac: str, ip: str, hostname: str | None = None) -> dict:
    mac = _validate_mac(mac)
    ip = _validate_ip(ip)
    if hostname:
        hostname = _validate_host(hostname)
    records, leases = _parse(await _read_conf())
    leases = [l for l in leases if l["mac"].lower() != mac]
    leases.append({"mac": mac, "ip": ip, "hostname": hostname})
    await _write_and_reload(records, leases)
    return {"records": records, "leases": leases}


async def delete_lease(mac: str) -> dict:
    mac = mac.strip().lower()
    records, leases = _parse(await _read_conf())
    leases = [l for l in leases if l["mac"].lower() != mac]
    await _write_and_reload(records, leases)
    return {"records": records, "leases": leases}


async def get_upstream() -> list[str]:
    """Current upstream DNS servers dnsmasq is forwarding to."""
    code, out = await _run(["cat", "/etc/resolv.conf"], timeout=5.0)
    servers: list[str] = []
    if code == 0:
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("nameserver"):
                parts = line.split()
                if len(parts) >= 2:
                    servers.append(parts[1])
    return servers
