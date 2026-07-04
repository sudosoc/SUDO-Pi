from __future__ import annotations

import asyncio
import re
import secrets
from pathlib import Path

from loguru import logger

# =============================================================================
# Remote desktop service — browser-based GUI access to the Pi over the LAN.
#
# Stack:
#   TigerVNC (Xvnc)  → a headless virtual X desktop on display :1 (port 5901)
#   websockify       → bridges a WebSocket (port 6080) to the raw VNC socket
#   noVNC (frontend) → pure-JS VNC client that talks to /websockify via nginx
#
# Everything runs on localhost; nginx proxies wss://<host>/websockify → 6080,
# so no extra ports are exposed and it works with zero internet — the two
# devices just need to be on the same LAN, exactly like the dashboard.
# =============================================================================

DISPLAY_NUM = 1
VNC_PORT = 5900 + DISPLAY_NUM          # 5901
WEBSOCKIFY_PORT = 6080
GEOMETRY = "1280x720"
DEPTH = "24"

VNC_DIR = Path("/opt/sudo-pi/.vnc")
PASSWD_FILE = VNC_DIR / "passwd"
PLAIN_FILE = VNC_DIR / "sudo-pi-vnc.pass"   # plaintext, chmod 600, for display
XSTARTUP = VNC_DIR / "xstartup"
WEBSOCKIFY_PID = Path("/run/sudo-pi-websockify.pid")

# xstartup tries the desktop environments most likely present on a Pi, in
# order, and falls back to a bare window manager so the session never dies.
_XSTARTUP_BODY = """#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
export XDG_CURRENT_DESKTOP=XFCE
[ -x /etc/vnc/xstartup ] && exec /etc/vnc/xstartup
[ -r "$HOME/.Xresources" ] && xrdb "$HOME/.Xresources"
if command -v startxfce4 >/dev/null 2>&1; then exec startxfce4;
elif command -v mate-session >/dev/null 2>&1; then exec mate-session;
elif command -v startlxde >/dev/null 2>&1; then exec startlxde;
elif command -v lxsession >/dev/null 2>&1; then exec lxsession;
elif command -v gnome-session >/dev/null 2>&1; then exec gnome-session;
elif command -v openbox-session >/dev/null 2>&1; then exec openbox-session;
else exec xterm; fi
"""


async def _run(cmd: list[str], timeout: float = 20.0, input_text: str | None = None) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE if input_text is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        data = input_text.encode() if input_text is not None else None
        out, _ = await asyncio.wait_for(proc.communicate(input=data), timeout=timeout)
        return proc.returncode or 0, out.decode(errors="replace").strip()
    except asyncio.TimeoutError:
        return -1, "timed out"
    except FileNotFoundError:
        return 127, "command not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def _which(binary: str) -> bool:
    from shutil import which
    return which(binary) is not None


async def _pgrep(pattern: str) -> bool:
    code, _ = await _run(["pgrep", "-f", pattern], timeout=5.0)
    return code == 0


# ─── Status ──────────────────────────────────────────────────────────────────


async def get_status() -> dict:
    vnc_installed = _which("vncserver") or _which("Xtigervnc") or _which("Xvnc")
    ws_installed = _which("websockify")

    vnc_running = await _pgrep(f"[Xx](tiger)?[Vv]nc.*:{DISPLAY_NUM}") or await _pgrep(f"vnc.*:{DISPLAY_NUM}")
    ws_running = await _pgrep(f"websockify.*{WEBSOCKIFY_PORT}")

    running = vnc_running and ws_running

    if not (vnc_installed and ws_installed):
        summary = "Remote desktop components are not installed yet. Install them to enable GUI access."
    elif running:
        summary = "Remote desktop is running. Open the viewer to control the Pi's screen."
    else:
        summary = "Remote desktop is installed but stopped. Start it to enable GUI access."

    password = None
    try:
        if PLAIN_FILE.exists():
            password = PLAIN_FILE.read_text().strip() or None
    except Exception:
        password = None

    return {
        "installed": bool(vnc_installed and ws_installed),
        "vnc_installed": bool(vnc_installed),
        "websockify_installed": bool(ws_installed),
        "running": running,
        "vnc_running": vnc_running,
        "websockify_running": ws_running,
        "display": f":{DISPLAY_NUM}",
        "geometry": GEOMETRY,
        "websocket_path": "/websockify",
        "password": password,
        "summary": summary,
    }


