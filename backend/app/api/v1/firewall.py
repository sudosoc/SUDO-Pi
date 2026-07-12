import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import firewall_service

router = APIRouter(prefix="/firewall", tags=["Firewall"])


class AddRuleBody(BaseModel):
    direction: str       # "in" | "out"
    action: str          # "allow" | "deny" | "reject"
    proto: str           # "tcp" | "udp" | "any"
    port: str = ""       # port or port range, empty = any
    from_ip: str = "any"
    comment: str = ""


class DefaultPolicyBody(BaseModel):
    direction: str   # "incoming" | "outgoing" | "routed"
    policy: str      # "allow" | "deny" | "reject"


class PortForwardBody(BaseModel):
    proto: str
    src_port: int
    dest_host: str
    dest_port: int
    comment: str = ""

    @field_validator("proto")
    @classmethod
    def validate_proto(cls, v: str) -> str:
        if v not in ("tcp", "udp"):
            raise ValueError("proto must be tcp or udp")
        return v

    @field_validator("src_port", "dest_port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError("Port must be 1-65535")
        return v

    @field_validator("dest_host")
    @classmethod
    def validate_dest_host(cls, v: str) -> str:
        if not re.match(r"^(\d{1,3}\.){3}\d{1,3}$", v):
            raise ValueError("dest_host must be a valid IPv4 address")
        return v


@router.get("/status")
async def get_firewall_status(_: ActiveUser = None):
    return await firewall_service.get_ufw_status()


@router.post("/enable", dependencies=[CsrfVerified])
async def enable_firewall(_: AdminUser = None):
    ok = await firewall_service.enable_ufw()
    if not ok:
        raise HTTPException(500, "Failed to enable UFW")
    return {"enabled": True}


@router.post("/disable", dependencies=[CsrfVerified])
async def disable_firewall(_: AdminUser = None):
    ok = await firewall_service.disable_ufw()
    if not ok:
        raise HTTPException(500, "Failed to disable UFW")
    return {"enabled": False}


@router.post("/reload", dependencies=[CsrfVerified])
async def reload_firewall(_: AdminUser = None):
    ok = await firewall_service.reload_ufw()
    if not ok:
        raise HTTPException(500, "Failed to reload UFW")
    return {"reloaded": True}


@router.post("/rules", dependencies=[CsrfVerified])
async def add_rule(body: AddRuleBody, _: AdminUser = None):
    ok = await firewall_service.add_rule(
        direction=body.direction,
        action=body.action,
        proto=body.proto,
        port=body.port,
        from_ip=body.from_ip,
        comment=body.comment,
    )
    if not ok:
        raise HTTPException(500, "Failed to add firewall rule")
    return {"added": True}


@router.delete("/rules/{number}", dependencies=[CsrfVerified])
async def delete_rule(number: int, _: AdminUser = None):
    ok = await firewall_service.delete_rule(number)
    if not ok:
        raise HTTPException(500, f"Failed to delete rule #{number}")
    return {"deleted": True, "number": number}


@router.get("/port-forwards")
async def get_port_forwards(_: AdminUser = None) -> list[dict]:
    return await firewall_service.get_port_forwards()


@router.post("/port-forwards", dependencies=[CsrfVerified])
async def add_port_forward(body: PortForwardBody, _: AdminUser = None) -> dict:
    ok = await firewall_service.add_port_forward(
        body.proto, body.src_port, body.dest_host, body.dest_port, body.comment
    )
    if not ok:
        raise HTTPException(500, "Failed to add port forward rule")
    return {"added": True}


@router.delete("/port-forwards/{line_num}", dependencies=[CsrfVerified])
async def delete_port_forward(line_num: int, _: AdminUser = None) -> dict:
    if line_num < 1:
        raise HTTPException(400, "Invalid rule number")
    ok = await firewall_service.delete_port_forward(line_num)
    if not ok:
        raise HTTPException(500, f"Failed to delete port forward #{line_num}")
    return {"deleted": True, "num": line_num}


@router.post("/default", dependencies=[CsrfVerified])
async def set_default_policy(body: DefaultPolicyBody, _: AdminUser = None):
    ok = await firewall_service.set_default(body.direction, body.policy)
    if not ok:
        raise HTTPException(500, f"Failed to set default {body.direction} policy to {body.policy}")
    return {"direction": body.direction, "policy": body.policy}
