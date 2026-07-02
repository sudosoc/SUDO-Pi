from __future__ import annotations

from pathlib import Path

from app.services import compose_service

COMPOSE_DIR = compose_service.COMPOSE_DIR

APP_CATALOG: list[dict] = [
    {
        "id": "nextcloud",
        "name": "Nextcloud",
        "description": "Self-hosted cloud storage and collaboration platform with file sync, calendar, contacts, and more.",
        "category": "Storage",
        "icon": "cloud",
        "ports": [8080],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Default login: admin / changeme. Data stored in /opt/sudo-pi/data/nextcloud",
        "compose": """\
services:
  nextcloud:
    image: lscr.io/linuxserver/nextcloud:latest
    container_name: nextcloud
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/nextcloud/config:/config
      - /opt/sudo-pi/data/nextcloud/data:/data
    ports:
      - 8080:443
    restart: unless-stopped
""",
    },
    {
        "id": "jellyfin",
        "name": "Jellyfin",
        "description": "Free software media system that lets you manage and stream your personal media library.",
        "category": "Media",
        "icon": "tv",
        "ports": [8096],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Access at http://pi:8096 — complete setup wizard on first launch.",
        "compose": """\
services:
  jellyfin:
    image: lscr.io/linuxserver/jellyfin:latest
    container_name: jellyfin
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/jellyfin/config:/config
      - /opt/sudo-pi/data/jellyfin/cache:/cache
      - /opt/sudo-pi/data/media:/data/media
    ports:
      - 8096:8096
    restart: unless-stopped
""",
    },
    {
        "id": "pihole",
        "name": "Pi-hole",
        "description": "Network-wide DNS ad blocker that blocks advertisements and trackers at the DNS level.",
        "category": "Network",
        "icon": "shield",
        "ports": [53, 8081],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Set your router's DNS to the Pi's IP. Web admin at http://pi:8081/admin",
        "compose": """\
services:
  pihole:
    image: pihole/pihole:latest
    container_name: pihole
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "8081:80/tcp"
    environment:
      TZ: UTC
      WEBPASSWORD: changeme
    volumes:
      - /opt/sudo-pi/data/pihole/etc-pihole:/etc/pihole
      - /opt/sudo-pi/data/pihole/etc-dnsmasq.d:/etc/dnsmasq.d
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
""",
    },
    {
        "id": "portainer",
        "name": "Portainer CE",
        "description": "Lightweight Docker management UI for managing containers, images, networks, and volumes.",
        "category": "Development",
        "icon": "layout-dashboard",
        "ports": [9000],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Create admin account on first visit at http://pi:9000",
        "compose": """\
services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    ports:
      - 9000:9000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/sudo-pi/data/portainer:/data
    restart: unless-stopped
""",
    },
    {
        "id": "homeassistant",
        "name": "Home Assistant",
        "description": "Open source home automation platform that puts local control and privacy first.",
        "category": "IoT",
        "icon": "home",
        "ports": [8123],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Access at http://pi:8123 — uses host network for device discovery.",
        "compose": """\
services:
  homeassistant:
    image: homeassistant/home-assistant:stable
    container_name: homeassistant
    network_mode: host
    environment:
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/homeassistant:/config
    restart: unless-stopped
    privileged: true
""",
    },
    {
        "id": "grafana",
        "name": "Grafana",
        "description": "Open source analytics and interactive visualization platform for metrics and logs.",
        "category": "Development",
        "icon": "bar-chart-2",
        "ports": [3000],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Default login: admin / admin. Change password on first login.",
        "compose": """\
services:
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - 3000:3000
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - /opt/sudo-pi/data/grafana:/var/lib/grafana
    restart: unless-stopped
    user: "1000"
""",
    },
    {
        "id": "uptime-kuma",
        "name": "Uptime Kuma",
        "description": "Self-hosted monitoring tool with a fancy UI for tracking uptime of your services.",
        "category": "Network",
        "icon": "activity",
        "ports": [3001],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Access at http://pi:3001 — create admin account on first visit.",
        "compose": """\
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    ports:
      - 3001:3001
    volumes:
      - /opt/sudo-pi/data/uptime-kuma:/app/data
    restart: unless-stopped
""",
    },
    {
        "id": "vaultwarden",
        "name": "Vaultwarden",
        "description": "Unofficial Bitwarden-compatible server in Rust. Self-host your password manager.",
        "category": "Security",
        "icon": "lock",
        "ports": [8082],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Compatible with all Bitwarden clients. Admin token required for /admin panel.",
        "compose": """\
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    ports:
      - 8082:80
    environment:
      - WEBSOCKET_ENABLED=true
      - SIGNUPS_ALLOWED=true
    volumes:
      - /opt/sudo-pi/data/vaultwarden:/data
    restart: unless-stopped
""",
    },
    {
        "id": "gitea",
        "name": "Gitea",
        "description": "Lightweight self-hosted Git service with web UI, issue tracker, and CI/CD support.",
        "category": "Development",
        "icon": "git-branch",
        "ports": [3002, 2222],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Web at http://pi:3002 — SSH clone on port 2222. Complete install wizard on first visit.",
        "compose": """\
services:
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
    ports:
      - 3002:3000
      - 2222:22
    volumes:
      - /opt/sudo-pi/data/gitea:/data
    restart: unless-stopped
""",
    },
    {
        "id": "node-red",
        "name": "Node-RED",
        "description": "Flow-based programming tool for wiring together hardware devices, APIs, and online services.",
        "category": "IoT",
        "icon": "workflow",
        "ports": [1880],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Access at http://pi:1880 — drag-and-drop flow editor for automation workflows.",
        "compose": """\
services:
  node-red:
    image: nodered/node-red:latest
    container_name: node-red
    ports:
      - 1880:1880
    environment:
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/node-red:/data
    restart: unless-stopped
    user: "1000:1000"
""",
    },
]

