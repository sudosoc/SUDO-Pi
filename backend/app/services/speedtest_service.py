from __future__ import annotations

import asyncio
import json
import time

from loguru import logger

# Results stored in memory (last 20 results)
_history: list[dict] = []


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
        return -1, "", "timeout"
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def run_speedtest() -> dict:
    """Run speedtest-cli --json. Install if not present. Returns speed result dict."""
    # Check if speedtest-cli is installed
    code, out, _ = await _run(["which", "speedtest-cli"], timeout=5.0)
    if code != 0:
        logger.info("speedtest-cli not found, installing via venv pip...")
        install_code, _, install_err = await _run(
            ["/opt/sudo-pi/venv/bin/pip", "install", "speedtest-cli"],
            timeout=120.0,
        )
        if install_code != 0:
            raise RuntimeError(f"speedtest-cli not installed and install failed: {install_err.strip()}")
        logger.info("speedtest-cli installed successfully")

    start = time.time()
    code, out, err = await _run(
        ["speedtest-cli", "--json", "--secure"], timeout=120.0
    )
    if code != 0:
        raise RuntimeError(f"speedtest-cli failed: {err.strip() or 'unknown error'}")

    try:
        data = json.loads(out)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to parse speedtest output: {exc}") from exc

    server = data.get("server", {})
    client = data.get("client", {})
    location_parts = filter(None, [server.get("name"), server.get("country")])

    result = {
        # download / upload in raw bits/s so frontend formatMbps(bps) works correctly
        "download":        data["download"],
        "upload":          data["upload"],
        "ping":            round(data["ping"], 1),
        "server_name":     server.get("sponsor", server.get("name", "Unknown")),
        "server_location": ", ".join(location_parts) or "Unknown",
        "isp":             client.get("isp"),
        "share_url":       data.get("share"),
        "bytes_sent":      data.get("bytes_sent", 0),
        "bytes_received":  data.get("bytes_received", 0),
        "timestamp":       data.get("timestamp", ""),
        "duration_seconds": round(time.time() - start, 1),
    }

    _history.insert(0, result)
    if len(_history) > 20:
        _history.pop()

    logger.info(
        "Speedtest complete: {:.1f} Mbps down / {:.1f} Mbps up / {:.0f} ms ping",
        result["download"] / 1_000_000,
        result["upload"] / 1_000_000,
        result["ping"],
    )
    return result


def get_history() -> list[dict]:
    """Return list of past speedtest results (most recent first)."""
    return list(_history)
