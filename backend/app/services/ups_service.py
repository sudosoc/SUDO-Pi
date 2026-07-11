from __future__ import annotations

import asyncio


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
        await proc.communicate()
        return -1, "", "Command timed out"
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


def _parse_float(val: str | None) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except ValueError:
        return None


async def list_ups_devices() -> list[str]:
    code, out, _ = await _run(["upsc", "-l"])
    if code != 0:
        return []
    return [ln.strip() for ln in out.strip().splitlines() if ln.strip()]


async def get_ups_status(ups_name: str | None = None) -> dict:
    devices = await list_ups_devices()

    if not devices:
        return {
            "available": False,
            "error": "No UPS devices found. Install NUT (sudo apt install nut) and configure /etc/nut/ups.conf.",
            "devices": [],
            "ups_name": None,
        }

    target = ups_name if ups_name and ups_name in devices else devices[0]
    code, out, err = await _run(["upsc", target])

    if code != 0:
        return {
            "available": False,
            "error": err.strip() or f"Failed to query UPS '{target}'.",
            "devices": devices,
            "ups_name": target,
        }

    props: dict[str, str] = {}
    for line in out.strip().splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            props[key.strip()] = val.strip()

    status_raw = props.get("ups.status", "UNKNOWN")
    on_battery = "OB" in status_raw
    on_line = "OL" in status_raw
    charging = "CHRG" in status_raw
    discharging = "DISCHRG" in status_raw
    low_battery = "LB" in status_raw

    return {
        "available": True,
        "ups_name": target,
        "devices": devices,
        "status": status_raw,
        "on_battery": on_battery,
        "on_line": on_line,
        "charging": charging,
        "discharging": discharging,
        "low_battery": low_battery,
        "battery_charge": _parse_float(props.get("battery.charge")),
        "battery_runtime": _parse_float(props.get("battery.runtime")),
        "battery_voltage": _parse_float(props.get("battery.voltage")),
        "battery_voltage_nominal": _parse_float(props.get("battery.voltage.nominal")),
        "input_voltage": _parse_float(props.get("input.voltage")),
        "input_frequency": _parse_float(props.get("input.frequency")),
        "output_voltage": _parse_float(props.get("output.voltage")),
        "ups_load": _parse_float(props.get("ups.load")),
        "ups_temperature": _parse_float(props.get("ups.temperature")),
        "ups_beeper_status": props.get("ups.beeper.status"),
        "model": props.get("ups.model", ""),
        "manufacturer": props.get("ups.mfr", ""),
        "serial": props.get("ups.serial", ""),
        "firmware": props.get("ups.firmware", ""),
        "driver": props.get("driver.name", ""),
        "raw": props,
    }
