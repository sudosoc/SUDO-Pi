from __future__ import annotations

from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.metrics import MetricsSnapshot
from app.services.system_service import get_full_system_stats


async def record_snapshot(db: AsyncSession) -> None:
    """Called by the background loop every 60 seconds."""
    stats = await get_full_system_stats()
    # Get root disk percent
    disk_pct = next((d.percent for d in stats.disks if d.mountpoint == "/"), None)
    # Sum all network interfaces
    total_rx = sum(i.bytes_recv for i in stats.network_interfaces)
    total_tx = sum(i.bytes_sent for i in stats.network_interfaces)
    snap = MetricsSnapshot(
        recorded_at=datetime.now(timezone.utc),
        cpu_percent=stats.cpu.percent,
        ram_percent=stats.memory.percent,
        disk_percent=disk_pct,
        temperature_cpu=stats.temperature.cpu,
        net_rx_bytes=total_rx,
        net_tx_bytes=total_tx,
    )
    db.add(snap)
    await db.commit()


async def get_history(db: AsyncSession, hours: int = 1) -> list[dict]:
    """Return snapshots from the last N hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(MetricsSnapshot)
        .where(MetricsSnapshot.recorded_at >= since)
        .order_by(MetricsSnapshot.recorded_at.asc())
    )
    rows = result.scalars().all()
    return [
        {
            "t": int(r.recorded_at.timestamp() * 1000),  # milliseconds for JS
            "cpu": round(r.cpu_percent, 1),
            "ram": round(r.ram_percent, 1),
            "disk": round(r.disk_percent, 1) if r.disk_percent is not None else None,
            "temp": round(r.temperature_cpu, 1) if r.temperature_cpu is not None else None,
            "rx": r.net_rx_bytes,
            "tx": r.net_tx_bytes,
        }
        for r in rows
    ]


async def prune_old_snapshots(db: AsyncSession, keep_days: int = 7) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    await db.execute(delete(MetricsSnapshot).where(MetricsSnapshot.recorded_at < cutoff))
    await db.commit()
