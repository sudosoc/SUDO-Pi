from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.core.dependencies import ActiveUser, OperatorUser, CsrfVerified
from app.services import gpio_service

router = APIRouter(prefix="/gpio", tags=["gpio"])

_VALID_GPIOS = {
    gpio for (_, gpio, _) in gpio_service._PIN_MAP if gpio is not None
}


class ModeRequest(BaseModel):
    mode: str

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("IN", "OUT"):
            raise ValueError("Mode must be IN or OUT")
        return v


class ValueRequest(BaseModel):
    value: int

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("Value must be 0 or 1")
        return v


class PwmRequest(BaseModel):
    frequency: float
    duty_cycle: float


@router.get("/pins")
async def get_pins(_: ActiveUser = None):
    return gpio_service.get_pins()


@router.post("/pins/{gpio}/mode", dependencies=[CsrfVerified])
async def set_pin_mode(gpio: int, body: ModeRequest, _: OperatorUser = None):
    if gpio not in _VALID_GPIOS:
        raise HTTPException(400, f"GPIO{gpio} is not a configurable pin")
    try:
        return gpio_service.set_pin_mode(gpio, body.mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/pins/{gpio}/set", dependencies=[CsrfVerified])
async def set_pin_value(gpio: int, body: ValueRequest, _: OperatorUser = None):
    if gpio not in _VALID_GPIOS:
        raise HTTPException(400, f"GPIO{gpio} is not a configurable pin")
    try:
        return gpio_service.set_pin_value(gpio, body.value)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/pins/{gpio}/pwm", dependencies=[CsrfVerified])
async def set_pwm(gpio: int, body: PwmRequest, _: OperatorUser = None):
    if gpio not in _VALID_GPIOS:
        raise HTTPException(400, f"GPIO{gpio} is not a configurable pin")
    try:
        return gpio_service.set_pwm(gpio, body.frequency, body.duty_cycle)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
