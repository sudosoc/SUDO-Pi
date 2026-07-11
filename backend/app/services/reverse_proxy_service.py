from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from loguru import logger

SITES_AVAILABLE = Path("/etc/nginx/sites-available")
SITES_ENABLED = Path("/etc/nginx/sites-enabled")
HOSTS_FILE = Path("/etc/sudo-pi/reverse-proxy-hosts.json")

_CONF_TEMPLATE = """\
# sudo-pi-reverse-proxy name={name}
server {{
    listen 80;
    server_name {domain};

    location / {{
        proxy_pass http://{upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }}
}}
"""


async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return -1, "", "Command timed out"
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


def _load_hosts() -> list[dict]:
    try:
        return json.loads(HOSTS_FILE.read_text()) if HOSTS_FILE.exists() else []
    except Exception:
        return []


def _save_hosts(hosts: list[dict]) -> None:
    HOSTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    HOSTS_FILE.write_text(json.dumps(hosts, indent=2))


async def _write_nginx_conf(name: str, conf: str) -> None:
    path = SITES_AVAILABLE / f"sudopi-proxy-{name}.conf"
    proc = await asyncio.create_subprocess_exec(
        "sudo", "tee", str(path),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate(input=conf.encode())
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to write nginx config: {err.decode(errors='replace')}")


async def _enable_site(name: str) -> None:
    src = SITES_AVAILABLE / f"sudopi-proxy-{name}.conf"
    dst = SITES_ENABLED / f"sudopi-proxy-{name}.conf"
    await _run(["sudo", "ln", "-sf", str(src), str(dst)])


async def _disable_site(name: str) -> None:
    dst = SITES_ENABLED / f"sudopi-proxy-{name}.conf"
    await _run(["sudo", "rm", "-f", str(dst)])


async def _remove_conf(name: str) -> None:
    src = SITES_AVAILABLE / f"sudopi-proxy-{name}.conf"
    await _run(["sudo", "rm", "-f", str(src)])


async def _reload_nginx() -> None:
    code, _, err = await _run(["sudo", "nginx", "-t"], timeout=5.0)
    if code != 0:
        raise RuntimeError(f"nginx config test failed: {err.strip()}")
    await _run(["sudo", "systemctl", "reload", "nginx"], timeout=15.0)


def _validate_name(name: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9_\-]{1,64}$", name))


def _validate_domain(domain: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9.\-_*]{3,255}$", domain))


async def list_hosts() -> list[dict]:
    return _load_hosts()


async def add_host(
    name: str,
    domain: str,
    upstream_host: str,
    upstream_port: int,
    enabled: bool = True,
) -> dict:
    if not _validate_name(name):
        raise ValueError(f"Invalid name '{name}' — use only letters, numbers, hyphens, underscores.")
    if not _validate_domain(domain):
        raise ValueError(f"Invalid domain: {domain!r}")

    hosts = _load_hosts()
    if any(h["name"] == name for h in hosts):
        raise ValueError(f"Host '{name}' already exists.")

    upstream = f"{upstream_host}:{upstream_port}"
    conf = _CONF_TEMPLATE.format(name=name, domain=domain, upstream=upstream)
    await _write_nginx_conf(name, conf)

    if enabled:
        await _enable_site(name)

    await _reload_nginx()

    host = {
        "name": name,
        "domain": domain,
        "upstream_host": upstream_host,
        "upstream_port": upstream_port,
        "enabled": enabled,
    }
    hosts.append(host)
    _save_hosts(hosts)
    logger.info("Reverse proxy: added host '{}' → {}:{}", name, upstream_host, upstream_port)
    return host


async def update_host(
    name: str,
    domain: str,
    upstream_host: str,
    upstream_port: int,
    enabled: bool,
) -> dict:
    if not _validate_name(name):
        raise ValueError(f"Invalid name: {name!r}")

    hosts = _load_hosts()
    idx = next((i for i, h in enumerate(hosts) if h["name"] == name), None)
    if idx is None:
        raise ValueError(f"Host '{name}' not found.")

    upstream = f"{upstream_host}:{upstream_port}"
    conf = _CONF_TEMPLATE.format(name=name, domain=domain, upstream=upstream)
    await _write_nginx_conf(name, conf)

    if enabled:
        await _enable_site(name)
    else:
        await _disable_site(name)

    await _reload_nginx()

    hosts[idx] = {
        "name": name,
        "domain": domain,
        "upstream_host": upstream_host,
        "upstream_port": upstream_port,
        "enabled": enabled,
    }
    _save_hosts(hosts)
    return hosts[idx]


async def delete_host(name: str) -> None:
    if not _validate_name(name):
        raise ValueError(f"Invalid name: {name!r}")

    hosts = _load_hosts()
    hosts = [h for h in hosts if h["name"] != name]

    await _disable_site(name)
    await _remove_conf(name)

    try:
        await _reload_nginx()
    except RuntimeError:
        pass

    _save_hosts(hosts)
    logger.info("Reverse proxy: deleted host '{}'", name)


async def toggle_host(name: str, enabled: bool) -> dict:
    hosts = _load_hosts()
    host = next((h for h in hosts if h["name"] == name), None)
    if not host:
        raise ValueError(f"Host '{name}' not found.")

    if enabled:
        await _enable_site(name)
    else:
        await _disable_site(name)

    await _reload_nginx()
    host["enabled"] = enabled
    _save_hosts(hosts)
    return host
