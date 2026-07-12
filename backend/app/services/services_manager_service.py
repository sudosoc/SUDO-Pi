from __future__ import annotations

import re

from loguru import logger

# =============================================================================
# systemd service manager — list and control system services.
#
# Read paths (list/status) need no privileges; control actions (start/stop/
# restart/enable/disable) go through sudo systemctl. Unit names are strictly
# validated to block command injection.
# =============================================================================

_UNIT_RE = re.compile(r"^[A-Za-z0-9@._\-]+$")
_ALLOWED_ACTIONS = {"start", "stop", "restart", "enable", "disable"}


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 15.0) -> tuple[int, str]:
    code, out, _ = await run_cmd(cmd, timeout=timeout, merge_stderr=True)
    return code, out.strip()


def _validate_unit(name: str) -> str:
    name = name.strip()
    if not name.endswith(".service"):
        name = f"{name}.service"
    if not _UNIT_RE.match(name) or ".." in name:
        raise ValueError(f"Invalid service name: {name!r}")
    return name


async def list_services() -> list[dict]:
    """Return all service units with load/active/sub state and description."""
    # --plain drops the tree glyphs; --all includes inactive units
    code, out = await _run(
        ["systemctl", "list-units", "--type=service", "--all", "--no-pager",
         "--no-legend", "--plain"],
        timeout=20.0,
    )
    if code != 0:
        raise RuntimeError(f"systemctl list-units failed: {out[:300]}")

    # Which units are enabled at boot
    enabled: dict[str, str] = {}
    code2, out2 = await _run(
        ["systemctl", "list-unit-files", "--type=service", "--no-pager",
         "--no-legend", "--plain"],
        timeout=20.0,
    )
    if code2 == 0:
        for line in out2.splitlines():
            parts = line.split(None, 2)
            if len(parts) >= 2:
                enabled[parts[0]] = parts[1]  # e.g. "enabled" / "disabled" / "static"

    services: list[dict] = []
    for line in out.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        unit, load, active, sub = parts[0], parts[1], parts[2], parts[3]
        description = parts[4] if len(parts) >= 5 else ""
        if not unit.endswith(".service"):
            continue
        services.append({
            "name": unit[: -len(".service")],
            "unit": unit,
            "load": load,
            "active": active,
            "sub": sub,
            "description": description,
            "enabled": enabled.get(unit, "unknown"),
        })

    services.sort(key=lambda s: (s["active"] != "active", s["name"]))
    return services


async def get_service(name: str) -> dict:
    unit = _validate_unit(name)
    code, active = await _run(["systemctl", "is-active", unit], timeout=8.0)
    _, enabled = await _run(["systemctl", "is-enabled", unit], timeout=8.0)
    _, status = await _run(["systemctl", "status", unit, "--no-pager", "--lines=20"], timeout=10.0)
    return {
        "name": name.replace(".service", ""),
        "unit": unit,
        "active": active or "unknown",
        "enabled": enabled or "unknown",
        "status_text": status,
    }


async def control_service(name: str, action: str) -> dict:
    if action not in _ALLOWED_ACTIONS:
        raise ValueError(f"Invalid action: {action!r}")
    unit = _validate_unit(name)

    code, out = await _run(["sudo", "systemctl", action, unit], timeout=30.0)
    if code != 0:
        raise RuntimeError(out[:400] or f"systemctl {action} exited {code}")

    logger.info("Service {} {}ed", unit, action)
    # Report the resulting state
    _, active = await _run(["systemctl", "is-active", unit], timeout=8.0)
    _, enabled = await _run(["systemctl", "is-enabled", unit], timeout=8.0)
    return {
        "name": name.replace(".service", ""),
        "unit": unit,
        "action": action,
        "active": active or "unknown",
        "enabled": enabled or "unknown",
    }
