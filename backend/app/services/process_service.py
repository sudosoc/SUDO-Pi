from __future__ import annotations

import re

from loguru import logger


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout)


async def list_processes() -> list[dict]:
    """Return list of running processes via ps aux."""
    code, out, _ = await _run(
        ["ps", "aux", "--no-headers", "--sort=-pcpu"],
        timeout=8.0,
    )
    if code != 0:
        return []

    processes: list[dict] = []
    for line in out.splitlines():
        parts = line.split(None, 10)
        if len(parts) < 11:
            continue
        try:
            processes.append({
                "pid":     int(parts[1]),
                "user":    parts[0],
                "cpu":     float(parts[2]),
                "mem":     float(parts[3]),
                "vsz":     int(parts[4]),
                "rss":     int(parts[5]),
                "stat":    parts[7],
                "started": parts[8],
                "time":    parts[9],
                "command": parts[10][:120],
            })
        except (ValueError, IndexError):
            continue

    return processes[:200]


async def kill_process(pid: int, signal: int = 15) -> tuple[bool, str]:
    """Send signal to process. Returns (success, error_message)."""
    if pid <= 1:
        return False, "Cannot kill init/systemd (PID <= 1)"

    code, _, err = await _run(["kill", f"-{signal}", str(pid)], timeout=5.0)
    if code != 0:
        msg = err.strip() or f"kill -{signal} {pid} failed"
        logger.warning("kill_process({}): {}", pid, msg)
        return False, msg

    logger.info("Sent signal {} to PID {}", signal, pid)
    return True, ""


async def get_process_environ(pid: int) -> tuple[dict | None, str]:
    """Read /proc/{pid}/environ and return parsed key=value dict."""
    from pathlib import Path
    environ_path = Path(f"/proc/{pid}/environ")
    try:
        raw = environ_path.read_bytes()
    except PermissionError:
        # Try with sudo cat as fallback
        code, out, err = await _run(["sudo", "cat", str(environ_path)], timeout=5.0)
        if code != 0:
            return None, f"Permission denied reading environ for PID {pid}"
        raw = out.encode(errors="replace")
    except FileNotFoundError:
        return None, f"Process {pid} no longer exists"
    except Exception as exc:
        return None, str(exc)

    env: dict[str, str] = {}
    for entry in raw.split(b"\x00"):
        if b"=" in entry:
            key, _, val = entry.partition(b"=")
            try:
                env[key.decode(errors="replace")] = val.decode(errors="replace")
            except Exception:
                continue
    return env, ""


async def get_open_ports() -> list[dict]:
    """Return open TCP/UDP listening ports via ss -tlnup."""
    ports: list[dict] = []

    for proto in ("tcp", "udp"):
        code, out, _ = await _run(
            ["ss", "-tlnup" if proto == "tcp" else "-ulnup", "--no-header"],
            timeout=8.0,
        )
        if code != 0:
            continue

        for line in out.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                local = parts[4] if proto == "tcp" else parts[3]
                # extract port from address like *:22 or 0.0.0.0:22 or :::22
                port_match = re.search(r":(\d+)$", local)
                if not port_match:
                    continue
                port = int(port_match.group(1))
                addr = local.rsplit(":", 1)[0] or "*"

                # extract process info from last column like users:(("sshd",pid=1234,fd=3))
                process_name = None
                pid = None
                proc_col = parts[-1] if "users:" in parts[-1] else ""
                pm = re.search(r'"([^"]+)",pid=(\d+)', proc_col)
                if pm:
                    process_name = pm.group(1)
                    pid = int(pm.group(2))

                ports.append({
                    "proto":   proto,
                    "port":    port,
                    "address": addr,
                    "state":   parts[1] if proto == "tcp" else "UNCONN",
                    "process": process_name,
                    "pid":     pid,
                })
            except (ValueError, IndexError):
                continue

    # deduplicate by proto+port+address
    seen: set[tuple] = set()
    unique: list[dict] = []
    for p in sorted(ports, key=lambda x: x["port"]):
        key = (p["proto"], p["port"], p["address"])
        if key not in seen:
            seen.add(key)
            unique.append(p)

    return unique