# ─── Install ─────────────────────────────────────────────────────────────────


async def install() -> dict:
    """Install TigerVNC + websockify (+ a lightweight desktop if none present)."""
    await _run(["sudo", "apt-get", "update"], timeout=180.0)

    packages = ["tigervnc-standalone-server", "tigervnc-common", "websockify"]
    # Only pull a desktop environment if the box has none — keeps installs small
    if not any(_which(b) for b in ("startxfce4", "mate-session", "startlxde", "gnome-session")):
        packages += ["xfce4", "xfce4-terminal", "dbus-x11"]

    code, out = await _run(
        ["sudo", "-E", "apt-get", "install", "-y", "--no-install-recommends", *packages],
        timeout=1800.0,
    )
    if code != 0:
        raise RuntimeError(f"Package install failed: {out[-800:] if out else 'unknown error'}")

    logger.info("Remote desktop packages installed: {}", ", ".join(packages))
    return await get_status()


# ─── Password / xstartup provisioning ────────────────────────────────────────


async def _ensure_provisioned() -> str:
    """Ensure the VNC dir, password and xstartup exist. Returns the plaintext pw."""
    await _run(["sudo", "mkdir", "-p", str(VNC_DIR)], timeout=5.0)

    password = None
    if PLAIN_FILE.exists():
        try:
            password = PLAIN_FILE.read_text().strip() or None
        except Exception:
            password = None

    if not password or not PASSWD_FILE.exists():
        password = _generate_password()
        # vncpasswd -f reads the plaintext on stdin and emits the obfuscated blob
        code, out = await _run(["vncpasswd", "-f"], timeout=10.0, input_text=f"{password}\n")
        if code != 0 or not out:
            raise RuntimeError("Failed to generate VNC password (is tigervnc installed?)")
        # Write both files with tight permissions via a root shell
        await _run([
            "sudo", "sh", "-c",
            f"umask 077; printf '%s' {_shq(out)} > {PASSWD_FILE} && "
            f"printf '%s' {_shq(password)} > {PLAIN_FILE} && "
            f"chmod 600 {PASSWD_FILE} {PLAIN_FILE}",
        ], timeout=10.0)

    # Always (re)write xstartup so DE detection stays current
    await _run([
        "sudo", "sh", "-c",
        f"cat > {XSTARTUP} <<'EOF'\n{_XSTARTUP_BODY}EOF\nchmod 755 {XSTARTUP}",
    ], timeout=10.0)

    # The service runs as sudo-pi; make sure it owns the dir
    await _run(["sudo", "chown", "-R", "sudo-pi:sudo-pi", str(VNC_DIR)], timeout=10.0)
    return password or "unknown"


def _generate_password() -> str:
    # VNC passwords are truncated to 8 chars by the protocol
    alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _shq(value: str) -> str:
    """Single-quote a string for safe embedding in a shell -c command."""
    return "'" + value.replace("'", "'\\''") + "'"


# ─── Start / stop ────────────────────────────────────────────────────────────


async def _kill_everything() -> None:
    """Aggressively tear down VNC + websockify and clear stale X locks.

    The Xvnc auth blacklist ("too many tries") lives in the Xvnc process's
    memory — the ONLY reliable reset is making sure the old process is
    actually dead. `vncserver -kill` alone leaves zombies behind when the
    pid file is stale, so we follow up with pkill and lock-file cleanup.
    """
    # 1. Polite kill via the wrapper (cleans its own pid/log bookkeeping)
    await _run(
        ["sudo", "-u", "sudo-pi", "env", "HOME=/opt/sudo-pi",
         "vncserver", "-kill", f":{DISPLAY_NUM}"],
        timeout=15.0,
    )

    # 2. Force-kill anything still holding the display or the WS port.
    #    Match every Xvnc flavor (Xtigervnc, Xvnc, vncserver wrapper).
    for pattern in (
        f"Xtigervnc.*:{DISPLAY_NUM}",
        f"Xvnc.*:{DISPLAY_NUM}",
        f"vncserver.*:{DISPLAY_NUM}",
        f"websockify.*{WEBSOCKIFY_PORT}",
    ):
        await _run(["sudo", "pkill", "-f", pattern], timeout=10.0)

    # Give SIGTERM a moment, then SIGKILL survivors
    await asyncio.sleep(0.5)
    for pattern in (
        f"Xtigervnc.*:{DISPLAY_NUM}",
        f"Xvnc.*:{DISPLAY_NUM}",
        f"websockify.*{WEBSOCKIFY_PORT}",
    ):
        await _run(["sudo", "pkill", "-9", "-f", pattern], timeout=10.0)

    # 3. Remove stale X locks + pid files that block the next startup
    await _run([
        "sudo", "sh", "-c",
        f"rm -f /tmp/.X{DISPLAY_NUM}-lock /tmp/.X11-unix/X{DISPLAY_NUM} "
        f"{WEBSOCKIFY_PID} {VNC_DIR}/*.pid 2>/dev/null; true",
    ], timeout=10.0)


