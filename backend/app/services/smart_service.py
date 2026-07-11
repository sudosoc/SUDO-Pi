from __future__ import annotations

import asyncio
import re
from typing import Any

_KNOWN_ATTRS: dict[str, str] = {
    "1": "Raw Read Error Rate",
    "3": "Spin Up Time",
    "4": "Start/Stop Count",
    "5": "Reallocated Sector Count",
    "7": "Seek Error Rate",
    "9": "Power On Hours",
    "10": "Spin Retry Count",
    "12": "Power Cycle Count",
    "187": "Reported Uncorrectable Errors",
    "188": "Command Timeout",
    "190": "Airflow Temperature",
    "192": "Power-Off Retract Count",
    "193": "Load Cycle Count",
    "194": "HDD Temperature",
    "196": "Reallocation Event Count",
    "197": "Current Pending Sectors",
    "198": "Offline Uncorrectable Sectors",
    "199": "Ultra DMA CRC Error Count",
    "231": "SSD Life Left",
    "232": "Endurance Remaining",
    "233": "Media Wearout Indicator",
    "241": "Total LBAs Written",
    "242": "Total LBAs Read",
}


async def _run(cmd: list[str], timeout: float = 20.0) -> tuple[int, str, str]:
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
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def list_smart_disks() -> list[dict]:
    code, out, _ = await _run(["sudo", "smartctl", "--scan"])
    if code != 0 or not out.strip():
        # Try lsblk as fallback
        code2, out2, _ = await _run(["lsblk", "-d", "-o", "NAME,TYPE", "--json"])
        devices = []
        if code2 == 0:
            import json
            try:
                data = json.loads(out2)
                for dev in data.get("blockdevices", []):
                    if dev.get("type") in ("disk",):
                        devices.append(f"/dev/{dev['name']}")
            except Exception:
                pass
        if not devices:
            return []
        results = await asyncio.gather(*[get_disk_smart(d) for d in devices])
        return list(results)

    devices = []
    for line in out.strip().splitlines():
        parts = line.split()
        if parts and parts[0].startswith("/dev/"):
            devices.append(parts[0])

    if not devices:
        return []

    results = await asyncio.gather(*[get_disk_smart(d) for d in devices])
    return list(results)


async def get_disk_smart(device: str) -> dict:
    if not re.match(r"^/dev/[a-zA-Z0-9]+$", device):
        raise ValueError(f"Invalid device path: {device!r}")

    code, out, _ = await _run(["sudo", "smartctl", "-a", device])

    result: dict[str, Any] = {
        "device": device,
        "model": "",
        "serial": "",
        "capacity": "",
        "health": "UNKNOWN",
        "temperature": None,
        "power_on_hours": None,
        "reallocated_sectors": 0,
        "pending_sectors": 0,
        "uncorrectable_sectors": 0,
        "attributes": [],
        "smart_available": code in (0, 4),
        "is_ssd": False,
    }

    for line in out.splitlines():
        stripped = line.strip()
        low = stripped.lower()

        if stripped.startswith("Device Model:") or stripped.startswith("Product:"):
            result["model"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Model Family:") and not result["model"]:
            result["model"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Serial Number:"):
            result["serial"] = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("User Capacity:"):
            result["capacity"] = stripped.split(":", 1)[1].strip().split(" [")[0]
        elif stripped.startswith("Rotation Rate:"):
            if "solid state" in low:
                result["is_ssd"] = True
        elif "SMART overall-health self-assessment" in stripped:
            if "PASSED" in stripped:
                result["health"] = "PASSED"
            elif "FAILED" in stripped:
                result["health"] = "FAILED"
        else:
            m = re.match(
                r"^\s*(\d+)\s+\S+\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(\S+)",
                stripped,
            )
            if m:
                attr_id = m.group(1)
                raw_str = m.group(6)
                try:
                    raw_val = int(raw_str)
                except ValueError:
                    try:
                        raw_val = int(raw_str.split()[0])
                    except ValueError:
                        raw_val = 0

                attr_name = _KNOWN_ATTRS.get(attr_id, f"Attribute {attr_id}")
                result["attributes"].append({
                    "id": int(attr_id),
                    "name": attr_name,
                    "value": int(m.group(3)),
                    "worst": int(m.group(4)),
                    "threshold": int(m.group(5)),
                    "raw": raw_val,
                    "flag": m.group(2),
                })

                if attr_id in ("194", "190") and result["temperature"] is None:
                    result["temperature"] = raw_val & 0xFF
                elif attr_id == "9":
                    result["power_on_hours"] = raw_val
                elif attr_id == "5":
                    result["reallocated_sectors"] = raw_val
                elif attr_id == "197":
                    result["pending_sectors"] = raw_val
                elif attr_id == "198":
                    result["uncorrectable_sectors"] = raw_val

    return result
