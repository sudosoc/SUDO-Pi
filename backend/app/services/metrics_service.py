from __future__ import annotations

import math
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


async def collect_snapshot() -> dict:
    """Collect a live snapshot without persisting it — used for WS streaming."""
    stats = await get_full_system_stats()
    disk_pct = next((d.percent for d in stats.disks if d.mountpoint == "/"), None)
    total_rx = sum(i.bytes_recv for i in stats.network_interfaces)
    total_tx = sum(i.bytes_sent for i in stats.network_interfaces)
    return {
        "cpu":  round(stats.cpu.percent, 1),
        "ram":  round(stats.memory.percent, 1),
        "disk": round(disk_pct, 1) if disk_pct is not None else None,
        "temp": round(stats.temperature.cpu, 1) if stats.temperature.cpu is not None else None,
        "rx":   total_rx,
        "tx":   total_tx,
        "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
    }


def _mean_std(values: list[float]) -> tuple[float, float]:
    """Return (mean, population stddev) for a list of floats."""
    n = len(values)
    if n == 0:
        return 0.0, 0.0
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    return mean, math.sqrt(variance)


async def detect_anomalies(db: AsyncSession) -> list[dict]:
    """
    Statistical anomaly detection using Z-score over the last 60 minutes.
    Returns anomalies where z-score > 2.5 relative to the previous 50 baseline samples.
    """
    since = datetime.now(timezone.utc) - timedelta(minutes=60)
    result = await db.execute(
        select(MetricsSnapshot)
        .where(MetricsSnapshot.recorded_at >= since)
        .order_by(MetricsSnapshot.recorded_at.asc())
    )
    snapshots = result.scalars().all()

    if len(snapshots) < 5:
        # Not enough data for meaningful statistics
        return []

    # Use all but the latest as baseline (up to 50 samples)
    baseline = snapshots[:-1][-50:]
    latest = snapshots[-1]

    metrics_config = [
        {
            "key": "cpu",
            "label": "CPU",
            "unit": "%",
            "values": [s.cpu_percent for s in baseline],
            "current": latest.cpu_percent,
            "warn_above": 80.0,
        },
        {
            "key": "ram",
            "label": "RAM",
            "unit": "%",
            "values": [s.ram_percent for s in baseline],
            "current": latest.ram_percent,
            "warn_above": 85.0,
        },
        {
            "key": "temp",
            "label": "Temperature",
            "unit": "°C",
            "values": [s.temperature_cpu for s in baseline if s.temperature_cpu is not None],
            "current": latest.temperature_cpu,
            "warn_above": 75.0,
        },
        {
            "key": "disk",
            "label": "Disk",
            "unit": "%",
            "values": [s.disk_percent for s in baseline if s.disk_percent is not None],
            "current": latest.disk_percent,
            "warn_above": 90.0,
        },
    ]

    anomalies: list[dict] = []
    for m in metrics_config:
        current = m["current"]
        if current is None:
            continue
        values = [v for v in m["values"] if v is not None]
        if len(values) < 5:
            continue

        mean, std = _mean_std(values)
        if std < 0.01:
            # Effectively constant — check absolute threshold only
            if current > m["warn_above"]:
                anomalies.append({
                    "metric": m["key"],
                    "label": m["label"],
                    "unit": m["unit"],
                    "current_value": round(current, 2),
                    "mean": round(mean, 2),
                    "stddev": round(std, 4),
                    "z_score": None,
                    "severity": "warning" if current < m["warn_above"] * 1.15 else "critical",
                    "message": f"{m['label']} is above safe threshold ({current:.1f}{m['unit']})",
                })
            continue

        z = (current - mean) / std

        if z > 2.5:
            severity = "critical" if z > 3.5 else "warning"
            anomalies.append({
                "metric": m["key"],
                "label": m["label"],
                "unit": m["unit"],
                "current_value": round(current, 2),
                "mean": round(mean, 2),
                "stddev": round(std, 4),
                "z_score": round(z, 2),
                "severity": severity,
                "message": (
                    f"{m['label']} is unusually high: {current:.1f}{m['unit']} "
                    f"(baseline avg {mean:.1f}{m['unit']}, z={z:.1f})"
                ),
            })

    return anomalies


async def get_anomaly_history(db: AsyncSession, hours: int = 24) -> list[dict]:
    """
    Replay anomaly detection over the historical window, returning one entry per
    snapshot that triggered at least one anomaly.  Uses a sliding 50-sample baseline
    so older data points have their own context window.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(MetricsSnapshot)
        .where(MetricsSnapshot.recorded_at >= since)
        .order_by(MetricsSnapshot.recorded_at.asc())
    )
    snapshots = result.scalars().all()

    if len(snapshots) < 6:
        return []

    history: list[dict] = []
    for i in range(5, len(snapshots)):
        baseline = snapshots[max(0, i - 50):i]
        snap = snapshots[i]

        metrics_config = [
            {
                "key": "cpu", "label": "CPU", "unit": "%",
                "values": [s.cpu_percent for s in baseline],
                "current": snap.cpu_percent,
            },
            {
                "key": "ram", "label": "RAM", "unit": "%",
                "values": [s.ram_percent for s in baseline],
                "current": snap.ram_percent,
            },
            {
                "key": "temp", "label": "Temperature", "unit": "°C",
                "values": [s.temperature_cpu for s in baseline if s.temperature_cpu is not None],
                "current": snap.temperature_cpu,
            },
            {
                "key": "disk", "label": "Disk", "unit": "%",
                "values": [s.disk_percent for s in baseline if s.disk_percent is not None],
                "current": snap.disk_percent,
            },
        ]

        triggered = []
        for m in metrics_config:
            current = m["current"]
            if current is None:
                continue
            values = [v for v in m["values"] if v is not None]
            if len(values) < 5:
                continue
            mean, std = _mean_std(values)
            if std < 0.01:
                continue
            z = (current - mean) / std
            if z > 2.5:
                triggered.append({
                    "metric": m["key"],
                    "label": m["label"],
                    "current_value": round(current, 2),
                    "mean": round(mean, 2),
                    "z_score": round(z, 2),
                    "severity": "critical" if z > 3.5 else "warning",
                })

        if triggered:
            history.append({
                "timestamp": int(snap.recorded_at.timestamp() * 1000),
                "recorded_at": snap.recorded_at.isoformat(),
                "anomalies": triggered,
            })

    return history
