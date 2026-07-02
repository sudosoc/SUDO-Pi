from __future__ import annotations

import asyncio
import shutil
import time
from datetime import datetime, timezone, timedelta

from loguru import logger
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.uptime import UptimeRecord, UptimeSummary

MONITORED_SERVICES = [
    "sudo-pi-backend",
    "nginx",
    "hostapd",
    "dnsmasq",
    "avahi-daemon",
    "fail2ban",
    "NetworkManager",
    "ssh",
    "sshd",
]

# Conditionally include docker if binary is present
if shutil.which("docker"):
    MONITORED_SERVICES.append("docker")

_PERIODS = {
    "24h": 24,
    "7d":  24 * 7,
    "30d": 24 * 30,
}


async def check_service(service_name: str) -> dict:
    """Check a single systemd service status and measure response time."""
    t0 = time.monotonic()
    status = "failed"
    response_ms: int | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "is-active", "--quiet", service_name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=5.0)
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        response_ms = elapsed_ms
        status = "up" if proc.returncode == 0 else "down"
    except asyncio.TimeoutError:
        status = "failed"
        response_ms = 5000
    except FileNotFoundError:
        # systemctl not available (dev/Windows environment)
        status = "unknown"
        response_ms = None
    except Exception as exc:
        logger.debug("Service check error for {}: {}", service_name, exc)
        status = "failed"

    return {
        "service_name": service_name,
        "status": status,
        "response_ms": response_ms,
        "checked_at": datetime.now(timezone.utc),
    }


async def check_all_services() -> list[dict]:
    """Check all monitored services concurrently."""
    results = await asyncio.gather(
        *[check_service(s) for s in MONITORED_SERVICES],
        return_exceptions=False,
    )
    return list(results)


async def record_check(db: AsyncSession, service_name: str, status: str, response_ms: int | None) -> None:
    """Store a UptimeRecord in the database."""
    record = UptimeRecord(
        service_name=service_name,
        status=status,
        checked_at=datetime.now(timezone.utc),
        response_ms=response_ms,
    )
    db.add(record)
    # No commit here — caller handles transaction


async def calculate_uptime(db: AsyncSession, service_name: str, hours: int) -> tuple[float, int, int]:
    """Return (uptime_pct, checks_total, checks_up) for the last N hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(UptimeRecord.status)
        .where(UptimeRecord.service_name == service_name)
        .where(UptimeRecord.checked_at >= since)
    )
    statuses = result.scalars().all()
    total = len(statuses)
    if total == 0:
        return 100.0, 0, 0
    up = sum(1 for s in statuses if s == "up")
    return round((up / total) * 100, 2), total, up


async def _get_last_down(db: AsyncSession, service_name: str) -> datetime | None:
    result = await db.execute(
        select(UptimeRecord.checked_at)
        .where(UptimeRecord.service_name == service_name)
        .where(UptimeRecord.status != "up")
        .order_by(UptimeRecord.checked_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_avg_response_ms(db: AsyncSession, service_name: str, hours: int = 24) -> float | None:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(func.avg(UptimeRecord.response_ms))
        .where(UptimeRecord.service_name == service_name)
        .where(UptimeRecord.checked_at >= since)
        .where(UptimeRecord.response_ms.is_not(None))
    )
    avg = result.scalar_one_or_none()
    return round(avg, 1) if avg is not None else None


async def refresh_summaries(db: AsyncSession, check_results: list[dict]) -> None:
    """Recompute and upsert UptimeSummary rows after a batch of checks."""
    now = datetime.now(timezone.utc)
    service_names = {r["service_name"] for r in check_results}

    for service_name in service_names:
        for period, hours in _PERIODS.items():
            pct, total, up = await calculate_uptime(db, service_name, hours)
            last_down = await _get_last_down(db, service_name)

            # Upsert: find existing summary
            result = await db.execute(
                select(UptimeSummary)
                .where(UptimeSummary.service_name == service_name)
                .where(UptimeSummary.period == period)
            )
            summary = result.scalar_one_or_none()
            if summary is None:
                summary = UptimeSummary(
                    service_name=service_name,
                    period=period,
                    uptime_pct=pct,
                    checks_total=total,
                    checks_up=up,
                    last_down_at=last_down,
                    updated_at=now,
                )
                db.add(summary)
            else:
                summary.uptime_pct = pct
                summary.checks_total = total
                summary.checks_up = up
                summary.last_down_at = last_down
                summary.updated_at = now


async def get_uptime_summary(db: AsyncSession) -> list[dict]:
    """Return all monitored services with current status + uptime percentages."""
    # Run a fresh live check so current_status is always real-time
    live = await check_all_services()
    live_map = {r["service_name"]: r for r in live}

    # Load cached summaries from DB
    result = await db.execute(select(UptimeSummary))
    summaries = result.scalars().all()

    # Build index: {service_name: {period: UptimeSummary}}
    summary_idx: dict[str, dict[str, UptimeSummary]] = {}
    for s in summaries:
        summary_idx.setdefault(s.service_name, {})[s.period] = s

    output: list[dict] = []
    for service_name in MONITORED_SERVICES:
        live_data = live_map.get(service_name, {"status": "unknown", "response_ms": None})
        svc_summaries = summary_idx.get(service_name, {})

        avg_ms = await _get_avg_response_ms(db, service_name)

        s24 = svc_summaries.get("24h")
        s7d = svc_summaries.get("7d")
        last_down = s24.last_down_at if s24 else None

        output.append({
            "service_name": service_name,
            "current_status": live_data["status"],
            "response_ms": live_data.get("response_ms"),
            "response_ms_avg": avg_ms,
            "uptime_24h": s24.uptime_pct if s24 else None,
            "uptime_7d":  s7d.uptime_pct if s7d else None,
            "last_down_at": last_down.isoformat() if last_down else None,
        })

    return output


async def get_service_history(db: AsyncSession, service_name: str, hours: int = 24) -> list[dict]:
    """Return UptimeRecord list for charting (status by time)."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(UptimeRecord)
        .where(UptimeRecord.service_name == service_name)
        .where(UptimeRecord.checked_at >= since)
        .order_by(UptimeRecord.checked_at.asc())
    )
    records = result.scalars().all()
    return [
        {
            "checked_at": r.checked_at.isoformat(),
            "status": r.status,
            "response_ms": r.response_ms,
        }
        for r in records
    ]


async def run_uptime_check(db: AsyncSession) -> list[dict]:
    """Full uptime check cycle: check services, record, refresh summaries."""
    results = await check_all_services()
    for r in results:
        if r["status"] in ("up", "down", "failed"):
            await record_check(db, r["service_name"], r["status"], r.get("response_ms"))
    await refresh_summaries(db, results)
    await db.commit()
    return results


async def prune_old_uptime_records(db: AsyncSession, keep_days: int = 30) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    await db.execute(
        delete(UptimeRecord).where(UptimeRecord.checked_at < cutoff)
    )
    await db.commit()
