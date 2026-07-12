from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import Automation, AutomationEvent

# =============================================================================
# Automation engine — evaluates trigger→action rules on a 20s loop.
#
# Metric triggers fire only after the condition holds continuously for
# duration_sec (tracked in-memory), so a momentary spike doesn't trip them.
# Every rule respects its cooldown so a sustained condition fires once, not
# every tick. All actions are recorded as AutomationEvent rows that the
# dashboard surfaces as notifications.
# =============================================================================

_EVAL_INTERVAL = 20
_MAX_EVENTS = 200

# automation_id → epoch seconds the condition first became true
_condition_since: dict[int, float] = {}

_VALID_METRICS = {"cpu", "ram", "disk", "temp"}
_VALID_OPERATORS = {">", "<"}
_VALID_TRIGGERS = {"metric", "service_down"}
_VALID_ACTIONS = {"notify", "restart_service", "run_command", "reboot"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 30.0) -> tuple[int, str]:
    code, out, _ = await run_cmd(cmd, timeout=timeout, merge_stderr=True)
    return code, out.strip()


def validate(data: dict) -> None:
    if data.get("trigger_type") not in _VALID_TRIGGERS:
        raise ValueError("Invalid trigger_type")
    if data.get("action_type") not in _VALID_ACTIONS:
        raise ValueError("Invalid action_type")
    if data["trigger_type"] == "metric":
        if data.get("metric") not in _VALID_METRICS:
            raise ValueError("metric must be one of cpu, ram, disk, temp")
        if data.get("operator") not in _VALID_OPERATORS:
            raise ValueError("operator must be > or <")
    if data["trigger_type"] == "service_down" and not data.get("service_name"):
        raise ValueError("service_name is required for service_down triggers")
    if data["action_type"] in ("restart_service", "run_command") and not data.get("action_target"):
        raise ValueError("action_target is required for this action")


# ─── CRUD ────────────────────────────────────────────────────────────────────


async def list_automations(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Automation).order_by(Automation.id))
    return [a.to_dict() for a in result.scalars().all()]


async def create(db: AsyncSession, data: dict) -> dict:
    validate(data)
    auto = Automation(**{k: v for k, v in data.items() if hasattr(Automation, k)})
    db.add(auto)
    await db.flush()
    await db.refresh(auto)
    await db.commit()
    return auto.to_dict()


async def update(db: AsyncSession, auto_id: int, data: dict) -> dict | None:
    auto = await db.get(Automation, auto_id)
    if auto is None:
        return None
    merged = {**auto.to_dict(), **{k: v for k, v in data.items() if v is not None}}
    validate(merged)
    for key, value in data.items():
        if value is not None and hasattr(auto, key):
            setattr(auto, key, value)
    await db.flush()
    await db.refresh(auto)
    await db.commit()
    _condition_since.pop(auto_id, None)
    return auto.to_dict()


async def delete_automation(db: AsyncSession, auto_id: int) -> bool:
    auto = await db.get(Automation, auto_id)
    if auto is None:
        return False
    await db.delete(auto)
    await db.commit()
    _condition_since.pop(auto_id, None)
    return True


async def list_events(db: AsyncSession, limit: int = 50) -> list[dict]:
    result = await db.execute(
        select(AutomationEvent).order_by(AutomationEvent.fired_at.desc()).limit(limit)
    )
    return [e.to_dict() for e in result.scalars().all()]


# ─── Evaluation ──────────────────────────────────────────────────────────────


async def _metric_value(metric: str) -> float | None:
    from app.services import metrics_service

    snap = await metrics_service.collect_snapshot()
    val = snap.get(metric)
    return float(val) if val is not None else None


async def _service_active(name: str) -> bool:
    code, out = await _run(["systemctl", "is-active", name], timeout=8.0)
    return out.strip() == "active"


def _condition_met(auto: Automation, value: float) -> bool:
    if auto.operator == ">":
        return value > auto.threshold
    return value < auto.threshold


