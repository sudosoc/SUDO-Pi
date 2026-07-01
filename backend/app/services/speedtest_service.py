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
    code, out, err = await _run(["which", "speedtest-cli"], timeout=5.0)
    if code != 0:
        logger.info("speedtest-cli not found, attempting pip3 install...")
        install_code, _, install_err = await _run(
            ["sudo", "pip3", "install", "speedtest-cli"], timeout=60.0
        )
        if install_code != 0:
            raise RuntimeError(f"speedtest-cli not installed and install failed: {install_err}")
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

    result = {
        "download_mbps": round(data["download"] / 1_000_000, 2),
        "upload_mbps": round(data["upload"] / 1_000_000, 2),
        "ping_ms": round(data["ping"], 1),
        "server_name": data["server"]["sponsor"],
        "server_country": data["server"]["country"],
        "timestamp": data["timestamp"],
        "bytes_received": data["bytes_received"],
        "bytes_sent": data["bytes_sent"],
        "duration_seconds": round(time.time() - start, 1),
    }

    _history.insert(0, result)
    if len(_history) > 20:
        _history.pop()

    logger.info(
        "Speedtest complete: {:.1f} Mbps down / {:.1f} Mbps up / {:.0f} ms ping",
        result["download_mbps"],
        result["upload_mbps"],
        result["ping_ms"],
    )
    return result


def get_history() -> list[dict]:
    """Return list of past speedtest results (most recent first)."""
    return list(_history)
