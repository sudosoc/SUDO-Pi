from __future__ import annotations

import json
import os
import smtplib
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage

import httpx
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.alerts import AlertRule, AlertHistory
from app.services.system_service import get_full_system_stats, get_services_status


async def _send_discord(webhook_url: str, message: str) -> bool:
    """POST to Discord webhook."""
    if not webhook_url:
        return False
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(webhook_url, json={"content": message, "username": "SUDO-Pi Alerts"})
        return r.status_code in (200, 204)


async def _send_telegram(bot_token: str, chat_id: str, message: str) -> bool:
    if not bot_token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"})
        return r.status_code == 200


async def _send_email(email: str, subject: str, body: str) -> bool:
    """Send via smtplib using settings from environment."""
    smtp_host = os.environ.get("ALERT_SMTP_HOST", "")
    smtp_port = int(os.environ.get("ALERT_SMTP_PORT", "587"))
    smtp_user = os.environ.get("ALERT_SMTP_USER", "")
    smtp_pass = os.environ.get("ALERT_SMTP_PASS", "")
    if not smtp_host or not email:
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = smtp_user or "sudo-pi@localhost"
        msg["To"] = email
        msg.set_content(body)
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            if smtp_user:
                s.starttls()
                s.login(smtp_user, smtp_pass)
            s.send_message(msg)
        return True
    except Exception as exc:
        logger.error("Email alert failed: {}", exc)
        return False


async def _dispatch_alert(rule: AlertRule, value: float, message: str, db: AsyncSession) -> None:
    config = json.loads(rule.channel_config)
    success = False
    if rule.channel == "discord":
        success = await _send_discord(config.get("webhook_url", ""), message)
    elif rule.channel == "telegram":
        success = await _send_telegram(config.get("bot_token", ""), config.get("chat_id", ""), message)
    elif rule.channel == "email":
        success = await _send_email(config.get("email", ""), f"[SUDO-Pi Alert] {rule.name}", message)

    history = AlertHistory(
        rule_id=rule.id,
        rule_name=rule.name,
        metric=rule.metric,
        value=value,
        message=message,
        channel=rule.channel,
        sent_at=datetime.now(timezone.utc),
        success=success,
    )
    db.add(history)
    rule.last_triggered_at = datetime.now(timezone.utc)
    await db.commit()


async def _dispatch_alert_direct(channel: str, config: dict, message: str) -> bool:
    if channel == "discord":
        return await _send_discord(config.get("webhook_url", ""), message)
    elif channel == "telegram":
        return await _send_telegram(config.get("bot_token", ""), config.get("chat_id", ""), message)
    elif channel == "email":
        return await _send_email(config.get("email", ""), "[SUDO-Pi] Test Alert", message)
    return False


async def check_alerts(db: AsyncSession) -> None:
    """Check all enabled rules against current metrics. Called every 60 seconds."""
    result = await db.execute(select(AlertRule).where(AlertRule.enabled == True))  # noqa: E712
    rules = result.scalars().all()
    if not rules:
        return

    stats = await get_full_system_stats()
    services = await get_services_status()
    service_map = {s.name: s for s in services}

    for rule in rules:
        # Cooldown check
        if rule.last_triggered_at:
            last = rule.last_triggered_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last).total_seconds() / 60
            if elapsed < rule.cooldown_minutes:
                continue

        value = 0.0
        triggered = False
        message = ""

        if rule.metric == "cpu":
            value = stats.cpu.percent
            if rule.threshold is not None and value >= rule.threshold:
                triggered = True
                message = f"\U0001f6a8 CPU usage is {value:.1f}% (threshold: {rule.threshold:.0f}%)"
        elif rule.metric == "ram":
            value = stats.memory.percent
            if rule.threshold is not None and value >= rule.threshold:
                triggered = True
                message = f"\U0001f6a8 RAM usage is {value:.1f}% (threshold: {rule.threshold:.0f}%)"
        elif rule.metric == "disk":
            disk = next((d for d in stats.disks if d.mountpoint == "/"), None)
            if disk:
                value = disk.percent
                if rule.threshold is not None and value >= rule.threshold:
                    triggered = True
                    message = f"\U0001f6a8 Disk usage is {value:.1f}% (threshold: {rule.threshold:.0f}%)"
        elif rule.metric == "temperature":
            if stats.temperature.cpu is not None:
                value = stats.temperature.cpu
                if rule.threshold is not None and value >= rule.threshold:
                    triggered = True
                    message = f"\U0001f321️ CPU temperature is {value:.1f}°C (threshold: {rule.threshold:.0f}°C)"
        elif rule.metric == "service_down":
            svc = service_map.get(rule.service_name or "")
            if svc and svc.status == "stopped":
                value = 0.0
                triggered = True
                message = f"⚠️ Service '{rule.service_name}' is DOWN"

        if triggered:
            try:
                await _dispatch_alert(rule, value, message, db)
            except Exception as exc:
                logger.error("Alert dispatch error for rule {}: {}", rule.id, exc)


# CRUD for alert rules

async def list_rules(db: AsyncSession) -> list[AlertRule]:
    result = await db.execute(select(AlertRule).order_by(AlertRule.id))
    return result.scalars().all()


async def create_rule(
    db: AsyncSession,
    name: str,
    metric: str,
    threshold: float | None,
    service_name: str | None,
    channel: str,
    channel_config: dict,
    cooldown_minutes: int,
) -> AlertRule:
    rule = AlertRule(
        name=name,
        metric=metric,
        threshold=threshold,
        service_name=service_name,
        channel=channel,
        channel_config=json.dumps(channel_config),
        enabled=True,
        cooldown_minutes=cooldown_minutes,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(db: AsyncSession, rule_id: int, **kwargs) -> AlertRule | None:
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        return None
    for k, v in kwargs.items():
        if k == "channel_config":
            v = json.dumps(v)
        setattr(rule, k, v)
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule_id: int) -> bool:
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        return False
    await db.delete(rule)
    await db.commit()
    return True


async def list_history(db: AsyncSession, limit: int = 100) -> list[AlertHistory]:
    result = await db.execute(
        select(AlertHistory).order_by(AlertHistory.sent_at.desc()).limit(limit)
    )
    return result.scalars().all()


async def test_alert(channel: str, config: dict) -> bool:
    return await _dispatch_alert_direct(channel, config, "\U0001f9ea Test alert from SUDO-Pi — everything is working!")
