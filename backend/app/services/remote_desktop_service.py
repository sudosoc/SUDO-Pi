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


def _passwd_file_valid() -> bool:
    """A TigerVNC obfuscated password file is exactly 8 raw bytes.

    Anything else (0 bytes, mojibake from a past text-decode bug, etc.) is
    corrupt and guarantees "Authentication failed" — regenerate it.
    """
    try:
        return PASSWD_FILE.exists() and PASSWD_FILE.stat().st_size == 8
    except Exception:
        return False


async def _ensure_provisioned() -> str:
    """Ensure the VNC dir, password and xstartup exist. Returns the plaintext pw.

    CRITICAL: `vncpasswd -f` emits BINARY data on stdout. It must never pass
    through Python's text decoding (which mangles it irreversibly) — so the
    whole generation is a single shell pipeline that writes straight to disk:
        printf '%s\\n' <pw> | vncpasswd -f > passwd
    """
    await _run(["sudo", "mkdir", "-p", str(VNC_DIR)], timeout=5.0)

    password = None
    if PLAIN_FILE.exists():
        try:
            password = PLAIN_FILE.read_text().strip() or None
        except Exception:
            password = None

    # Regenerate when anything is missing OR the passwd blob is corrupt
    # (self-heals installs written by the old decode-then-printf code).
    if not password or not _passwd_file_valid():
        password = _generate_password()
        # One root shell, binary goes pipe → file, no Python in between.
        code, out = await _run([
            "sudo", "sh", "-c",
            f"umask 077; "
            f"printf '%s\\n' {_shq(password)} | vncpasswd -f > {PASSWD_FILE} && "
            f"printf '%s' {_shq(password)} > {PLAIN_FILE} && "
            f"chmod 600 {PASSWD_FILE} {PLAIN_FILE}",
        ], timeout=15.0)
        if code != 0:
            raise RuntimeError(
                f"Failed to generate VNC password (is tigervnc installed?): {out[-200:]}"
            )
        # chown before validating so the size check can't race ownership
        await _run(["sudo", "chown", "sudo-pi:sudo-pi", str(PASSWD_FILE), str(PLAIN_FILE)], timeout=5.0)
        if not _passwd_file_valid():
            raise RuntimeError(
                "vncpasswd produced an invalid password file "
                f"(expected 8 bytes at {PASSWD_FILE})"
            )
        logger.info("VNC password (re)generated — passwd blob is valid")

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


async def _port_pids(port: int) -> list[str]:
    """Return PIDs listening on / connected to localhost:<port>, best-effort.

    Tries `ss -ltnp` (parses the pid=... field), which is present on every
    modern Pi. Never raises — an empty list just means "nothing found".
    """
    pids: set[str] = set()
    code, out = await _run(["sudo", "ss", "-tanp"], timeout=6.0)
    if code == 0 and out:
        for line in out.splitlines():
            if f":{port}" not in line:
                continue
            for m in re.finditer(r"pid=(\d+)", line):
                pids.add(m.group(1))
    return sorted(pids)


async def _free_port(port: int) -> None:
    """Kill whatever holds <port>, by process identity — name-independent.

    This is the bulletproof part: the auth blacklist lives inside the Xvnc
    process, so the port MUST be released by killing that exact process,
    regardless of what it's called (Xtigervnc / Xvnc / a wrapper).
    """
    # fuser is the simplest reliable killer when psmisc is present
    await _run(["sudo", "fuser", "-k", f"{port}/tcp"], timeout=8.0)
    # Fallback: kill by PID discovered via ss (covers boxes without fuser)
    for pid in await _port_pids(port):
        await _run(["sudo", "kill", "-9", pid], timeout=5.0)


