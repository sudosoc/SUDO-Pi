from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    system,
    network,
    terminal,
    files,
    users,
    logs,
    settings,
    packages,
    docker,
    bluetooth,
    gpio,
    security,
    vpn,
    firewall,
    cron,
    ssh,
    metrics,
    alerts,
    storage,
    speedtest,
    display,
    processes,
    compose,
    app_store,
    traffic,
    ad_blocker,
    port_scanner,
    captive_portal,
    uptime,
    ws_metrics,
    backup,
    rclone,
    diagnostics,
    os_updates,
    device_policies,
    dns,
    automations,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(system.router)
api_router.include_router(network.router)
api_router.include_router(terminal.router)
api_router.include_router(files.router)
api_router.include_router(users.router)
api_router.include_router(logs.router)
api_router.include_router(settings.router)
api_router.include_router(packages.router)
api_router.include_router(docker.router)
api_router.include_router(bluetooth.router)
api_router.include_router(gpio.router)
api_router.include_router(security.router)
api_router.include_router(vpn.router)
api_router.include_router(firewall.router)
api_router.include_router(cron.router)
api_router.include_router(ssh.router)
api_router.include_router(metrics.router)
api_router.include_router(alerts.router)
api_router.include_router(storage.router)
api_router.include_router(speedtest.router)
api_router.include_router(display.router)
api_router.include_router(processes.router)
api_router.include_router(compose.router)
api_router.include_router(app_store.router)
api_router.include_router(traffic.router)
api_router.include_router(ad_blocker.router)
api_router.include_router(port_scanner.router)
api_router.include_router(captive_portal.router)
api_router.include_router(uptime.router)
api_router.include_router(ws_metrics.router)
api_router.include_router(backup.router)
api_router.include_router(rclone.router)
api_router.include_router(diagnostics.router)
api_router.include_router(os_updates.router)
api_router.include_router(device_policies.router)
api_router.include_router(dns.router)
api_router.include_router(automations.router)
