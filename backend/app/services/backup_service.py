from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import socket
import tarfile
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.backup import BackupRecord, BackupSchedule, BackupStatus, BackupType

# ─── Constants ────────────────────────────────────────────────────────────────

BACKUP_DIR = Path("/opt/sudo-pi/backups")
DB_PATH = Path("/opt/sudo-pi/backend/sudo_pi.db")
APP_ENV_PATH = Path("/opt/sudo-pi/backend/.env")
ETC_SUDOPI = Path("/etc/sudo-pi")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="backup")

# ─── Internal helpers ─────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_backup_dir() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _make_archive(archive_path: Path, sources: list[tuple[Path, str]]) -> None:
    """
    Create a gzipped tar archive.

    sources is a list of (source_path, arcname_prefix) tuples.
    source_path may be a file or directory. arcname_prefix is the prefix
    inside the archive (use "" to place at root).
    """
    with tarfile.open(archive_path, "w:gz") as tar:
        for src, prefix in sources:
            if not src.exists():
                logger.warning("Backup source does not exist, skipping: {}", src)
                continue
            arcname = str(prefix / src.name) if prefix else src.name
            tar.add(str(src), arcname=arcname, recursive=True)


def _parse_cron_next_run(expr: str) -> datetime | None:
    """
    Minimal cron next-run calculator for standard 5-field expressions.
    Supports * and numeric values only (no ranges/steps for simplicity).
    Returns the next datetime after now (UTC) when the job should fire.
    """
    try:
        from datetime import timedelta
        parts = expr.strip().split()
        if len(parts) != 5:
            return None
        minute, hour, dom, month, dow = parts

        now = _utcnow().replace(second=0, microsecond=0)
        candidate = now + timedelta(minutes=1)

        for _ in range(525960):  # max 1 year of minutes
            m_ok = minute == "*" or candidate.minute == int(minute)
            h_ok = hour == "*" or candidate.hour == int(hour)
            dom_ok = dom == "*" or candidate.day == int(dom)
            mon_ok = month == "*" or candidate.month == int(month)
            dow_ok = dow == "*" or candidate.weekday() == (int(dow) % 7)

            if m_ok and h_ok and dom_ok and mon_ok and dow_ok:
                return candidate
            candidate += timedelta(minutes=1)
        return None
    except Exception:
        return None


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 30.0) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout)


