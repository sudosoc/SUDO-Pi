from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import httpx
from loguru import logger

# Results stored in memory (last 20 results)
_history: list[dict] = []

_CF_BASE = "https://speed.cloudflare.com"
_DOWNLOAD_SIZE = 10 * 1024 * 1024   # 10 MB
_UPLOAD_SIZE   = 5  * 1024 * 1024   #  5 MB
_PING_COUNT    = 5


async def _fetch_meta(client: httpx.AsyncClient) -> dict:
    """Get ISP / location info from Cloudflare meta endpoint."""
    try:
        resp = await client.get(f"{_CF_BASE}/meta", timeout=8.0)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return {}


async def _measure_latency(client: httpx.AsyncClient) -> float:
    """Send _PING_COUNT HEAD requests and return average RTT in milliseconds."""
    times: list[float] = []
    for _ in range(_PING_COUNT):
        try:
            start = time.monotonic()
            await client.head(f"{_CF_BASE}/__down?bytes=0", timeout=5.0)
            times.append((time.monotonic() - start) * 1000)
        except Exception:
            pass
    if not times:
        return 0.0
    # Drop the highest outlier, average the rest
    times.sort()
    trimmed = times[:-1] if len(times) > 2 else times
    return round(sum(trimmed) / len(trimmed), 1)


async def _measure_download(client: httpx.AsyncClient) -> tuple[float, int]:
    """Stream _DOWNLOAD_SIZE bytes from Cloudflare, return (bytes_per_sec, bytes_received)."""
    try:
        start = time.monotonic()
        total = 0
        async with client.stream(
            "GET",
            f"{_CF_BASE}/__down?bytes={_DOWNLOAD_SIZE}",
            timeout=httpx.Timeout(5.0, read=60.0),
        ) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes(65536):
                total += len(chunk)
        elapsed = time.monotonic() - start
        bps = total / elapsed if elapsed > 0 else 0.0
        logger.debug("Download: {:.2f} Mbps ({} bytes in {:.1f}s)", bps / 1e6, total, elapsed)
        return bps, total
    except Exception as exc:
        logger.warning("Download measurement failed: {}", exc)
        return 0.0, 0


async def _measure_upload(client: httpx.AsyncClient) -> tuple[float, int]:
    """POST _UPLOAD_SIZE random bytes to Cloudflare, return (bytes_per_sec, bytes_sent)."""
    try:
        payload = os.urandom(_UPLOAD_SIZE)
        start   = time.monotonic()
        resp = await client.post(
            f"{_CF_BASE}/__up",
            content=payload,
            headers={"Content-Type": "application/octet-stream"},
            timeout=httpx.Timeout(5.0, write=60.0, read=10.0),
        )
        resp.raise_for_status()
        elapsed = time.monotonic() - start
        bps = len(payload) / elapsed if elapsed > 0 else 0.0
        logger.debug("Upload: {:.2f} Mbps ({} bytes in {:.1f}s)", bps / 1e6, len(payload), elapsed)
        return bps, len(payload)
    except Exception as exc:
        logger.warning("Upload measurement failed: {}", exc)
        return 0.0, 0


async def run_speedtest() -> dict:
    """
    Run a full speed test using Cloudflare's public endpoints.
    No external CLI tools required — uses httpx which is already installed.
    """
    started_at = time.time()
    logger.info("Speed test starting (Cloudflare endpoints)")

    async with httpx.AsyncClient(
        follow_redirects=True,
        headers={"User-Agent": "sudo-pi-speedtest/1.0"},
    ) as client:
        # Run sequentially: latency → download → upload
        ping_ms                     = await _measure_latency(client)
        download_bps, bytes_recv    = await _measure_download(client)
        upload_bps,   bytes_sent    = await _measure_upload(client)
        meta                        = await _fetch_meta(client)

    isp      = meta.get("asOrganization") or "Unknown"
    colo     = meta.get("colo", "")
    location = f"Cloudflare {colo}" if colo else "Cloudflare CDN"

    result = {
        "download":         download_bps,
        "upload":           upload_bps,
        "ping":             ping_ms,
        "server_name":      "Cloudflare Speed Test",
        "server_location":  location,
        "isp":              isp,
        "share_url":        None,
        "bytes_sent":       bytes_sent,
        "bytes_received":   bytes_recv,
        "timestamp":        datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - started_at, 1),
    }

    _history.insert(0, result)
    if len(_history) > 20:
        _history.pop()

    logger.info(
        "Speed test done: {:.1f} Mbps ↓ / {:.1f} Mbps ↑ / {:.0f} ms ping ({}s total)",
        download_bps / 1e6,
        upload_bps / 1e6,
        ping_ms,
        result["duration_seconds"],
    )
    return result


def get_history() -> list[dict]:
    """Return list of past speedtest results (most recent first)."""
    return list(_history)
