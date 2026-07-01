from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import vpn_service

router = APIRouter(prefix="/vpn", tags=["VPN"])


class ConfigBody(BaseModel):
    name: str
    content: str


@router.get("/wireguard")
async def get_wireguard_tunnels(_: ActiveUser = None):
    return await vpn_service.list_wireguard_tunnels()


@router.post("/wireguard/{name}/up", dependencies=[CsrfVerified])
async def wireguard_up(name: str, _: AdminUser = None):
    ok = await vpn_service.wireguard_up(name)
    if not ok:
        raise HTTPException(500, f"Failed to bring up WireGuard tunnel '{name}'")
    return {"status": "up", "name": name}


@router.post("/wireguard/{name}/down", dependencies=[CsrfVerified])
async def wireguard_down(name: str, _: AdminUser = None):
    ok = await vpn_service.wireguard_down(name)
    if not ok:
        raise HTTPException(500, f"Failed to bring down WireGuard tunnel '{name}'")
    return {"status": "down", "name": name}


@router.post("/wireguard/{name}/config", dependencies=[CsrfVerified])
async def save_wireguard_config(name: str, body: ConfigBody, _: AdminUser = None):
    ok = await vpn_service.save_wireguard_config(body.name, body.content)
    if not ok:
        raise HTTPException(500, "Failed to save WireGuard configuration")
    return {"saved": True, "name": body.name}


@router.delete("/wireguard/{name}", dependencies=[CsrfVerified])
async def delete_wireguard_config(name: str, _: AdminUser = None):
    ok = await vpn_service.delete_wireguard_config(name)
    if not ok:
        raise HTTPException(500, f"Failed to delete WireGuard config '{name}'")
    return {"deleted": True, "name": name}


@router.get("/openvpn")
async def get_openvpn_configs(_: ActiveUser = None):
    return await vpn_service.list_openvpn_configs()


@router.post("/openvpn/{name}/connect", dependencies=[CsrfVerified])
async def openvpn_connect(name: str, _: AdminUser = None):
    ok = await vpn_service.openvpn_connect(name)
    if not ok:
        raise HTTPException(500, f"Failed to connect OpenVPN '{name}'")
    return {"status": "active", "name": name}


@router.post("/openvpn/{name}/disconnect", dependencies=[CsrfVerified])
async def openvpn_disconnect(name: str, _: AdminUser = None):
    ok = await vpn_service.openvpn_disconnect(name)
    if not ok:
        raise HTTPException(500, f"Failed to disconnect OpenVPN '{name}'")
    return {"status": "inactive", "name": name}


@router.post("/openvpn/{name}/config", dependencies=[CsrfVerified])
async def save_openvpn_config(name: str, body: ConfigBody, _: AdminUser = None):
    ok = await vpn_service.save_openvpn_config(body.name, body.content)
    if not ok:
        raise HTTPException(500, "Failed to save OpenVPN configuration")
    return {"saved": True, "name": body.name}


@router.delete("/openvpn/{name}", dependencies=[CsrfVerified])
async def delete_openvpn_config(name: str, _: AdminUser = None):
    ok = await vpn_service.delete_openvpn_config(name)
    if not ok:
        raise HTTPException(500, f"Failed to delete OpenVPN config '{name}'")
    return {"deleted": True, "name": name}


@router.get("/ip")
async def get_vpn_ip(_: ActiveUser = None):
    ip = await vpn_service.get_vpn_ip()
    return {"ip": ip, "connected": ip is not None}
