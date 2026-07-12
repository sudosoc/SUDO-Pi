from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import yaml
from loguru import logger

COMPOSE_DIR = Path("/opt/sudo-pi/compose-stacks")

_STACK_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9\-]*$")


def _stack_path(name: str) -> Path:
    return COMPOSE_DIR / name


def _stack_compose_file(name: str) -> Path:
    return _stack_path(name) / "docker-compose.yml"


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=None, cwd=cwd)


async def _get_stack_services(name: str) -> list[dict]:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        return []
    rc, stdout, _ = await _run(
        ["docker", "compose", "ps", "--format", "json"],
        cwd=stack_dir,
    )
    if rc != 0 or not stdout.strip():
        return []
    services: list[dict] = []
    for line in stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            # docker compose ps --format json may return a JSON array or newline-delimited objects
            if isinstance(obj, list):
                for svc in obj:
                    services.append(_format_service(svc))
            else:
                services.append(_format_service(obj))
        except json.JSONDecodeError:
            continue
    return services


def _format_service(svc: dict) -> dict:
    ports_raw = svc.get("Publishers") or svc.get("Ports") or []
    ports: list[str] = []
    if isinstance(ports_raw, list):
        for p in ports_raw:
            if isinstance(p, dict):
                host_port = p.get("PublishedPort", 0)
                target = p.get("TargetPort", 0)
                proto = p.get("Protocol", "tcp")
                if host_port:
                    ports.append(f"{host_port}->{target}/{proto}")
            elif isinstance(p, str):
                ports.append(p)
    elif isinstance(ports_raw, str):
        ports = [ports_raw] if ports_raw else []

    return {
        "name": svc.get("Service") or svc.get("Name", ""),
        "image": svc.get("Image", ""),
        "status": svc.get("State") or svc.get("Status", ""),
        "ports": ports,
    }


async def list_stacks() -> list[dict]:
    COMPOSE_DIR.mkdir(parents=True, exist_ok=True)
    stacks: list[dict] = []
    for stack_dir in sorted(COMPOSE_DIR.iterdir()):
        if not stack_dir.is_dir():
            continue
        compose_file = stack_dir / "docker-compose.yml"
        if not compose_file.exists():
            continue
        name = stack_dir.name
        services = await _get_stack_services(name)
        running = sum(1 for s in services if s["status"] in ("running", "Up"))
        stacks.append({
            "name": name,
            "path": str(stack_dir),
            "services": services,
            "running": running,
            "total": len(services),
        })
    return stacks


async def get_stack_status(name: str) -> dict:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        raise ValueError(f"Stack {name!r} not found")
    services = await _get_stack_services(name)
    running = sum(1 for s in services if s["status"] in ("running", "Up"))
    return {
        "name": name,
        "path": str(stack_dir),
        "services": services,
        "running": running,
        "total": len(services),
    }


async def create_stack(name: str, compose_content: str) -> dict:
    if not _STACK_NAME_RE.match(name):
        raise ValueError("Stack name must be lowercase alphanumeric and hyphens, starting with a letter or digit")
    if len(name) > 50:
        raise ValueError("Stack name must be 50 characters or fewer")

    try:
        parsed = yaml.safe_load(compose_content)
        if not isinstance(parsed, dict):
            raise ValueError("Compose content must be a YAML mapping")
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc

    stack_dir = _stack_path(name)
    stack_dir.mkdir(parents=True, exist_ok=True)
    compose_file = _stack_compose_file(name)
    compose_file.write_text(compose_content, encoding="utf-8")
    logger.info("Created compose stack {!r} at {}", name, stack_dir)

    return {
        "name": name,
        "path": str(stack_dir),
        "services": [],
        "running": 0,
        "total": 0,
    }


async def start_stack(name: str) -> dict:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        raise ValueError(f"Stack {name!r} not found")
    logger.info("Starting compose stack {!r}", name)
    rc, stdout, stderr = await _run(
        ["docker", "compose", "up", "-d", "--remove-orphans"],
        cwd=stack_dir,
    )
    output = (stdout + stderr).strip()
    if rc != 0:
        raise RuntimeError(f"docker compose up failed: {output}")
    return {"success": True, "output": output}


async def stop_stack(name: str) -> dict:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        raise ValueError(f"Stack {name!r} not found")
    logger.info("Stopping compose stack {!r}", name)
    rc, stdout, stderr = await _run(
        ["docker", "compose", "down"],
        cwd=stack_dir,
    )
    output = (stdout + stderr).strip()
    if rc != 0:
        raise RuntimeError(f"docker compose down failed: {output}")
    return {"success": True, "output": output}


async def remove_stack(name: str, remove_volumes: bool = False) -> dict:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        raise ValueError(f"Stack {name!r} not found")
    logger.info("Removing compose stack {!r} (volumes={})", name, remove_volumes)
    cmd = ["docker", "compose", "down"]
    if remove_volumes:
        cmd.append("--volumes")
    rc, stdout, stderr = await _run(cmd, cwd=stack_dir)
    output = (stdout + stderr).strip()
    if rc != 0:
        raise RuntimeError(f"docker compose down failed: {output}")
    shutil.rmtree(stack_dir, ignore_errors=True)
    return {"success": True, "output": output}


async def get_stack_logs(name: str, lines: int = 100) -> str:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        raise ValueError(f"Stack {name!r} not found")
    rc, stdout, stderr = await _run(
        ["docker", "compose", "logs", "--no-color", f"--tail={lines}"],
        cwd=stack_dir,
    )
    return (stdout + stderr).strip()


async def pull_stack_images(name: str) -> dict:
    stack_dir = _stack_path(name)
    if not stack_dir.exists():
        raise ValueError(f"Stack {name!r} not found")
    logger.info("Pulling images for compose stack {!r}", name)
    rc, stdout, stderr = await _run(
        ["docker", "compose", "pull"],
        cwd=stack_dir,
    )
    output = (stdout + stderr).strip()
    if rc != 0:
        raise RuntimeError(f"docker compose pull failed: {output}")
    return {"success": True, "output": output}
