from __future__ import annotations

import asyncio

from loguru import logger


async def _run(cmd: list[str], timeout: float = 30.0) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return -1, "", "Command timed out"
    return proc.returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def _bluetoothctl(*args: str, input_text: str | None = None, timeout: float = 20.0) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        "bluetoothctl", *args,
        stdin=asyncio.subprocess.PIPE if input_text else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdin_bytes = input_text.encode() if input_text else None
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(stdin_bytes), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return -1, "Command timed out"
    return proc.returncode, stdout.decode(errors="replace")


def _validate_mac(mac: str) -> bool:
    import re
    return bool(re.fullmatch(r"([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}", mac))


async def list_paired_devices() -> list[dict]:
    code, out = await _bluetoothctl("devices", "Paired")
    devices: list[dict] = []
    for line in out.splitlines():
        if not line.startswith("Device"):
            continue
        parts = line.split(" ", 2)
        if len(parts) < 3:
            continue
        mac = parts[1]
        name = parts[2]
        connected = await _is_connected(mac)
        rssi = await _get_rssi(mac)
        devices.append({"mac": mac, "name": name, "connected": connected, "rssi": rssi, "type": "Unknown"})
    return devices


async def _is_connected(mac: str) -> bool:
    code, out = await _bluetoothctl("info", mac)
    return "Connected: yes" in out


async def _get_rssi(mac: str) -> int | None:
    code, out = await _bluetoothctl("info", mac)
    for line in out.splitlines():
        if "RSSI:" in line:
            try:
                return int(line.split("RSSI:")[1].strip())
            except ValueError:
                pass
    return None


async def scan_devices() -> list[dict]:
    logger.info("Starting Bluetooth scan (10s)")
    await _bluetoothctl("scan", "on", timeout=2.0)
    await asyncio.sleep(10)
    await _bluetoothctl("scan", "off", timeout=2.0)

    code, out = await _bluetoothctl("devices")
    _, paired_out = await _bluetoothctl("devices", "Paired")
    paired_macs = set()
    for line in paired_out.splitlines():
        if line.startswith("Device"):
            parts = line.split(" ", 2)
            if len(parts) >= 2:
                paired_macs.add(parts[1])

    found: list[dict] = []
    for line in out.splitlines():
        if not line.startswith("Device"):
            continue
        parts = line.split(" ", 2)
        if len(parts) < 3:
            continue
        mac = parts[1]
        name = parts[2]
        found.append({"mac": mac, "name": name, "rssi": None, "paired": mac in paired_macs})
    return found


async def pair_device(mac: str) -> dict:
    if not _validate_mac(mac):
        raise ValueError("Invalid MAC address")
    logger.info(f"Pairing Bluetooth device: {mac}")
    commands = f"pair {mac}\ntrust {mac}\nconnect {mac}\nquit\n"
    code, out = await _bluetoothctl(input_text=commands, timeout=30.0)
    if "Failed" in out and "Paired: yes" not in out:
        raise RuntimeError(f"Pairing failed: {out.strip()}")
    return {"mac": mac, "status": "paired"}


async def disconnect_device(mac: str) -> dict:
    if not _validate_mac(mac):
        raise ValueError("Invalid MAC address")
    logger.info(f"Disconnecting Bluetooth device: {mac}")
    code, out = await _bluetoothctl("disconnect", mac)
    return {"mac": mac, "status": "disconnected"}


async def remove_device(mac: str) -> dict:
    if not _validate_mac(mac):
        raise ValueError("Invalid MAC address")
    logger.info(f"Removing Bluetooth device: {mac}")
    code, out = await _bluetoothctl("remove", mac)
    if code != 0 and "not available" not in out.lower():
        raise RuntimeError(f"Failed to remove device: {out.strip()}")
    return {"mac": mac, "status": "removed"}
