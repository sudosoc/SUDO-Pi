from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.known_device import KnownDevice
from app.services import network_scanner_service, alerts_service


async def get_all(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(KnownDevice).order_by(KnownDevice.last_seen.desc())
    )
    return [d.to_dict() for d in result.scalars().all()]


async def _process_current_clients(db: AsyncSession) -> list[dict]:
    """Compare AP clients against known_devices; insert new ones and fire alerts."""
    try:
        devices = await network_scanner_service.scan(active=False)
    except Exception as exc:  # noqa: BLE001
        logger.error("known_device_service: scan failed: {}", exc)
        return []

    new_devices: list[dict] = []

    for dev in devices:
        mac = dev["mac"].lower()
        if not mac:
            continue

        result = await db.execute(select(KnownDevice).where(KnownDevice.mac == mac))
        existing = result.scalar_one_or_none()

        if existing is None:
            # Brand-new device — record it and fire an alert
            kd = KnownDevice(
                mac=mac,
                hostname=dev.get("hostname") or None,
                ip=dev.get("ip") or None,
                alert_sent=False,
            )
            db.add(kd)
            await db.flush()
            new_devices.append(dev)
            logger.info("New device seen on AP: mac={} ip={} hostname={}", mac, dev.get("ip"), dev.get("hostname"))
        else:
            # Update last_seen + refresh hostname/ip
            await db.execute(
                update(KnownDevice)
                .where(KnownDevice.id == existing.id)
                .values(
                    last_seen=datetime.now(timezone.utc),
                    hostname=dev.get("hostname") or existing.hostname,
                    ip=dev.get("ip") or existing.ip,
                )
            )

    await db.commit()

    # Fire in-app alerts for new devices (non-blocking)
    for dev in new_devices:
        try:
            await _fire_new_device_alert(db, dev)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to fire new-device alert for {}: {}", dev.get("mac"), exc)

    return new_devices


async def _fire_new_device_alert(db: AsyncSession, dev: dict) -> None:
    """Create an alert-history entry for a newly discovered device."""
    import json as _json
    from datetime import datetime, timezone
    from app.models.alerts import AlertRule, AlertHistory

    mac = dev.get("mac", "unknown")
    hostname = dev.get("hostname") or mac
    ip = dev.get("ip") or "unknown"
    vendor = dev.get("vendor") or "Unknown vendor"
    message = f"New device connected: {hostname} ({mac}) — {ip} — {vendor}"

    # Fire through any configured alert rules that target new_device metric
    result = await db.execute(
        select(AlertRule).where(
            AlertRule.metric == "new_device",
            AlertRule.enabled.is_(True),
        )
    )
    rules = result.scalars().all()

    for rule in rules:
        try:
            channel_config = _json.loads(rule.channel_config)
            await alerts_service._dispatch_alert_direct(rule.channel, channel_config, message)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to dispatch new-device alert via {}: {}", rule.channel, exc)

    # Always record in alert history so the UI can show it
    history = AlertHistory(
        rule_id=None,
        rule_name="New Device Alert",
        metric="new_device",
        value=0.0,
        message=message,
        channel="system",
        sent_at=datetime.now(timezone.utc),
        success=True,
    )
    db.add(history)

    # Mark known_device as alert_sent
    await db.execute(
        update(KnownDevice)
        .where(KnownDevice.mac == mac)
        .values(alert_sent=True)
    )
    await db.commit()


async def monitor_loop() -> None:
    """Background task: poll AP clients every 60 seconds for new devices."""
    from app.core.database import AsyncSessionFactory

    while True:
        await asyncio.sleep(60)
        try:
            async with AsyncSessionFactory() as db:
                await _process_current_clients(db)
        except Exception as exc:  # noqa: BLE001
            logger.error("known_device_service monitor_loop error: {}", exc)