async def _wait_for_port(port: int, attempts: int = 10) -> bool:
    """Poll until something is listening on localhost:<port>."""
    for _ in range(attempts):
        code, out = await _run(["ss", "-ltn"], timeout=5.0)
        if code == 0 and f":{port}" in out:
            return True
        await asyncio.sleep(0.5)
    return False


async def _start_vnc() -> None:
    # Universally-supported arguments only:
    #   bare `-localhost` (no yes/no value — older wrappers choke on it),
    #   no Blacklist* flags (missing from several TigerVNC builds).
    code, out = await _run(
        [
            "sudo", "-u", "sudo-pi",
            "env", "HOME=/opt/sudo-pi",
            "vncserver", f":{DISPLAY_NUM}",
            "-geometry", GEOMETRY,
            "-depth", DEPTH,
            "-localhost",
            "-rfbauth", str(PASSWD_FILE),
        ],
        timeout=30.0,
    )
    if code != 0 and "already" not in out.lower():
        raise RuntimeError(f"Failed to start VNC server: {out[-400:]}")

    if not await _wait_for_port(VNC_PORT):
        raise RuntimeError(
            f"VNC server did not start listening on port {VNC_PORT}. "
            f"Last output: {out[-300:] if out else 'none'}"
        )


async def _start_websockify() -> None:
    if await _pgrep(f"websockify.*{WEBSOCKIFY_PORT}"):
        return
    # Detached background process; bridge WS 6080 → VNC 5901 on loopback only
    await _run([
        "sudo", "sh", "-c",
        f"nohup websockify 127.0.0.1:{WEBSOCKIFY_PORT} 127.0.0.1:{VNC_PORT} "
        f"> /var/log/sudo-pi-websockify.log 2>&1 & echo $! > {WEBSOCKIFY_PID}",
    ], timeout=10.0)
    await _wait_for_port(WEBSOCKIFY_PORT, attempts=6)


async def start() -> dict:
    if not (_which("vncserver") or _which("Xtigervnc")):
        raise RuntimeError("TigerVNC is not installed — install remote desktop first")
    if not _which("websockify"):
        raise RuntimeError("websockify is not installed — install remote desktop first")

    # Always start from a clean slate — a half-dead previous session (or a
    # blacklisted Xvnc) is exactly what causes "too many tries" loops.
    await _kill_everything()

    await _ensure_provisioned()
    await _start_vnc()
    await _start_websockify()

    logger.info("Remote desktop started on display :{} (ws :{})", DISPLAY_NUM, WEBSOCKIFY_PORT)
    return await get_status()


async def stop() -> dict:
    await _kill_everything()
    logger.info("Remote desktop stopped")
    return await get_status()


async def restart() -> dict:
    await stop()
    await asyncio.sleep(1.0)
    return await start()


async def regenerate_password() -> dict:
    """Force a new VNC password and restart so it takes effect."""
    running = (await get_status())["running"]
    try:
        PLAIN_FILE.unlink(missing_ok=True)
        await _run(["sudo", "rm", "-f", str(PASSWD_FILE), str(PLAIN_FILE)], timeout=5.0)
    except Exception:
        pass
    await _ensure_provisioned()
    if running:
        return await restart()
    return await get_status()