_CATALOG_BY_ID: dict[str, dict] = {app["id"]: app for app in APP_CATALOG}


def _is_installed(app_id: str) -> bool:
    stack_dir = COMPOSE_DIR / app_id
    return stack_dir.exists() and (stack_dir / "docker-compose.yml").exists()


async def list_apps() -> list[dict]:
    COMPOSE_DIR.mkdir(parents=True, exist_ok=True)
    result: list[dict] = []
    for app in APP_CATALOG:
        entry = {k: v for k, v in app.items() if k != "compose"}
        entry["installed"] = _is_installed(app["id"])
        result.append(entry)
    return result


async def get_app(app_id: str) -> dict:
    app = _CATALOG_BY_ID.get(app_id)
    if app is None:
        raise ValueError(f"App {app_id!r} not found in catalog")
    entry = {k: v for k, v in app.items() if k != "compose"}
    entry["installed"] = _is_installed(app_id)
    return entry


async def install_app(app_id: str) -> dict:
    app = _CATALOG_BY_ID.get(app_id)
    if app is None:
        raise ValueError(f"App {app_id!r} not found in catalog")
    if _is_installed(app_id):
        raise ValueError(f"App {app_id!r} is already installed")

    await compose_service.create_stack(app_id, app["compose"])
    result = await compose_service.start_stack(app_id)
    return {
        "app_id": app_id,
        "name": app["name"],
        "installed": True,
        "output": result.get("output", ""),
    }


async def uninstall_app(app_id: str, remove_data: bool = False) -> dict:
    app = _CATALOG_BY_ID.get(app_id)
    if app is None:
        raise ValueError(f"App {app_id!r} not found in catalog")
    if not _is_installed(app_id):
        raise ValueError(f"App {app_id!r} is not installed")

    result = await compose_service.remove_stack(app_id, remove_volumes=remove_data)
    return {
        "app_id": app_id,
        "name": app["name"],
        "installed": False,
        "output": result.get("output", ""),
    }