async def _enforce_keep_count(db: AsyncSession, backup_type: BackupType, keep_count: int) -> None:
    """Delete oldest completed backups beyond keep_count."""
    stmt = (
        select(BackupRecord)
        .where(
            BackupRecord.backup_type == backup_type,
            BackupRecord.status == BackupStatus.COMPLETED,
        )
        .order_by(BackupRecord.started_at.desc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    to_delete = records[keep_count:]
    for rec in to_delete:
        try:
            if rec.path and Path(rec.path).exists():
                Path(rec.path).unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("Failed to delete backup file {}: {}", rec.path, exc)
        await db.delete(rec)

    if to_delete:
        logger.info("Pruned {} old {} backups", len(to_delete), backup_type.value)


# ─── Public API ───────────────────────────────────────────────────────────────


async def list_backups(db: AsyncSession) -> list[dict]:
    stmt = select(BackupRecord).order_by(BackupRecord.started_at.desc())
    result = await db.execute(stmt)
    return [r.to_dict() for r in result.scalars().all()]


async def get_backup_by_id(db: AsyncSession, backup_id: int) -> BackupRecord | None:
    stmt = select(BackupRecord).where(BackupRecord.id == backup_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_system_backup(db: AsyncSession, name: str | None = None) -> BackupRecord:
    """Create a compressed tar backup of /home, /etc, app DB and .env."""
    _ensure_backup_dir()
    ts = _utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = (name or f"system_{ts}").replace(" ", "_").replace("/", "_")
    archive_name = f"{safe_name}.tar.gz"
    archive_path = BACKUP_DIR / archive_name

    record = BackupRecord(
        name=safe_name,
        backup_type=BackupType.SYSTEM,
        status=BackupStatus.PENDING,
        started_at=_utcnow(),
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    record.status = BackupStatus.RUNNING
    await db.flush()

    def _do_archive() -> None:
        sources: list[tuple[Path, str]] = []
        for src in [Path("/home"), Path("/etc")]:
            if src.exists():
                sources.append((src, ""))
        if DB_PATH.exists():
            sources.append((DB_PATH, "opt/sudo-pi/backend"))
        if APP_ENV_PATH.exists():
            sources.append((APP_ENV_PATH, "opt/sudo-pi/backend"))
        _make_archive(archive_path, sources)

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _do_archive)
        checksum = await loop.run_in_executor(_executor, _sha256_file, archive_path)
        size = archive_path.stat().st_size
        record.status = BackupStatus.COMPLETED
        record.path = str(archive_path)
        record.size_bytes = size
        record.checksum = checksum
        record.completed_at = _utcnow()
        logger.info("System backup completed: {} ({} bytes)", archive_path, size)
    except Exception as exc:
        record.status = BackupStatus.FAILED
        record.error_message = str(exc)
        record.completed_at = _utcnow()
        logger.error("System backup failed: {}", exc)

    await db.flush()

    # Enforce keep count
    schedule = await _get_schedule_for_type(db, BackupType.SYSTEM)
    keep = schedule.keep_count if schedule else 5
    await _enforce_keep_count(db, BackupType.SYSTEM, keep)

    return record


async def create_config_backup(db: AsyncSession, name: str | None = None) -> BackupRecord:
    """Backup only SUDO-Pi configuration files."""
    _ensure_backup_dir()
    ts = _utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = (name or f"config_{ts}").replace(" ", "_").replace("/", "_")
    archive_name = f"{safe_name}.tar.gz"
    archive_path = BACKUP_DIR / archive_name

    record = BackupRecord(
        name=safe_name,
        backup_type=BackupType.CONFIG,
        status=BackupStatus.PENDING,
        started_at=_utcnow(),
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    record.status = BackupStatus.RUNNING
    await db.flush()

    def _do_archive() -> None:
        sources: list[tuple[Path, str]] = []
        if APP_ENV_PATH.exists():
            sources.append((APP_ENV_PATH, "opt/sudo-pi/backend"))
        if DB_PATH.exists():
            sources.append((DB_PATH, "opt/sudo-pi/backend"))
        if ETC_SUDOPI.exists():
            sources.append((ETC_SUDOPI, "etc"))
        for conf in [Path("/etc/hostapd/hostapd.conf"), Path("/etc/dnsmasq.conf")]:
            if conf.exists():
                sources.append((conf, f"etc/{conf.parent.name}" if conf.parent.name != "etc" else "etc"))
        _make_archive(archive_path, sources)

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _do_archive)
        checksum = await loop.run_in_executor(_executor, _sha256_file, archive_path)
        size = archive_path.stat().st_size
        record.status = BackupStatus.COMPLETED
        record.path = str(archive_path)
        record.size_bytes = size
        record.checksum = checksum
        record.completed_at = _utcnow()
        logger.info("Config backup completed: {} ({} bytes)", archive_path, size)
    except Exception as exc:
        record.status = BackupStatus.FAILED
        record.error_message = str(exc)
        record.completed_at = _utcnow()
        logger.error("Config backup failed: {}", exc)

    await db.flush()

    schedule = await _get_schedule_for_type(db, BackupType.CONFIG)
    keep = schedule.keep_count if schedule else 5
    await _enforce_keep_count(db, BackupType.CONFIG, keep)

    return record


async def create_sd_image_backup(db: AsyncSession, name: str | None = None) -> BackupRecord:
    """
    Create a comprehensive full-restore backup archive.

    This is a live-safe alternative to dd imaging: archives all important
    system directories including /home, /etc, /boot/firmware/config.txt,
    /opt/sudo-pi, and all SUDO-Pi systemd service files.
    """
    _ensure_backup_dir()
    ts = _utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = (name or f"full_restore_{ts}").replace(" ", "_").replace("/", "_")
    archive_name = f"{safe_name}.tar.gz"
    archive_path = BACKUP_DIR / archive_name

    record = BackupRecord(
        name=safe_name,
        backup_type=BackupType.SD_IMAGE,
        status=BackupStatus.PENDING,
        started_at=_utcnow(),
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    record.status = BackupStatus.RUNNING
    await db.flush()

    def _do_archive() -> None:
        sources: list[tuple[Path, str]] = []
        for src in [Path("/home"), Path("/etc"), Path("/opt/sudo-pi")]:
            if src.exists():
                sources.append((src, ""))

        boot_config = Path("/boot/firmware/config.txt")
        if not boot_config.exists():
            boot_config = Path("/boot/config.txt")
        if boot_config.exists():
            sources.append((boot_config, "boot/firmware"))

        # Collect SUDO-Pi systemd unit files
        systemd_dir = Path("/etc/systemd/system")
        if systemd_dir.exists():
            for unit in systemd_dir.glob("sudo-pi*.service"):
                sources.append((unit, "etc/systemd/system"))

        _make_archive(archive_path, sources)

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _do_archive)
        checksum = await loop.run_in_executor(_executor, _sha256_file, archive_path)
        size = archive_path.stat().st_size
        record.status = BackupStatus.COMPLETED
        record.path = str(archive_path)
        record.size_bytes = size
        record.checksum = checksum
        record.completed_at = _utcnow()
        logger.info("Full restore backup completed: {} ({} bytes)", archive_path, size)
    except Exception as exc:
        record.status = BackupStatus.FAILED
        record.error_message = str(exc)
        record.completed_at = _utcnow()
        logger.error("Full restore backup failed: {}", exc)

    await db.flush()

    schedule = await _get_schedule_for_type(db, BackupType.SD_IMAGE)
    keep = schedule.keep_count if schedule else 3
    await _enforce_keep_count(db, BackupType.SD_IMAGE, keep)

    return record


async def delete_backup(db: AsyncSession, backup_id: int) -> None:
    record = await get_backup_by_id(db, backup_id)
    if record is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Backup not found")

    if record.path:
        try:
            Path(record.path).unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("Could not delete backup file {}: {}", record.path, exc)

    await db.delete(record)
    await db.flush()
    logger.info("Deleted backup id={} name={}", backup_id, record.name)


async def get_backup_file_path(db: AsyncSession, backup_id: int) -> Path:
    record = await get_backup_by_id(db, backup_id)
    if record is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Backup not found")
    if record.status != BackupStatus.COMPLETED or not record.path:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Backup file is not available")
    p = Path(record.path)
    if not p.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=410, detail="Backup file no longer exists on disk")
    return p


async def restore_config_backup(db: AsyncSession, backup_id: int) -> dict:
    """
    Extract a config backup archive and restore .env, DB, and /etc/sudo-pi.
    The caller should restart the backend after this completes.
    """
    record = await get_backup_by_id(db, backup_id)
    if record is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Backup not found")

    if record.backup_type not in (BackupType.CONFIG, BackupType.SD_IMAGE):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Only config and full backups can be restored")

    if record.status != BackupStatus.COMPLETED or not record.path:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Backup is not in a completed state")

    archive_path = Path(record.path)
    if not archive_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=410, detail="Backup file no longer exists on disk")

    restored_items: list[str] = []

    async def _do_restore() -> list[str]:
        items: list[str] = []
        with tempfile.TemporaryDirectory(prefix="sudopi_restore_") as tmpdir:
            tmp = Path(tmpdir)

            def _extract() -> None:
                with tarfile.open(archive_path, "r:gz") as tar:
                    tar.extractall(tmp)

            await asyncio.get_event_loop().run_in_executor(_executor, _extract)

            # Restore .env (no root needed — file is owned by service user)
            env_candidate = tmp / "opt" / "sudo-pi" / "backend" / ".env"
            if env_candidate.exists() and APP_ENV_PATH.parent.exists():
                await asyncio.get_event_loop().run_in_executor(
                    _executor, lambda: shutil.copy2(env_candidate, APP_ENV_PATH)
                )
                items.append(".env")

            # Restore DB alongside current one (restart required to use)
            db_candidate = tmp / "opt" / "sudo-pi" / "backend" / "sudo_pi.db"
            if db_candidate.exists() and DB_PATH.parent.exists():
                restore_db = DB_PATH.parent / "sudo_pi_restored.db"
                await asyncio.get_event_loop().run_in_executor(
                    _executor, lambda: shutil.copy2(db_candidate, restore_db)
                )
                items.append(f"sudo_pi.db -> {restore_db}")

            # Restore /etc/sudo-pi using sudo to handle root-owned files
            etc_sudopi_candidate = tmp / "etc" / "sudo-pi"
            if etc_sudopi_candidate.exists():
                rm_proc = await asyncio.create_subprocess_exec(
                    "sudo", "rm", "-rf", str(ETC_SUDOPI),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await rm_proc.wait()
                cp_proc = await asyncio.create_subprocess_exec(
                    "sudo", "cp", "-r", str(etc_sudopi_candidate), str(ETC_SUDOPI),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await cp_proc.wait()
                items.append("/etc/sudo-pi/")

        return items

    try:
        restored_items = await _do_restore()
        logger.info("Config restore completed for backup id={}: {}", backup_id, restored_items)
        return {
            "success": True,
            "message": f"Restored {len(restored_items)} item(s): {', '.join(restored_items)}",
            "restored_items": restored_items,
            "requires_restart": True,
        }
    except Exception as exc:
        logger.error("Config restore failed for backup id={}: {}", backup_id, exc)
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}")


# ─── Schedule ────────────────────────────────────────────────────────────────


async def _get_schedule_for_type(db: AsyncSession, backup_type: BackupType) -> BackupSchedule | None:
    stmt = select(BackupSchedule).where(BackupSchedule.backup_type == backup_type)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_schedule(db: AsyncSession) -> list[dict]:
    stmt = select(BackupSchedule).order_by(BackupSchedule.id)
    result = await db.execute(stmt)
    return [s.to_dict() for s in result.scalars().all()]


async def update_schedule(
    db: AsyncSession,
    backup_type: str,
    enabled: bool,
    cron_expression: str,
    keep_count: int,
    destination: str,
    rclone_remote: str | None,
) -> dict:
    try:
        btype = BackupType(backup_type)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid backup type: {backup_type}")

    schedule = await _get_schedule_for_type(db, btype)
    if schedule is None:
        schedule = BackupSchedule(backup_type=btype)
        db.add(schedule)

    schedule.enabled = enabled
    schedule.cron_expression = cron_expression
    schedule.keep_count = max(1, keep_count)
    schedule.destination = destination
    schedule.rclone_remote = rclone_remote
    schedule.next_run_at = _parse_cron_next_run(cron_expression) if enabled else None

    await db.flush()
    await db.refresh(schedule)
    return schedule.to_dict()


async def run_scheduled_backups(db: AsyncSession) -> None:
    """Check all enabled schedules and run any that are due."""
    stmt = select(BackupSchedule).where(BackupSchedule.enabled == True)  # noqa: E712
    result = await db.execute(stmt)
    schedules = result.scalars().all()

    now = _utcnow()
    for schedule in schedules:
        if schedule.next_run_at is None or schedule.next_run_at > now:
            continue

        logger.info("Running scheduled {} backup", schedule.backup_type.value)
        ts = now.strftime("%Y%m%d_%H%M%S")

        try:
            if schedule.backup_type == BackupType.SYSTEM:
                record = await create_system_backup(db, name=f"scheduled_system_{ts}")
            elif schedule.backup_type == BackupType.CONFIG:
                record = await create_config_backup(db, name=f"scheduled_config_{ts}")
            else:
                record = await create_sd_image_backup(db, name=f"scheduled_full_{ts}")

            schedule.last_run_at = now
            schedule.next_run_at = _parse_cron_next_run(schedule.cron_expression)

            # Trigger rclone sync if configured
            if (
                record.status == BackupStatus.COMPLETED
                and schedule.destination == "rclone"
                and schedule.rclone_remote
            ):
                from app.services import rclone_service
                sync_result = await rclone_service.sync_to_remote(schedule.rclone_remote)
                if sync_result.get("success"):
                    record.cloud_synced = True
                    record.cloud_synced_at = _utcnow()

            await db.flush()
        except Exception as exc:
            logger.error("Scheduled {} backup failed: {}", schedule.backup_type.value, exc)


# ─── Disk usage ──────────────────────────────────────────────────────────────


async def get_backup_disk_usage(db: AsyncSession) -> dict:
    """Return disk usage info for the backup directory."""
    _ensure_backup_dir()
    stmt = select(BackupRecord).where(BackupRecord.status == BackupStatus.COMPLETED)
    result = await db.execute(stmt)
    records = result.scalars().all()

    backup_count = len(records)

    try:
        stat = shutil.disk_usage(BACKUP_DIR)
        used_bytes = stat.used
        free_bytes = stat.free
        total_bytes = stat.total
    except Exception:
        used_bytes = 0
        free_bytes = 0
        total_bytes = 0

    backup_size = sum(r.size_bytes or 0 for r in records)

    return {
        "backup_dir": str(BACKUP_DIR),
        "used_bytes": used_bytes,
        "free_bytes": free_bytes,
        "total_bytes": total_bytes,
        "backup_count": backup_count,
        "backup_size_bytes": backup_size,
    }


# ─── Snapshot export / import ─────────────────────────────────────────────────


async def export_snapshot(db: AsyncSession) -> dict:
    """Export all SUDO-Pi settings as a portable JSON snapshot."""
    snapshot: dict[str, Any] = {
        "version": "1.0",
        "generated_at": _utcnow().isoformat(),
        "hostname": socket.gethostname(),
    }

    # AP configurations
    try:
        from app.models.network import ApConfig
        stmt = select(ApConfig)
        res = await db.execute(stmt)
        aps = res.scalars().all()
        snapshot["ap_configs"] = [
            {
                "ssid": a.ssid,
                "channel": a.channel,
                "band": getattr(a, "band", "2.4"),
                "hidden": getattr(a, "hidden", False),
                "hw_mode": getattr(a, "hw_mode", "g"),
                "country_code": getattr(a, "country_code", "US"),
                "enabled": getattr(a, "enabled", True),
            }
            for a in aps
        ]
    except Exception as exc:
        logger.warning("Snapshot: could not export AP configs: {}", exc)
        snapshot["ap_configs"] = []

    # User accounts (no plain passwords)
    try:
        from app.models.user import User
        stmt = select(User)
        res = await db.execute(stmt)
        users = res.scalars().all()
        snapshot["users"] = [
            {
                "username": u.username,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role.value,
                "is_active": u.is_active,
                "is_system": u.is_system,
                "hashed_password": u.hashed_password,
            }
            for u in users
        ]
    except Exception as exc:
        logger.warning("Snapshot: could not export users: {}", exc)
        snapshot["users"] = []

    # Alert rules
    try:
        from app.models.alerts import AlertRule
        stmt = select(AlertRule)
        res = await db.execute(stmt)
        rules = res.scalars().all()
        snapshot["alert_rules"] = [
            {
                "name": r.name,
                "metric": r.metric,
                "threshold": r.threshold,
                "service_name": r.service_name,
                "channel": r.channel,
                "channel_config": r.channel_config,
                "enabled": r.enabled,
                "cooldown_minutes": r.cooldown_minutes,
            }
            for r in rules
        ]
    except Exception as exc:
        logger.warning("Snapshot: could not export alert rules: {}", exc)
        snapshot["alert_rules"] = []

    # Backup schedules
    try:
        stmt = select(BackupSchedule)
        res = await db.execute(stmt)
        snapshot["backup_schedules"] = [s.to_dict() for s in res.scalars().all()]
    except Exception as exc:
        logger.warning("Snapshot: could not export backup schedules: {}", exc)
        snapshot["backup_schedules"] = []

    # System metadata
    snapshot["system"] = {
        "hostname": socket.gethostname(),
        "timezone": _read_file("/etc/timezone", "").strip(),
        "locale": _read_file("/etc/locale.conf", "").strip(),
    }

    # /etc/hostapd config (text)
    snapshot["hostapd_conf"] = _read_file("/etc/hostapd/hostapd.conf", "")
    snapshot["dnsmasq_conf"] = _read_file("/etc/dnsmasq.conf", "")

    # SSH authorized keys for current user
    snapshot["ssh_authorized_keys"] = _read_file(
        str(Path.home() / ".ssh" / "authorized_keys"), ""
    )

    # WireGuard interfaces (no private keys)
    wg_configs: dict[str, str] = {}
    wg_dir = Path("/etc/wireguard")
    if wg_dir.exists():
        for conf in wg_dir.glob("*.conf"):
            raw = conf.read_text(errors="replace")
            # Strip private keys
            sanitized = "\n".join(
                line for line in raw.splitlines()
                if not line.strip().lower().startswith("privatekey")
            )
            wg_configs[conf.name] = sanitized
    snapshot["wireguard_configs"] = wg_configs

    return snapshot


def _read_file(path: str, default: str = "") -> str:
    try:
        return Path(path).read_text(errors="replace")
    except Exception:
        return default


async def import_snapshot(db: AsyncSession, data: dict) -> dict:
    """Apply a JSON snapshot to the running system."""
    version = data.get("version", "1.0")
    applied: list[str] = []
    skipped: list[str] = []
    warnings: list[str] = []

    if version not in ("1.0",):
        warnings.append(f"Unknown snapshot version '{version}' — attempting import anyway")

    # Users
    if "users" in data:
        try:
            from app.models.user import User, UserRole
            for udata in data["users"]:
                stmt = select(User).where(User.username == udata["username"])
                res = await db.execute(stmt)
                existing = res.scalar_one_or_none()
                if existing is None:
                    user = User(
                        username=udata["username"],
                        email=udata["email"],
                        full_name=udata.get("full_name"),
                        role=UserRole(udata.get("role", "viewer")),
                        is_active=udata.get("is_active", True),
                        is_system=udata.get("is_system", False),
                        hashed_password=udata["hashed_password"],
                    )
                    db.add(user)
                    applied.append(f"user:{udata['username']}")
                else:
                    skipped.append(f"user:{udata['username']} (already exists)")
        except Exception as exc:
            warnings.append(f"Users import partial failure: {exc}")

    # Alert rules
    if "alert_rules" in data:
        try:
            from app.models.alerts import AlertRule
            for rdata in data["alert_rules"]:
                rule = AlertRule(
                    name=rdata["name"],
                    metric=rdata["metric"],
                    threshold=rdata.get("threshold"),
                    service_name=rdata.get("service_name"),
                    channel=rdata["channel"],
                    channel_config=rdata.get("channel_config", "{}"),
                    enabled=rdata.get("enabled", True),
                    cooldown_minutes=rdata.get("cooldown_minutes", 60),
                )
                db.add(rule)
                applied.append(f"alert_rule:{rdata['name']}")
        except Exception as exc:
            warnings.append(f"Alert rules import partial failure: {exc}")

    # Backup schedules
    if "backup_schedules" in data:
        try:
            for sdata in data["backup_schedules"]:
                await update_schedule(
                    db,
                    backup_type=sdata["backup_type"],
                    enabled=sdata.get("enabled", False),
                    cron_expression=sdata.get("cron_expression", "0 2 * * *"),
                    keep_count=sdata.get("keep_count", 5),
                    destination=sdata.get("destination", "local"),
                    rclone_remote=sdata.get("rclone_remote"),
                )
                applied.append(f"backup_schedule:{sdata['backup_type']}")
        except Exception as exc:
            warnings.append(f"Backup schedules import partial failure: {exc}")

    # SSH authorized keys
    if "ssh_authorized_keys" in data and data["ssh_authorized_keys"]:
        try:
            ssh_dir = Path.home() / ".ssh"
            ssh_dir.mkdir(mode=0o700, exist_ok=True)
            auth_keys = ssh_dir / "authorized_keys"
            auth_keys.write_text(data["ssh_authorized_keys"])
            auth_keys.chmod(0o600)
            applied.append("ssh_authorized_keys")
        except Exception as exc:
            warnings.append(f"SSH authorized keys import failed: {exc}")

    # hostapd config
    if "hostapd_conf" in data and data["hostapd_conf"]:
        try:
            Path("/etc/hostapd").mkdir(exist_ok=True)
            Path("/etc/hostapd/hostapd.conf").write_text(data["hostapd_conf"])
            applied.append("hostapd.conf")
        except Exception as exc:
            warnings.append(f"hostapd.conf import failed (needs root): {exc}")
            skipped.append("hostapd.conf")

    # dnsmasq config
    if "dnsmasq_conf" in data and data["dnsmasq_conf"]:
        try:
            Path("/etc/dnsmasq.conf").write_text(data["dnsmasq_conf"])
            applied.append("dnsmasq.conf")
        except Exception as exc:
            warnings.append(f"dnsmasq.conf import failed (needs root): {exc}")
            skipped.append("dnsmasq.conf")

    await db.flush()

    return {
        "applied": applied,
        "skipped": skipped,
        "warnings": warnings,
        "requires_restart": len(applied) > 0,
    }
