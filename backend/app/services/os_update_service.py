from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.os_update import UpdateRun, UpdateRunStatus, UpdateSchedule, UpdateTrigger

# =============================================================================
# OS update service — apt-based system updates with scheduling.
#
# check_updates()  refreshes the apt index and caches the upgradable list.
# run_upgrade()    performs the actual upgrade and records an UpdateRun row.
# scheduler_loop() is started once at app startup and fires due schedules.
# =============================================================================

REBOOT_REQUIRED_FLAG = Path("/var/run/reboot-required")
OUTPUT_CAP_BYTES = 100 * 1024  # keep only the last 100KB of apt output

# Module-level cache of the last `apt list --upgradable` result
_cache: dict = {"checked_at": None, "packages": []}

# Day abbreviations indexed by datetime.weekday() (0 = Monday)
_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _run(cmd: list[str], timeout: float = 60.0, env: dict | None = None) -> tuple[int, str]:
    """Run a command, merging stderr into stdout. Never raises."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode or 0, out.decode(errors="replace").strip()
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return -1, "timed out"
    except FileNotFoundError:
        return 127, "command not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def _cap_output(text: str) -> str:
    """Keep only the tail of very long output."""
    encoded = text.encode(errors="replace")
    if len(encoded) <= OUTPUT_CAP_BYTES:
        return text
    tail = encoded[-OUTPUT_CAP_BYTES:].decode(errors="replace")
    return "…(output truncated)…\n" + tail


def _parse_upgradable(raw: str) -> list[dict]:
    """
    Parse `apt list --upgradable` output lines like:
      nginx/stable-security 1.22.1-9 arm64 [upgradable from: 1.22.1-8]
    """
    packages: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("Listing") or line.startswith("WARNING"):
            continue
        m = re.match(
            r"^(?P<name>[^/\s]+)/(?P<source>\S+)\s+(?P<new>\S+)\s+\S+\s+"
            r"\[upgradable from:\s*(?P<current>[^\]]+)\]",
            line,
        )
        if not m:
            continue
        source = m.group("source")
        packages.append(
            {
                "name": m.group("name"),
                "current_version": m.group("current").strip(),
                "new_version": m.group("new"),
                "source": source,
                "security": "security" in source.lower(),
            }
        )
    return packages


# ─── Check / status ──────────────────────────────────────────────────────────


async def check_updates() -> list[dict]:
    """Refresh the apt index and cache the list of upgradable packages."""
    code, out = await _run(["sudo", "apt-get", "update"], timeout=180.0)
    if code != 0:
        raise RuntimeError(f"apt-get update failed: {out[-500:] if out else 'unknown error'}")

    code, out = await _run(["apt", "list", "--upgradable"], timeout=60.0)
    if code != 0:
        raise RuntimeError(f"apt list --upgradable failed: {out[-500:] if out else 'unknown error'}")

    packages = _parse_upgradable(out)
    _cache["checked_at"] = _utcnow()
    _cache["packages"] = packages
    logger.info(
        "OS update check: {} upgradable ({} security)",
        len(packages),
        sum(1 for p in packages if p["security"]),
    )
    return packages


def get_cached_packages() -> tuple[list[dict], datetime | None]:
    return _cache["packages"], _cache["checked_at"]


def reboot_required() -> bool:
    try:
        return REBOOT_REQUIRED_FLAG.exists()
    except Exception:
        return False


async def get_status(db: AsyncSession) -> dict:
    packages, checked_at = get_cached_packages()

    stmt = select(UpdateRun).order_by(UpdateRun.started_at.desc()).limit(1)
    result = await db.execute(stmt)
    last_run = result.scalar_one_or_none()

    schedule = await _get_or_create_schedule(db)

    return {
        "upgradable_count": len(packages),
        "security_count": sum(1 for p in packages if p.get("security")),
        "last_check_at": checked_at.isoformat() if checked_at else None,
        "last_run": last_run.to_dict() if last_run else None,
        "schedule": schedule.to_dict(),
        "reboot_required": reboot_required(),
    }


# ─── Upgrade runs ────────────────────────────────────────────────────────────


def _versions_for(packages: list[str] | None) -> list[dict]:
    """Map pre-check cache entries onto {name, old_version, new_version}."""
    cached = _cache["packages"]
    if packages is None:
        selected = cached
    else:
        wanted = set(packages)
        selected = [p for p in cached if p["name"] in wanted]
    return [
        {
            "name": p["name"],
            "old_version": p["current_version"],
            "new_version": p["new_version"],
        }
        for p in selected
    ]


async def create_run(db: AsyncSession, trigger: str) -> UpdateRun:
    """Create a 'running' UpdateRun row and commit so pollers can see it."""
    run = UpdateRun(
        trigger=UpdateTrigger(trigger),
        status=UpdateRunStatus.RUNNING,
        started_at=_utcnow(),
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)
    await db.commit()
    return run


async def _perform_upgrade(db: AsyncSession, run: UpdateRun, packages: list[str] | None) -> dict:
    """Execute apt and finalize the given run row. Never raises."""
    env = {"DEBIAN_FRONTEND": "noninteractive", "PATH": "/usr/sbin:/usr/bin:/sbin:/bin"}
    if packages:
        cmd = [
            "sudo", "-E", "apt-get", "install", "-y", "--only-upgrade", *packages,
        ]
    else:
        cmd = ["sudo", "-E", "apt-get", "upgrade", "-y"]

    planned = _versions_for(packages)

    try:
        code, out = await _run(cmd, timeout=1800.0, env=env)
        run.output = _cap_output(out or "")
        run.packages_json = json.dumps(planned)
        if code == 0:
            run.status = UpdateRunStatus.SUCCESS
            # Drop upgraded packages from the cache so counts stay honest
            upgraded = {p["name"] for p in planned}
            if packages is None:
                _cache["packages"] = []
            else:
                _cache["packages"] = [
                    p for p in _cache["packages"] if p["name"] not in upgraded
                ]
            logger.info("OS upgrade run {} succeeded ({} packages)", run.id, len(planned))
        else:
            run.status = UpdateRunStatus.FAILED
            run.error = f"apt exited with code {code}"
            logger.error("OS upgrade run {} failed: exit {}", run.id, code)
    except Exception as exc:  # noqa: BLE001
        run.status = UpdateRunStatus.FAILED
        run.error = str(exc)
        logger.error("OS upgrade run {} crashed: {}", run.id, exc)

    run.finished_at = _utcnow()
    await db.flush()
    await db.commit()
    return run.to_dict()


async def run_upgrade(
    db: AsyncSession, packages: list[str] | None, trigger: str = "manual"
) -> dict:
    """Create an UpdateRun row and perform the upgrade in-line (awaits completion)."""
    run = await create_run(db, trigger)
    return await _perform_upgrade(db, run, packages)


async def execute_run_background(run_id: int, packages: list[str] | None) -> None:
    """Finish a pre-created run with its own DB session (for asyncio.create_task)."""
    from app.core.database import AsyncSessionFactory

    try:
        async with AsyncSessionFactory() as session:
            run = await session.get(UpdateRun, run_id)
            if run is None:
                logger.error("Background upgrade: run {} not found", run_id)
                return
            await _perform_upgrade(session, run, packages)
    except Exception as exc:  # noqa: BLE001
        logger.error("Background upgrade run {} failed unexpectedly: {}", run_id, exc)


async def get_run(db: AsyncSession, run_id: int) -> dict | None:
    run = await db.get(UpdateRun, run_id)
    return run.to_dict() if run else None


async def get_history(db: AsyncSession, limit: int = 20) -> list[dict]:
    stmt = select(UpdateRun).order_by(UpdateRun.started_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return [r.to_dict() for r in result.scalars().all()]


async def rollback_package(db: AsyncSession, name: str, version: str) -> dict:
    """Downgrade a package to a specific version, recorded as a rollback run."""
    if not re.match(r"^[A-Za-z0-9.+:~_-]+$", name) or not re.match(r"^[A-Za-z0-9.+:~_-]+$", version):
        raise ValueError("Invalid package name or version")

    run = await create_run(db, "rollback")
    env = {"DEBIAN_FRONTEND": "noninteractive", "PATH": "/usr/sbin:/usr/bin:/sbin:/bin"}

    try:
        code, out = await _run(
            ["sudo", "-E", "apt-get", "install", "-y", "--allow-downgrades", f"{name}={version}"],
            timeout=900.0,
            env=env,
        )
        run.output = _cap_output(out or "")
        run.packages_json = json.dumps(
            [{"name": name, "old_version": None, "new_version": version}]
        )
        if code == 0:
            run.status = UpdateRunStatus.SUCCESS
            logger.info("Rollback of {} to {} succeeded", name, version)
        else:
            run.status = UpdateRunStatus.FAILED
            run.error = f"apt exited with code {code}"
            logger.error("Rollback of {} to {} failed: exit {}", name, version, code)
    except Exception as exc:  # noqa: BLE001
        run.status = UpdateRunStatus.FAILED
        run.error = str(exc)

    run.finished_at = _utcnow()
    await db.flush()
    await db.commit()
    return run.to_dict()


# ─── Schedule ────────────────────────────────────────────────────────────────


def _compute_next_run(run_time: str, days: str) -> datetime | None:
    """Next run in UTC. run_time is interpreted as server-local time."""
    try:
        hh, mm = (int(x) for x in run_time.strip().split(":"))
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            return None
    except Exception:
        return None

    allowed: set[str] | None = None
    if days.strip().lower() != "daily":
        allowed = {d.strip().lower()[:3] for d in days.split(",") if d.strip()}
        if not allowed:
            return None

    now_local = datetime.now().astimezone()
    base = now_local.replace(hour=hh, minute=mm, second=0, microsecond=0)
    for offset in range(8):
        candidate = base + timedelta(days=offset)
        if candidate <= now_local:
            continue
        if allowed is None or _DAY_KEYS[candidate.weekday()] in allowed:
            return candidate.astimezone(timezone.utc)
    return None


async def _get_or_create_schedule(db: AsyncSession) -> UpdateSchedule:
    stmt = select(UpdateSchedule).order_by(UpdateSchedule.id).limit(1)
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()
    if schedule is None:
        schedule = UpdateSchedule()
        db.add(schedule)
        await db.flush()
        await db.refresh(schedule)
    return schedule


async def get_schedule(db: AsyncSession) -> dict:
    schedule = await _get_or_create_schedule(db)
    return schedule.to_dict()


async def update_schedule(db: AsyncSession, **fields) -> dict:
    """Upsert the single schedule row and recompute next_run_at."""
    schedule = await _get_or_create_schedule(db)

    for key in ("enabled", "run_time", "days", "security_only", "auto_reboot_if_required"):
        if key in fields and fields[key] is not None:
            setattr(schedule, key, fields[key])

    if schedule.enabled:
        next_run = _compute_next_run(schedule.run_time, schedule.days)
        if next_run is None:
            raise ValueError(
                f"Invalid schedule: run_time={schedule.run_time!r} days={schedule.days!r}"
            )
        schedule.next_run_at = next_run
    else:
        schedule.next_run_at = None

    await db.flush()
    await db.refresh(schedule)
    return schedule.to_dict()


# ─── Scheduler loop ──────────────────────────────────────────────────────────


async def scheduler_loop() -> None:
    """Background loop: fire the update schedule when due. Never dies."""
    from app.core.database import AsyncSessionFactory

    logger.info("OS update scheduler loop started")
    while True:
        await asyncio.sleep(60)
        try:
            async with AsyncSessionFactory() as db:
                schedule = await _get_or_create_schedule(db)
                await db.commit()

                if not schedule.enabled or schedule.next_run_at is None:
                    continue

                next_run = schedule.next_run_at
                if next_run.tzinfo is None:
                    next_run = next_run.replace(tzinfo=timezone.utc)
                if _utcnow() < next_run:
                    continue

                logger.info("Scheduled OS update firing (security_only={})", schedule.security_only)

                # Advance the schedule first so a crash mid-run can't loop it
                schedule.last_run_at = _utcnow()
                schedule.next_run_at = _compute_next_run(schedule.run_time, schedule.days)
                await db.flush()
                await db.commit()

                packages = await check_updates()
                if schedule.security_only:
                    targets = [p["name"] for p in packages if p.get("security")]
                    if not targets:
                        logger.info("Scheduled OS update: no security updates pending, skipping")
                        continue
                    await run_upgrade(db, targets, "scheduled")
                else:
                    if not packages:
                        logger.info("Scheduled OS update: system already up to date")
                        continue
                    await run_upgrade(db, None, "scheduled")

                if schedule.auto_reboot_if_required and reboot_required():
                    logger.warning("Scheduled OS update: reboot required — rebooting in 1 minute")
                    await _run(["sudo", "shutdown", "-r", "+1"], timeout=10.0)
        except Exception as exc:  # noqa: BLE001
            logger.error("OS update scheduler iteration failed: {}", exc)
