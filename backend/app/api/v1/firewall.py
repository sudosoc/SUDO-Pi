from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


@router.post("/default", dependencies=[CsrfVerified])
async def set_default_policy(body: DefaultPolicyBody, _: AdminUser = None):
    ok = await firewall_service.set_default(body.direction, body.policy)
    if not ok:
        raise HTTPException(500, f"Failed to set default {body.direction} policy to {body.policy}")
    return {"direction": body.direction, "policy": body.policy}
