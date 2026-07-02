from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

from loguru import logger

# =============================================================================
# Diagnostics service — verifies every subsystem the dashboard depends on so
# the operator can see at a glance what is controllable and what needs setup.
#
# Each check returns a dict:
#   { "name", "category", "status": ok|warn|fail, "detail", "hint" }
# =============================================================================


async def _run(cmd: list[str], timeout: float = 6.0) -> tuple[int, str]:
    """Run a command, return (returncode, combined stdout+stderr)."""
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
        return 127, "not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def _check(name: str, category: str, status: str, detail: str, hint: str = "") -> dict:
    return {
        "name": name,
        "category": category,
        "status": status,
        "detail": detail,
        "hint": hint,
    }


# ─── Binary / tooling checks ─────────────────────────────────────────────────

# (display name, binary, install hint, required?)
_BINARIES = [
    ("Docker", "docker", "sudo apt install docker.io  (or the official convenience script)", False),
    ("Docker Compose", "docker-compose", "Ships as 'docker compose' plugin on modern installs", False),
    ("rclone", "rclone", "curl https://rclone.org/install.sh | sudo bash", False),
    ("iptables", "iptables", "sudo apt install iptables", True),
    ("hostapd", "hostapd", "sudo apt install hostapd", True),
    ("dnsmasq", "dnsmasq", "sudo apt install dnsmasq", True),
    ("nginx", "nginx", "sudo apt install nginx", True),
    ("bluetoothctl", "bluetoothctl", "sudo apt install bluez", False),
    ("nmcli (NetworkManager)", "nmcli", "sudo apt install network-manager", False),
    ("speedtest", "speedtest-cli", "sudo apt install speedtest-cli", False),
    ("git", "git", "sudo apt install git", False),
    ("ss (iproute2)", "ss", "sudo apt install iproute2", True),
    ("WireGuard", "wg", "sudo apt install wireguard-tools", False),
    ("fail2ban", "fail2ban-client", "sudo apt install fail2ban", False),
]


async def _check_binaries() -> list[dict]:
    results: list[dict] = []
    for display, binary, hint, required in _BINARIES:
        path = shutil.which(binary)
        if path:
            results.append(_check(display, "Tooling", "ok", f"Installed at {path}"))
        else:
            results.append(
                _check(
                    display,
                    "Tooling",
                    "fail" if required else "warn",
                    "Not installed",
                    hint,
                )
            )
    return results


# ─── systemd service checks ──────────────────────────────────────────────────

# (display name, unit, critical?)
_SERVICES = [
    ("Backend API", "sudo-pi-backend", True),
    ("Nginx", "nginx", True),
    ("Access Point (hostapd)", "hostapd", True),
    ("DHCP/DNS (dnsmasq)", "dnsmasq", True),
    ("mDNS (avahi)", "avahi-daemon", False),
    ("Docker Engine", "docker", False),
    ("Fail2Ban", "fail2ban", False),
    ("SSH", "ssh", False),
]


async def _service_active(unit: str) -> tuple[bool, str]:
    code, out = await _run(["systemctl", "is-active", unit], timeout=5.0)
    return code == 0 and out == "active", out or "unknown"


async def _check_services() -> list[dict]:
    async def one(display: str, unit: str, critical: bool) -> dict:
        active, state = await _service_active(unit)
        if active:
            return _check(display, "Services", "ok", "active (running)")
        # Distinguish "not installed" from "installed but down"
        code, _ = await _run(["systemctl", "status", unit], timeout=5.0)
        if code == 4:  # unit not found
            return _check(
                display,
                "Services",
                "fail" if critical else "warn",
                "not installed",
                f"Install and enable: sudo systemctl enable --now {unit}",
            )
        return _check(
            display,
            "Services",
            "fail" if critical else "warn",
            f"{state} (not running)",
            f"Start it: sudo systemctl start {unit} — inspect: journalctl -u {unit} -n 40",
        )

    return await asyncio.gather(*(one(d, u, c) for d, u, c in _SERVICES))


# ─── Privilege / capability checks ───────────────────────────────────────────