async def _kill_everything() -> None:
    """Aggressively tear down VNC + websockify and clear stale X locks.

    The Xvnc auth blacklist ("too many tries") lives in the Xvnc process's
    memory — the ONLY reliable reset is making sure the old process is
    actually dead. We attack it three ways so it can't survive a restart:
      1. the polite `vncserver -kill` (cleans the wrapper's own bookkeeping)
      2. pkill by every known name pattern
      3. kill by whoever is holding ports 5901 / 6080 (name-independent)
    then clear the X lock/socket/pid files that would block the next start.
    """
    # 1. Polite kill via the wrapper
    await _run(
        ["sudo", "-u", "sudo-pi", "env", "HOME=/opt/sudo-pi",
         "vncserver", "-kill", f":{DISPLAY_NUM}"],
        timeout=15.0,
    )

    # 2. Name-based kills (TERM then, after a beat, KILL)
    name_patterns = (
        f"Xtigervnc.*:{DISPLAY_NUM}",
        f"Xvnc.*:{DISPLAY_NUM}",
        f"vncserver.*:{DISPLAY_NUM}",
        f"[Xx]vnc.*-rfbport {VNC_PORT}",
        f"websockify.*{WEBSOCKIFY_PORT}",
    )
    for pattern in name_patterns:
        await _run(["sudo", "pkill", "-f", pattern], timeout=8.0)
    await asyncio.sleep(0.5)
    for pattern in name_patterns:
        await _run(["sudo", "pkill", "-9", "-f", pattern], timeout=8.0)

    # 3. Port-based kills — the reliable backstop when names don't match
    await _free_port(VNC_PORT)
    await _free_port(WEBSOCKIFY_PORT)

    # 4. Remove stale X locks + pid files that block the next startup
    await _run([
        "sudo", "sh", "-c",
        f"rm -f /tmp/.X{DISPLAY_NUM}-lock /tmp/.X11-unix/X{DISPLAY_NUM} "
        f"{WEBSOCKIFY_PID} {VNC_DIR}/*.pid {VNC_DIR}/*.log 2>/dev/null; true",
    ], timeout=10.0)


async def _wait_for_port(port: int, attempts: int = 20) -> bool:
    """Poll until something is listening on localhost:<port>."""
    for _ in range(attempts):
        code, out = await _run(["ss", "-ltn"], timeout=5.0)
        if code == 0 and f":{port}" in out:
            return True
        await asyncio.sleep(0.5)
    return False


async def _wait_for_port_free(port: int, attempts: int = 20) -> bool:
    """Poll until nothing is listening on localhost:<port>.

    Starting Xvnc while the old process still holds 5901 makes the new one
    fail to bind (or silently reuse the blacklisted session), so we block
    until the port is genuinely free before (re)starting.
    """
    for _ in range(attempts):
        code, out = await _run(["ss", "-ltn"], timeout=5.0)
        if code == 0 and f":{port}" not in out:
            return True
        # Keep hammering the holder while we wait
        await _free_port(port)
        await asyncio.sleep(0.5)
    return False


async def _start_vnc() -> None:
    # Universally-supported arguments only:
    #   bare `-localhost` (no yes/no value — older wrappers choke on it),
    #   no Blacklist* flags (missing from several TigerVNC builds).
    # A fresh process has an empty auth blacklist, which is the whole point
    # of the aggressive teardown that runs before this.
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
    # Detached background process; bridge WS 6080 → VNC 5901 on loopback only
    await _run([
        "sudo", "sh", "-c",
        f"nohup websockify 127.0.0.1:{WEBSOCKIFY_PORT} 127.0.0.1:{VNC_PORT} "
        f"> /var/log/sudo-pi-websockify.log 2>&1 & echo $! > {WEBSOCKIFY_PID}",
    ], timeout=10.0)
    if not await _wait_for_port(WEBSOCKIFY_PORT, attempts=12):
        raise RuntimeError(
            f"websockify did not start listening on port {WEBSOCKIFY_PORT}. "
            f"Check /var/log/sudo-pi-websockify.log"
        )


async def start() -> dict:
    if not (_which("vncserver") or _which("Xtigervnc")):
        raise RuntimeError("TigerVNC is not installed — install remote desktop first")
    if not _which("websockify"):
        raise RuntimeError("websockify is not installed — install remote desktop first")

    # Always start from a clean slate — a half-dead previous session (or a
    # blacklisted Xvnc) is exactly what causes "too many tries" loops.
    await _kill_everything()

    # Do NOT start until the ports are actually released, or the new Xvnc
    # inherits the old (blacklisted) session's socket.
    await _wait_for_port_free(VNC_PORT)
    await _wait_for_port_free(WEBSOCKIFY_PORT)

    await _ensure_provisioned()
    await _start_vnc()
    await _start_websockify()

    logger.info("Remote desktop started on display :{} (ws :{})", DISPLAY_NUM, WEBSOCKIFY_PORT)
    return await get_status()


async def stop() -> dict:
    await _kill_everything()
    # Confirm the ports are free so the UI reports an honest "stopped"
    await _wait_for_port_free(VNC_PORT, attempts=8)
    await _wait_for_port_free(WEBSOCKIFY_PORT, attempts=8)
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
