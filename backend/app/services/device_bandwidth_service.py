from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone, timedelta
from typing import NamedTuple

from loguru import logger
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_bandwidth import DeviceBandwidth
from app.models.device_policy import DevicePolicy

AP_INTERFACE = "wlan0"
COLLECTION_INTERVAL = 300  # 5 minutes in seconds

# Per-MAC cumulative byte counters from previous sample (kernel resets on reconnect)
_prev_rx: dict[str, int] = {}
_prev_tx: dict[str, int] = {}


class StationSample(NamedTuple):
    mac: str
    rx_bytes: int
    tx_bytes: int


async def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str]:
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


async def _get_station_samples() -> list[StationSample]:
    """Read per-station TX/RX bytes from the kernel via iw station dump."""
    rc, out = await _run(["iw", "dev", AP_INTERFACE, "station", "dump"])
    if rc != 0:
        return []

    samples: list[StationSample] = []
    current_mac = ""
    rx = tx = 0

    for line in out.splitlines():
        line = line.strip()
        mac_m = re.match(r"^Station\s+([0-9a-f:]{17})\s+\(on", line, re.I)
        if mac_m:
            if current_mac:
                samples.append(StationSample(current_mac, rx, tx))
            current_mac = mac_m.group(1).lower()
            rx = tx = 0
            continue
        if current_mac:
            rx_m = re.match(r"rx bytes:\s*(\d+)", line)
            if rx_m:
                rx = int(rx_m.group(1))
            tx_m = re.match(r"tx bytes:\s*(\d+)", line)
            if tx_m:
                tx = int(tx_m.group(1))

    if current_mac:
        samples.append(StationSample(current_mac, rx, tx))

    return samples


async def _monthly_total(db: AsyncSession, mac: str) -> tuple[float, float]:
    """Return (rx_mb, tx_mb) summed for the current calendar month."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(
            func.coalesce(func.sum(DeviceBandwidth.rx_mb), 0.0),
            func.coalesce(func.sum(DeviceBandwidth.tx_mb), 0.0),
        ).where(
            DeviceBandwidth.mac == mac,
            DeviceBandwidth.timestamp >= month_start,
        )
    )
    row = result.one()
    return float(row[0]), float(row[1])


async def collect(db: AsyncSession) -> None:
    """Collect one bandwidth sample for all connected AP stations."""
    samples = await _get_station_samples()
    if not samples:
        return

    now = datetime.now(timezone.utc)

    for s in samples:
        # Compute delta (bytes since last sample)
        prev_rx = _prev_rx.get(s.mac, 0)
        prev_tx = _prev_tx.get(s.mac, 0)

        # Handle kernel counter reset on station reconnect
        delta_rx = max(0, s.rx_bytes - prev_rx)
        delta_tx = max(0, s.tx_bytes - prev_tx)

        _prev_rx[s.mac] = s.rx_bytes
        _prev_tx[s.mac] = s.tx_bytes

        delta_rx_mb = delta_rx / (1024 * 1024)
        delta_tx_mb = delta_tx / (1024 * 1024)

        # Running monthly totals
        monthly_rx, monthly_tx = await _monthly_total(db, s.mac)
        monthly_rx += delta_rx_mb
        monthly_tx += delta_tx_mb

        row = DeviceBandwidth(
            mac=s.mac,
            timestamp=now,
            rx_mb=delta_rx_mb,
            tx_mb=delta_tx_mb,
            monthly_rx_mb=monthly_rx,
            monthly_tx_mb=monthly_tx,
        )
        db.add(row)

    await db.commit()

    # Prune records older than 30 days to keep the table bounded
    cutoff = now - timedelta(days=30)
    await db.execute(delete(DeviceBandwidth).where(DeviceBandwidth.timestamp < cutoff))
    await db.commit()


async def enforce_quotas(db: AsyncSession) -> None:
    """Block devices that have exceeded their monthly data quota."""
    from app.services.device_policy_service import upsert_policy, _get_all, apply_policies

    result = await db.execute(
        select(DevicePolicy).where(DevicePolicy.monthly_quota_mb > 0)
    )
    policies = result.scalars().all()
    if not policies:
        return

    changed = False
    for policy in policies:
        monthly_rx, monthly_tx = await _monthly_total(db, policy.mac)
        total_mb = monthly_rx + monthly_tx
        over_quota = total_mb >= policy.monthly_quota_mb

        if over_quota and not policy.blocked:
            logger.info(
                "Device {} exceeded quota ({:.1f} / {} MB) — blocking",
                policy.mac, total_mb, policy.monthly_quota_mb,
            )
            policy.blocked = True
            changed = True
        elif not over_quota and policy.blocked:
            # Only auto-unblock if it was blocked by quota (no way to distinguish
            # from manual block, so leave this as informational only — admin unblocks manually)
            pass

    if changed:
        await db.flush()
        all_policies = await _get_all(db)
        await apply_policies(all_policies)
        await db.commit()


async def get_history(db: AsyncSession, mac: str, hours: int = 24) -> list[dict]:
    """Return bandwidth history rows for a specific MAC over the last N hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(DeviceBandwidth)
        .where(DeviceBandwidth.mac == mac.lower(), DeviceBandwidth.timestamp >= since)
        .order_by(DeviceBandwidth.timestamp.asc())
    )
    return [r.to_dict() for r in result.scalars().all()]


async def get_monthly_summary(db: AsyncSession, mac: str) -> dict:
    """Return current month total for a device."""
    rx, tx = await _monthly_total(db, mac.lower())
    return {"mac": mac.lower(), "monthly_rx_mb": round(rx, 2), "monthly_tx_mb": round(tx, 2)}


async def collection_loop() -> None:
    """Background task: collect bandwidth samples every 5 minutes."""
    from app.core.database import AsyncSessionFactory

    while True:
        await asyncio.sleep(COLLECTION_INTERVAL)
        try:
            async with AsyncSessionFactory() as db:
                await collect(db)
                await enforce_quotas(db)
        except Exception as exc:  # noqa: BLE001
            logger.error("device_bandwidth_service collection_loop error: {}", exc)
