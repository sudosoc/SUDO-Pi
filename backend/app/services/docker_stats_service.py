from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone, timedelta

from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.docker_stats_history import DockerStatsHistory

COLLECTION_INTERVAL = 30  # seconds between docker stats samples


def _parse_bytes(s: str) -> float:
    """Parse docker's '1.5MB', '2.3GB', '512kB' etc. into megabytes."""
    s = s.strip().upper()
    m = re.match(r"^([\d.]+)\s*([KMGT]?B)$", s)
    if not m:
        return 0.0
    val = float(m.group(1))
    unit = m.group(2)
    factors = {"B": 1 / 1_048_576, "KB": 1 / 1024, "MB": 1, "GB": 1024, "TB": 1_048_576}
    return val * factors.get(unit, 1)


def _parse_percent(s: str) -> float:
    """'12.34%' → 12.34"""
    return float(s.rstrip("%")) if "%" in s else 0.0


async def _run(cmd: list[str], timeout: float = 15.0) -> tuple[int, str]:
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


async def _collect_stats() -> list[dict]:
    """Run 'docker stats --no-stream' and return parsed rows."""
    rc, out = await _run([
        "docker", "stats", "--no-stream",
        "--format", (
            '{"id":"{{.Container}}","name":"{{.Name}}",'
            '"cpu":"{{.CPUPerc}}","mem_usage":"{{.MemUsage}}",'
            '"net_io":"{{.NetIO}}"}'
        ),
    ])
    if rc != 0:
        return []

    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Parse memory: "128MiB / 4GiB" → (used_mb, limit_mb)
        mem_parts = obj.get("mem_usage", "0 / 0").split("/")
        mem_mb = _parse_bytes(mem_parts[0]) if len(mem_parts) >= 1 else 0.0
        mem_limit_mb = _parse_bytes(mem_parts[1]) if len(mem_parts) >= 2 else 0.0

        # Parse net I/O: "1.5kB / 2.3MB" → (rx_mb, tx_mb)
        net_parts = obj.get("net_io", "0 / 0").split("/")
        net_rx_mb = _parse_bytes(net_parts[0]) if len(net_parts) >= 1 else 0.0
        net_tx_mb = _parse_bytes(net_parts[1]) if len(net_parts) >= 2 else 0.0

        rows.append({
            "id": obj.get("id", "")[:12],
            "name": obj.get("name", "").lstrip("/"),
            "cpu_percent": _parse_percent(obj.get("cpu", "0%")),
            "mem_mb": mem_mb,
            "mem_limit_mb": mem_limit_mb,
            "net_rx_mb": net_rx_mb,
            "net_tx_mb": net_tx_mb,
        })

    return rows


async def collect(db: AsyncSession) -> None:
    """Collect one snapshot of Docker container stats."""
    stats = await _collect_stats()
    now = datetime.now(timezone.utc)

    for s in stats:
        row = DockerStatsHistory(
            container_id=s["id"],
            container_name=s["name"],
            timestamp=now,
            cpu_percent=s["cpu_percent"],
            mem_mb=s["mem_mb"],
            mem_limit_mb=s["mem_limit_mb"],
            net_rx_mb=s["net_rx_mb"],
            net_tx_mb=s["net_tx_mb"],
        )
        db.add(row)

    await db.commit()

    # Prune records older than 24 hours
    cutoff = now - timedelta(hours=24)
    await db.execute(delete(DockerStatsHistory).where(DockerStatsHistory.timestamp < cutoff))
    await db.commit()


async def get_history(db: AsyncSession, container_id: str, minutes: int = 60) -> list[dict]:
    """Return stats history for a container (last N minutes)."""
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    # Match on first 12 chars of container ID
    result = await db.execute(
        select(DockerStatsHistory)
        .where(
            DockerStatsHistory.container_id.like(f"{container_id[:12]}%"),
            DockerStatsHistory.timestamp >= since,
        )
        .order_by(DockerStatsHistory.timestamp.asc())
    )
    return [r.to_dict() for r in result.scalars().all()]


async def get_latest(db: AsyncSession) -> list[dict]:
    """Return the most recent stats row per container (for live status view)."""
    from sqlalchemy import func as sqlfunc

    # Subquery for max timestamp per container
    sub = (
        select(
            DockerStatsHistory.container_id,
            sqlfunc.max(DockerStatsHistory.timestamp).label("max_ts"),
        )
        .group_by(DockerStatsHistory.container_id)
        .subquery()
    )
    result = await db.execute(
        select(DockerStatsHistory).join(
            sub,
            (DockerStatsHistory.container_id == sub.c.container_id)
            & (DockerStatsHistory.timestamp == sub.c.max_ts),
        )
    )
    return [r.to_dict() for r in result.scalars().all()]


async def collection_loop() -> None:
    """Background task: collect Docker stats every 30 seconds."""
    from app.core.database import AsyncSessionFactory

    while True:
        await asyncio.sleep(COLLECTION_INTERVAL)
        try:
            async with AsyncSessionFactory() as db:
                await collect(db)
        except Exception as exc:  # noqa: BLE001
            logger.error("docker_stats_service collection_loop error: {}", exc)