async def _check_network() -> list[dict]:
    """Check that AP clients have a working internet path (NAT sharing)."""
    from app.services import internet_sharing_service

    try:
        st = await internet_sharing_service.get_status()
    except Exception as exc:  # noqa: BLE001
        return [_check("Internet sharing", "Network", "warn", f"could not determine: {exc}")]

    if st["sharing_active"]:
        return [
            _check(
                "Internet sharing",
                "Network",
                "ok",
                f"AP clients route through {st['upstream_interface']}",
            )
        ]
    if not st["upstream_interface"]:
        return [
            _check(
                "Internet sharing",
                "Network",
                "warn",
                "no upstream internet on the Pi",
                "Connect ethernet / a second Wi-Fi adapter, then enable sharing on the Network page",
            )
        ]
    return [
        _check(
            "Internet sharing",
            "Network",
            "warn",
            f"upstream {st['upstream_interface']} present but sharing is off",
            "Open Network → Internet Sharing → Enable, or run: sudo bash /SUDO-Pi/scripts/internet-sharing.sh",
        )
    ]


async def _check_privileges() -> list[dict]:
    results: list[dict] = []

    # Passwordless sudo — the backend relies on it for nearly every action
    code, out = await _run(["sudo", "-n", "true"], timeout=5.0)
    if code == 0:
        results.append(_check("Passwordless sudo", "Privileges", "ok", "sudo -n succeeds"))
    else:
        results.append(
            _check(
                "Passwordless sudo",
                "Privileges",
                "fail",
                "sudo requires a password",
                "Add /etc/sudoers.d/sudo-pi:  sudo-pi ALL=(ALL) NOPASSWD: ALL",
            )
        )

    # iptables read access (traffic accounting, firewall, captive portal)
    code, _ = await _run(["sudo", "-n", "iptables", "-n", "-L", "-t", "filter"], timeout=6.0)
    results.append(
        _check(
            "iptables control",
            "Privileges",
            "ok" if code == 0 else "fail",
            "readable" if code == 0 else "cannot read iptables",
            "" if code == 0 else "Ensure passwordless sudo and iptables are installed",
        )
    )

    # Docker socket access
    if shutil.which("docker"):
        code, _ = await _run(["docker", "ps"], timeout=6.0)
        results.append(
            _check(
                "Docker socket access",
                "Privileges",
                "ok" if code == 0 else "warn",
                "docker ps succeeds" if code == 0 else "cannot reach Docker daemon",
                "" if code == 0 else "Add the service user to the 'docker' group, or ensure the daemon is running",
            )
        )

    return results


# ─── Filesystem / disk checks ────────────────────────────────────────────────


async def _check_filesystem() -> list[dict]:
    results: list[dict] = []

    # Root filesystem free space
    try:
        st = shutil.disk_usage("/")
        pct_free = st.free / st.total * 100 if st.total else 0
        gb_free = st.free / (1024**3)
        if pct_free < 5:
            status = "fail"
            hint = "Free space urgently — the Pi can misbehave below 5% free"
        elif pct_free < 15:
            status = "warn"
            hint = "Consider clearing logs, old backups, or unused Docker images"
        else:
            status = "ok"
            hint = ""
        results.append(
            _check(
                "Root filesystem",
                "Storage",
                status,
                f"{gb_free:.1f} GB free ({pct_free:.0f}%)",
                hint,
            )
        )
    except Exception as exc:  # noqa: BLE001
        results.append(_check("Root filesystem", "Storage", "warn", f"could not read: {exc}"))

    # Frontend build present
    for candidate in ("/SUDO-Pi/frontend/dist/index.html", "/opt/sudo-pi/frontend/dist/index.html"):
        if Path(candidate).exists():
            results.append(_check("Frontend build", "Storage", "ok", f"present at {candidate}"))
            break
    else:
        results.append(
            _check(
                "Frontend build",
                "Storage",
                "warn",
                "dist/index.html not found in expected locations",
                "Run: cd frontend && npm run build",
            )
        )

    return results


# ─── Public API ──────────────────────────────────────────────────────────────


async def run_diagnostics() -> dict:
    """Run every diagnostic group concurrently and return a structured report."""
    binaries, services, privileges, filesystem, network = await asyncio.gather(
        _check_binaries(),
        _check_services(),
        _check_privileges(),
        _check_filesystem(),
        _check_network(),
    )

    checks = [*services, *network, *privileges, *binaries, *filesystem]

    summary = {"ok": 0, "warn": 0, "fail": 0}
    for c in checks:
        summary[c["status"]] = summary.get(c["status"], 0) + 1

    if summary["fail"]:
        overall = "fail"
    elif summary["warn"]:
        overall = "warn"
    else:
        overall = "ok"

    logger.info(
        "Diagnostics: {} ok, {} warn, {} fail",
        summary["ok"],
        summary["warn"],
        summary["fail"],
    )

    return {"overall": overall, "summary": summary, "checks": checks}
