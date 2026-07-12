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
            "Open Network → Internet Sharing → Enable, or run: sudo bash /opt/sudo-pi/scripts/internet-sharing.sh",
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
    for candidate in ("/opt/sudo-pi/frontend/dist/index.html", "/SUDO-Pi/frontend/dist/index.html"):
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


async def export_report() -> dict:
    """Generate a comprehensive system diagnostic report for download."""
    from datetime import datetime, timezone
    import platform

    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "app": "SUDO-Pi Dashboard",
    }

    # System info
    rc_hostname, hostname = await _run(["hostname", "-f"], timeout=3.0)
    rc_uname, uname = await _run(["uname", "-a"], timeout=3.0)
    rc_uptime, uptime = await _run(["uptime", "-p"], timeout=3.0)
    rc_loadavg, loadavg = await _run(["cat", "/proc/loadavg"], timeout=2.0)
    rc_mem, meminfo = await _run(["free", "-m"], timeout=3.0)
    rc_disk, diskinfo = await _run(["df", "-h"], timeout=3.0)
    rc_temp, tempinfo = await _run(["cat", "/sys/class/thermal/thermal_zone0/temp"], timeout=2.0)

    report["system"] = {
        "hostname": hostname if rc_hostname == 0 else platform.node(),
        "kernel": uname if rc_uname == 0 else platform.uname().release,
        "uptime": uptime if rc_uptime == 0 else "unknown",
        "load_avg": loadavg if rc_loadavg == 0 else "unknown",
        "memory": meminfo if rc_mem == 0 else "unknown",
        "disk": diskinfo if rc_disk == 0 else "unknown",
        "temperature_celsius": (
            round(int(tempinfo) / 1000, 1) if rc_temp == 0 and tempinfo.isdigit() else None
        ),
        "python": platform.python_version(),
    }

    # Network interfaces
    rc_ifaces, ifaces = await _run(["ip", "-brief", "addr"], timeout=4.0)
    rc_routes, routes = await _run(["ip", "route"], timeout=4.0)
    rc_dns, dns_conf = await _run(["cat", "/etc/resolv.conf"], timeout=2.0)
    report["network"] = {
        "interfaces": ifaces if rc_ifaces == 0 else "",
        "routes": routes if rc_routes == 0 else "",
        "resolv_conf": dns_conf if rc_dns == 0 else "",
    }

    # Services
    rc_srv, services_out = await _run(
        ["systemctl", "list-units", "--type=service", "--state=running", "--no-pager", "--no-legend"],
        timeout=8.0,
    )
    report["running_services"] = services_out if rc_srv == 0 else ""

    # Failed units
    rc_fail, failed_out = await _run(
        ["systemctl", "--failed", "--no-pager", "--no-legend"],
        timeout=5.0,
    )
    report["failed_units"] = failed_out if rc_fail == 0 else ""

    # Top processes by CPU
    rc_ps, ps_out = await _run(
        ["ps", "aux", "--sort=-%cpu"],
        timeout=5.0,
    )
    ps_lines = ps_out.splitlines()[:25] if rc_ps == 0 else []
    report["top_processes"] = "\n".join(ps_lines)

    # Recent syslog / journal
    rc_log, journal_out = await _run(
        ["journalctl", "-n", "100", "--no-pager", "--output=short"],
        timeout=8.0,
    )
    report["recent_journal"] = journal_out if rc_log == 0 else ""

    # Backend logs
    rc_blog, backend_log = await _run(
        ["journalctl", "-u", "sudo-pi-backend", "-n", "80", "--no-pager"],
        timeout=5.0,
    )
    report["backend_logs"] = backend_log if rc_blog == 0 else ""

    # iptables rules (sanitised — no secrets)
    rc_ipt, ipt_out = await _run(
        ["sudo", "-n", "iptables", "-L", "-n", "-v"],
        timeout=5.0,
    )
    report["iptables"] = ipt_out if rc_ipt == 0 else "unavailable (sudo required)"

    # Docker containers
    rc_dk, docker_out = await _run(
        ["docker", "ps", "-a", "--format", "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"],
        timeout=6.0,
    )
    report["docker_containers"] = docker_out if rc_dk == 0 else "Docker not available"

    # nginx config test
    rc_ng, nginx_test = await _run(["sudo", "-n", "nginx", "-t"], timeout=5.0)
    report["nginx_config_test"] = nginx_test if rc_ng == 0 else nginx_test

    # Run and embed the standard diagnostics report
    report["diagnostics"] = await run_diagnostics()

    return report
