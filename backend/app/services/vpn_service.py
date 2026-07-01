from __future__ import annotations

import asyncio
import re
from pathlib import Path

from loguru import logger


async def _run(cmd: list[str], timeout: float = 15.0) -> tuple[int, str, str]:
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


async def list_wireguard_tunnels() -> list[dict]:
    """Parse `sudo wg show all dump` to build tunnel list."""
    code, out, err = await _run(["sudo", "wg", "show", "all", "dump"], timeout=10.0)
    if code != 0:
        logger.warning("wg show all dump failed: {}", err)

    # Get currently-up wireguard interfaces from `ip link`
    _, ip_out, _ = await _run(["ip", "link", "show", "type", "wireguard"], timeout=5.0)
    up_ifaces: set[str] = set()
    for line in ip_out.splitlines():
        m = re.match(r"\d+:\s+(\w+):", line)
        if m and "UP" in line:
            up_ifaces.add(m.group(1))

    tunnels: dict[str, dict] = {}

    for line in out.strip().splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")

        if len(parts) == 5:
            # Interface line: interface, public_key, private_key, listen_port, fwmark
            iface = parts[0]
            pub_key = parts[1]
            listen_port = parts[3]
            if iface not in tunnels:
                tunnels[iface] = {
                    "name": iface,
                    "interface": iface,
                    "public_key": pub_key,
                    "listen_port": listen_port,
                    "endpoint": None,
                    "allowed_ips": None,
                    "status": "up" if iface in up_ifaces else "down",
                    "rx_bytes": 0,
                    "tx_bytes": 0,
                    "last_handshake": 0,
                }
        elif len(parts) == 9:
            # Peer line: interface, public_key, preshared_key, endpoint, allowed_ips,
            #            latest_handshake, transfer_rx, transfer_tx, persistent_keepalive
            iface = parts[0]
            pub_key = parts[1]
            endpoint = parts[3] if parts[3] != "(none)" else None
            allowed_ips = parts[4] if parts[4] != "(none)" else None
            try:
                last_handshake = int(parts[5])
            except ValueError:
                last_handshake = 0
            try:
                rx_bytes = int(parts[6])
            except ValueError:
                rx_bytes = 0
            try:
                tx_bytes = int(parts[7])
            except ValueError:
                tx_bytes = 0

            if iface not in tunnels:
                tunnels[iface] = {
                    "name": iface,
                    "interface": iface,
                    "public_key": pub_key,
                    "listen_port": None,
                    "endpoint": endpoint,
                    "allowed_ips": allowed_ips,
                    "status": "up" if iface in up_ifaces else "down",
                    "rx_bytes": 0,
                    "tx_bytes": 0,
                    "last_handshake": 0,
                }

            # Accumulate rx/tx from peers
            tunnels[iface]["rx_bytes"] = tunnels[iface].get("rx_bytes", 0) + rx_bytes
            tunnels[iface]["tx_bytes"] = tunnels[iface].get("tx_bytes", 0) + tx_bytes
            if last_handshake > tunnels[iface].get("last_handshake", 0):
                tunnels[iface]["last_handshake"] = last_handshake
            if endpoint and not tunnels[iface].get("endpoint"):
                tunnels[iface]["endpoint"] = endpoint
            if allowed_ips and not tunnels[iface].get("allowed_ips"):
                tunnels[iface]["allowed_ips"] = allowed_ips

    # Enumerate conf files for tunnels not active in wg output
    wg_dir = Path("/etc/wireguard")
    if wg_dir.exists():
        for conf in sorted(wg_dir.glob("*.conf")):
            iface = conf.stem
            if iface not in tunnels:
                tunnels[iface] = {
                    "name": iface,
                    "interface": iface,
                    "public_key": None,
                    "listen_port": None,
                    "endpoint": None,
                    "allowed_ips": None,
                    "status": "down",
                    "rx_bytes": 0,
                    "tx_bytes": 0,
                    "last_handshake": 0,
                }

    return list(tunnels.values())


async def wireguard_up(name: str) -> bool:
    conf = f"/etc/wireguard/{name}.conf"
    code, _, err = await _run(["sudo", "wg-quick", "up", conf], timeout=20.0)
    if code != 0:
        logger.error("wg-quick up {} failed: {}", name, err)
        return False
    logger.info("WireGuard tunnel {} brought up", name)
    return True


async def wireguard_down(name: str) -> bool:
    conf = f"/etc/wireguard/{name}.conf"
    code, _, err = await _run(["sudo", "wg-quick", "down", conf], timeout=20.0)
    if code != 0:
        logger.error("wg-quick down {} failed: {}", name, err)
        return False
    logger.info("WireGuard tunnel {} brought down", name)
    return True


