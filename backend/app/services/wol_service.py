from __future__ import annotations

import asyncio
import json
import re
import socket
from pathlib import Path

from loguru import logger

DEVICES_FILE = Path("/etc/sudo-pi/wol-devices.json")


def _load_devices() -> list[dict]:
    try:
        return json.loads(DEVICES_FILE.read_text()) if DEVICES_FILE.exists() else []
    except Exception:
        return []


def _save_devices(devices: list[dict]) -> None:
    DEVICES_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEVICES_FILE.write_text(json.dumps(devices, indent=2))


def _validate_mac(mac: str) -> bool:
    return bool(re.match(r"^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$", mac))


def _next_id(devices: list[dict]) -> int:
    return max((d.get("id", 0) for d in devices), default=0) + 1


def _send_magic_packet(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    mac_clean = mac.replace(":", "").replace("-", "").upper()
    if len(mac_clean) != 12:
        raise ValueError("Invalid MAC address length")
    mac_bytes = bytes.fromhex(mac_clean)
    packet = b"\xff" * 6 + mac_bytes * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(2)
        sock.sendto(packet, (broadcast, port))
    # Also send on port 7 for compatibility
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(2)
        sock.sendto(packet, (broadcast, 7))


async def _is_online(ip: str) -> bool:
    if not ip:
        return False
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "1", ip,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=3.0)
        return proc.returncode == 0
    except Exception:
        return False


async def list_devices() -> list[dict]:
    devices = _load_devices()
    checks = await asyncio.gather(*[_is_online(d.get("ip", "")) for d in devices])
    for device, online in zip(devices, checks):
        device["online"] = online if device.get("ip") else None
    return devices


async def add_device(
    name: str,
    mac: str,
    ip: str = "",
    broadcast: str = "255.255.255.255",
) -> dict:
    if not _validate_mac(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}  — use format AA:BB:CC:DD:EE:FF")
    devices = _load_devices()
    device = {
        "id": _next_id(devices),
        "name": name,
        "mac": mac.upper().replace("-", ":"),
        "ip": ip,
        "broadcast": broadcast,
    }
    devices.append(device)
    _save_devices(devices)
    return device


async def update_device(
    device_id: int,
    name: str,
    mac: str,
    ip: str,
    broadcast: str,
) -> dict:
    if not _validate_mac(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    devices = _load_devices()
    idx = next((i for i, d in enumerate(devices) if d["id"] == device_id), None)
    if idx is None:
        raise ValueError(f"Device {device_id} not found")
    devices[idx] = {
        "id": device_id,
        "name": name,
        "mac": mac.upper().replace("-", ":"),
        "ip": ip,
        "broadcast": broadcast,
    }
    _save_devices(devices)
    return devices[idx]


async def delete_device(device_id: int) -> None:
    devices = _load_devices()
    devices = [d for d in devices if d["id"] != device_id]
    _save_devices(devices)


async def wake_device(device_id: int) -> dict:
    devices = _load_devices()
    device = next((d for d in devices if d["id"] == device_id), None)
    if not device:
        raise ValueError(f"Device {device_id} not found")
    try:
        _send_magic_packet(device["mac"], broadcast=device.get("broadcast", "255.255.255.255"))
        logger.info("WoL: sent magic packet to {} ({})", device["name"], device["mac"])
        return {"status": "sent", "mac": device["mac"], "name": device["name"]}
    except Exception as exc:
        raise RuntimeError(f"Failed to send magic packet: {exc}") from exc