async def _execute_action(auto: Automation) -> tuple[bool, str]:
    """Run the configured action. Returns (success, result_text)."""
    if auto.action_type == "notify":
        return True, "Notification recorded"

    if auto.action_type == "restart_service":
        code, out = await _run(["sudo", "systemctl", "restart", auto.action_target or ""], timeout=30.0)
        return code == 0, out or f"exit {code}"

    if auto.action_type == "run_command":
        proc = await asyncio.create_subprocess_shell(
            auto.action_target or "",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            raw, _ = await asyncio.wait_for(proc.communicate(), timeout=60.0)
            out = raw.decode(errors="replace")[:2000]
            return (proc.returncode or 0) == 0, out or "no output"
        except asyncio.TimeoutError:
            proc.kill()
            return False, "command timed out"

    if auto.action_type == "reboot":
        await _run(["sudo", "shutdown", "-r", "+1"], timeout=10.0)
        return True, "Reboot scheduled in 1 minute"

    return False, "Unknown action"


async def _fire(db: AsyncSession, auto: Automation, detail: str) -> None:
    success, result = await _execute_action(auto)
    event = AutomationEvent(
        automation_id=auto.id,
        automation_name=auto.name,
        fired_at=_utcnow(),
        detail=detail,
        action_type=auto.action_type,
        action_result=result[:2000] if result else None,
        success=success,
    )
    db.add(event)
    auto.last_triggered_at = _utcnow()
    auto.trigger_count += 1
    await db.flush()

    # Trim old events
    result_ids = await db.execute(
        select(AutomationEvent.id).order_by(AutomationEvent.id.desc()).offset(_MAX_EVENTS)
    )
    old = [row[0] for row in result_ids.all()]
    if old:
        await db.execute(delete(AutomationEvent).where(AutomationEvent.id.in_(old)))
    await db.commit()
    logger.info("Automation '{}' fired: {} → {} ({})", auto.name, detail, auto.action_type, "ok" if success else "failed")


async def test_automation(db: AsyncSession, auto_id: int) -> dict:
    """Manually fire an automation's action, ignoring the trigger + cooldown."""
    auto = await db.get(Automation, auto_id)
    if auto is None:
        raise ValueError("Automation not found")
    await _fire(db, auto, "Manual test")
    return {"detail": f"Ran action for '{auto.name}'"}


async def _evaluate_once(db: AsyncSession) -> None:
    result = await db.execute(select(Automation).where(Automation.enabled.is_(True)))
    automations = list(result.scalars().all())
    if not automations:
        _condition_since.clear()
        return

    now = _utcnow().timestamp()

    for auto in automations:
        # Cooldown gate
        if auto.last_triggered_at is not None:
            last = auto.last_triggered_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if now - last.timestamp() < auto.cooldown_sec:
                continue

        if auto.trigger_type == "metric":
            value = await _metric_value(auto.metric or "")
            if value is None:
                _condition_since.pop(auto.id, None)
                continue
            if _condition_met(auto, value):
                since = _condition_since.setdefault(auto.id, now)
                if now - since >= auto.duration_sec:
                    unit = "°C" if auto.metric == "temp" else "%"
                    detail = f"{auto.metric.upper()} {value:.0f}{unit} {auto.operator} {auto.threshold:.0f}{unit} for {auto.duration_sec}s"
                    await _fire(db, auto, detail)
                    _condition_since.pop(auto.id, None)
            else:
                _condition_since.pop(auto.id, None)

        elif auto.trigger_type == "service_down":
            if not await _service_active(auto.service_name or ""):
                await _fire(db, auto, f"Service '{auto.service_name}' is not active")


async def evaluation_loop() -> None:
    from app.core.database import AsyncSessionFactory

    logger.info("Automation evaluation loop started")
    while True:
        await asyncio.sleep(_EVAL_INTERVAL)
        try:
            async with AsyncSessionFactory() as db:
                await _evaluate_once(db)
        except Exception as exc:  # noqa: BLE001
            logger.error("Automation evaluation failed: {}", exc)
