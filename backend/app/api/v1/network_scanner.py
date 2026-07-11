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
    """Scan the AP network for connected devices.

    Returns IP, MAC, hostname, vendor, and ARP state for each device.
    Set active=true to run arp-scan/nmap for a thorough discovery.
    """
    return await network_scanner_service.scan(active=active)
