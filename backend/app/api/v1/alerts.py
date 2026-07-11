import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, field_validator

from app.core.dependencies import AdminUser, CsrfVerified, DBSession
from app.services import alerts_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])

_VALID_METRICS = {"cpu", "ram", "disk", "temperature", "service_down", "new_device"}
_VALID_CHANNELS = {"discord", "telegram", "email"}


class AlertRuleCreate(BaseModel):
    name: str
    metric: str
    threshold: Optional[float] = None
    service_name: Optional[str] = None
    channel: str
    channel_config: dict
    cooldown_minutes: int = 60

    @field_validator("metric")
    @classmethod
    def validate_metric(cls, v: str) -> str:
        if v not in _VALID_METRICS:
            raise ValueError(f"metric must be one of {_VALID_METRICS}")
        return v

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: str) -> str:
        if v not in _VALID_CHANNELS:
            raise ValueError(f"channel must be one of {_VALID_CHANNELS}")
        return v


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    metric: Optional[str] = None
    threshold: Optional[float] = None
    service_name: Optional[str] = None
    channel: Optional[str] = None
    channel_config: Optional[dict] = None
    cooldown_minutes: Optional[int] = None
    enabled: Optional[bool] = None

    @field_validator("metric")
    @classmethod
    def validate_metric(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_METRICS:
            raise ValueError(f"metric must be one of {_VALID_METRICS}")
        return v

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_CHANNELS:
            raise ValueError(f"channel must be one of {_VALID_CHANNELS}")
        return v


class TestAlertRequest(BaseModel):
    channel: str
    config: dict

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: str) -> str:
        if v not in _VALID_CHANNELS:
            raise ValueError(f"channel must be one of {_VALID_CHANNELS}")
        return v


def _rule_to_dict(rule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "metric": rule.metric,
        "threshold": rule.threshold,
        "service_name": rule.service_name,
        "channel": rule.channel,
        "channel_config": json.loads(rule.channel_config),
        "enabled": rule.enabled,
        "cooldown_minutes": rule.cooldown_minutes,
        "last_triggered_at": rule.last_triggered_at.isoformat() if rule.last_triggered_at else None,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


def _history_to_dict(h) -> dict:
    return {
        "id": h.id,
        "rule_id": h.rule_id,
        "rule_name": h.rule_name,
        "metric": h.metric,
        "value": h.value,
        "message": h.message,
        "channel": h.channel,
        "sent_at": h.sent_at.isoformat() if h.sent_at else None,
        "success": h.success,
    }


@router.get("/rules")
async def list_alert_rules(_: AdminUser, db: DBSession) -> list[dict]:
    rules = await alerts_service.list_rules(db)
    return [_rule_to_dict(r) for r in rules]


@router.post("/rules", dependencies=[CsrfVerified], status_code=status.HTTP_201_CREATED)
async def create_alert_rule(body: AlertRuleCreate, _: AdminUser, db: DBSession) -> dict:
    rule = await alerts_service.create_rule(
        db,
        name=body.name,
        metric=body.metric,
        threshold=body.threshold,
        service_name=body.service_name,
        channel=body.channel,
        channel_config=body.channel_config,
        cooldown_minutes=body.cooldown_minutes,
    )
    return _rule_to_dict(rule)


@router.put("/rules/{rule_id}", dependencies=[CsrfVerified])
async def update_alert_rule(rule_id: int, body: AlertRuleUpdate, _: AdminUser, db: DBSession) -> dict:
    updates = body.model_dump(exclude_none=True)
    rule = await alerts_service.update_rule(db, rule_id, **updates)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")
    return _rule_to_dict(rule)


@router.delete("/rules/{rule_id}", dependencies=[CsrfVerified], status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(rule_id: int, _: AdminUser, db: DBSession) -> None:
    deleted = await alerts_service.delete_rule(db, rule_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")


@router.post("/rules/{rule_id}/toggle", dependencies=[CsrfVerified])
async def toggle_alert_rule(rule_id: int, _: AdminUser, db: DBSession) -> dict:
    from sqlalchemy import select
    from app.models.alerts import AlertRule
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")
    rule.enabled = not rule.enabled
    await db.commit()
    await db.refresh(rule)
    return _rule_to_dict(rule)


@router.post("/test", dependencies=[CsrfVerified])
async def test_alert_channel(body: TestAlertRequest, _: AdminUser) -> dict:
    success = await alerts_service.test_alert(body.channel, body.config)
    return {"success": success}


@router.get("/history")
async def get_alert_history(
    _: AdminUser,
    db: DBSession,
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
    history = await alerts_service.list_history(db, limit=limit)
    return [_history_to_dict(h) for h in history]