async def save_wireguard_config(name: str, content: str) -> bool:
    path = f"/etc/wireguard/{name}.conf"
    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "tee", path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(input=content.encode()), timeout=10.0)
        if proc.returncode != 0:
            logger.error("Failed to write WG config {}: {}", path, stderr.decode(errors="replace"))
            return False
        await _run(["sudo", "chmod", "600", path], timeout=5.0)
        logger.info("WireGuard config saved: {}", path)
        return True
    except Exception as exc:
        logger.error("Exception saving WG config {}: {}", path, exc)
        return False


async def delete_wireguard_config(name: str) -> bool:
    path = f"/etc/wireguard/{name}.conf"
    code, _, err = await _run(["sudo", "rm", "-f", path], timeout=5.0)
    if code != 0:
        logger.error("Failed to delete WG config {}: {}", path, err)
        return False
    logger.info("WireGuard config deleted: {}", path)
    return True


async def list_openvpn_configs() -> list[dict]:
    """Scan /etc/openvpn/client/*.ovpn and /etc/openvpn/*.ovpn."""
    found: dict[str, dict] = {}

    for search_dir in (Path("/etc/openvpn/client"), Path("/etc/openvpn")):
        if not search_dir.exists():
            continue
        for ovpn in sorted(search_dir.glob("*.ovpn")):
            name = ovpn.stem
            if name in found:
                continue
            found[name] = {
                "name": name,
                "path": str(ovpn),
                "status": "inactive",
            }

    # Check systemctl status for each
    for name, cfg in found.items():
        for service in (f"openvpn-client@{name}", f"openvpn@{name}"):
            code, out, _ = await _run(["sudo", "systemctl", "is-active", service], timeout=5.0)
            if out.strip() == "active":
                cfg["status"] = "active"
                break
        else:
            cfg["status"] = "inactive"

    return list(found.values())


async def openvpn_connect(name: str) -> bool:
    code, _, err = await _run(["sudo", "systemctl", "start", f"openvpn-client@{name}"], timeout=20.0)
    if code == 0:
        logger.info("OpenVPN openvpn-client@{} started", name)
        return True
    code2, _, err2 = await _run(["sudo", "systemctl", "start", f"openvpn@{name}"], timeout=20.0)
    if code2 == 0:
        logger.info("OpenVPN openvpn@{} started", name)
        return True
    logger.error("Failed to start OpenVPN {}: {} / {}", name, err, err2)
    return False


async def openvpn_disconnect(name: str) -> bool:
    ok = False
    code, _, _ = await _run(["sudo", "systemctl", "stop", f"openvpn-client@{name}"], timeout=20.0)
    if code == 0:
        ok = True
    code2, _, _ = await _run(["sudo", "systemctl", "stop", f"openvpn@{name}"], timeout=20.0)
    if code2 == 0:
        ok = True
    if ok:
        logger.info("OpenVPN {} disconnected", name)
    else:
        logger.error("Failed to stop OpenVPN {}", name)
    return ok


async def save_openvpn_config(name: str, content: str) -> bool:
    path = f"/etc/openvpn/client/{name}.ovpn"
    await _run(["sudo", "mkdir", "-p", "/etc/openvpn/client"], timeout=5.0)
    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "tee", path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(input=content.encode()), timeout=10.0)
        if proc.returncode != 0:
            logger.error("Failed to write OpenVPN config {}: {}", path, stderr.decode(errors="replace"))
            return False
        await _run(["sudo", "chmod", "600", path], timeout=5.0)
        logger.info("OpenVPN config saved: {}", path)
        return True
    except Exception as exc:
        logger.error("Exception saving OpenVPN config {}: {}", path, exc)
        return False


async def delete_openvpn_config(name: str) -> bool:
    for path in (f"/etc/openvpn/client/{name}.ovpn", f"/etc/openvpn/{name}.ovpn"):
        code, _, _ = await _run(["sudo", "rm", "-f", path], timeout=5.0)
        if code == 0:
            logger.info("OpenVPN config deleted: {}", path)
            return True
    logger.error("Failed to delete OpenVPN config for {}", name)
    return False


async def get_vpn_ip() -> str | None:
    """Return IP address on tun* or wg* interface, if any."""
    for iface in ("tun0", "tun1", "wg0", "wg1"):
        code, out, _ = await _run(["ip", "addr", "show", iface], timeout=5.0)
        if code == 0 and "inet " in out:
            m = re.search(r"inet\s+([\d.]+)/", out)
            if m:
                return m.group(1)

    # Broader search across all interfaces
    code, out, _ = await _run(["ip", "addr"], timeout=5.0)
    if code == 0:
        current_iface: str | None = None
        for line in out.splitlines():
            m_iface = re.match(r"\d+:\s+(wg\w+|tun\w+):", line)
            if m_iface:
                current_iface = m_iface.group(1)
            elif current_iface and "inet " in line:
                m_ip = re.search(r"inet\s+([\d.]+)/", line)
                if m_ip:
                    return m_ip.group(1)
            elif re.match(r"\d+:", line):
                current_iface = None

    return None
