from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.dependencies import ActiveUser
from app.services import network_scanner_service

router = APIRouter(prefix="/network-scanner", tags=["Network Scanner"])


@router.get("")
async def scan_network(
    _: ActiveUser,
    active: bool = Query(False, description="Perform active ARP scan (slower but finds more devices)"),
) -> list[dict]:
    """Scan the AP network for connected devices."""
    return await network_scanner_service.scan(active=active)


@router.get("/topology")
async def get_topology(_: ActiveUser) -> dict:
    """Return a graph representation of the network for visualization."""
    import socket
    devices = await network_scanner_service.scan(active=False)

    try:
        pi_hostname = socket.gethostname()
    except Exception:
        pi_hostname = "SUDO-Pi"

    nodes = [
        {
            "id": "pi",
            "name": pi_hostname,
            "ip": "192.168.4.1",
            "category": 0,
            "symbolSize": 50,
            "type": "gateway",
        }
    ]

    links = []
    for dev in devices:
        ip = dev.get("ip", "")
        node_id = ip or dev.get("mac", "unknown")
        hostname = dev.get("hostname") or ip or "Unknown"
        vendor = dev.get("vendor", "")

        cat = 1
        if vendor:
            v_low = vendor.lower()
            if any(k in v_low for k in ("apple",)):
                cat = 2
            elif any(k in v_low for k in ("samsung", "xiaomi", "huawei", "oppo", "vivo")):
                cat = 3
            elif any(k in v_low for k in ("intel", "dell", "hp ", "lenovo", "asus", "acer")):
                cat = 4

        nodes.append({
            "id": node_id,
            "name": hostname,
            "ip": ip,
            "mac": dev.get("mac", ""),
            "vendor": vendor,
            "category": cat,
            "symbolSize": 28,
            "type": "device",
        })
        links.append({"source": "pi", "target": node_id})

    categories = [
        {"name": "Gateway"},
        {"name": "Device"},
        {"name": "Apple"},
        {"name": "Mobile"},
        {"name": "Computer"},
    ]

    return {"nodes": nodes, "links": links, "categories": categories}
