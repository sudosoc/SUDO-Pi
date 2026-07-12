from __future__ import annotations

import asyncio

from loguru import logger

try:
    import docker
    from docker.errors import NotFound
    _docker_available = True
except ImportError:
    _docker_available = False


def _client():
    if not _docker_available:
        raise RuntimeError("docker Python package not installed")
    try:
        return docker.from_env()
    except Exception as exc:
        raise RuntimeError(f"Cannot connect to Docker daemon: {exc}") from exc


def _format_container(c) -> dict:
    ports_list: list[str] = []
    for container_port, host_bindings in (c.ports or {}).items():
        if host_bindings:
            for b in host_bindings:
                ports_list.append(f"{b['HostPort']}->{container_port}")
        else:
            ports_list.append(container_port)
    return {
        "id": c.short_id,
        "name": c.name,
        "image": c.image.tags[0] if c.image.tags else c.image.short_id,
        "status": c.status,
        "state": c.status,
        "created": c.attrs.get("Created", ""),
        "ports": ", ".join(ports_list),
    }


def _format_image(img) -> dict:
    return {
        "id": img.short_id,
        "repo_tags": img.tags,
        "size": img.attrs.get("Size", 0),
        "created": img.attrs.get("Created", ""),
    }


async def list_containers(all_containers: bool = True) -> list[dict]:
    def _sync() -> list[dict]:
        client = _client()
        return [_format_container(c) for c in client.containers.list(all=all_containers)]
    return await asyncio.to_thread(_sync)


async def container_action(container_id: str, action: str) -> dict:
    allowed = {"start", "stop", "restart", "pause", "unpause", "kill"}
    if action not in allowed:
        raise ValueError(f"Action {action!r} not allowed")

    def _sync() -> dict:
        client = _client()
        try:
            c = client.containers.get(container_id)
        except NotFound:
            raise ValueError(f"Container {container_id!r} not found")
        logger.info(f"Docker container action: {action} on {container_id}")
        getattr(c, action)()
        c.reload()
        return _format_container(c)

    return await asyncio.to_thread(_sync)


async def remove_container(container_id: str, force: bool = False) -> dict:
    def _sync() -> dict:
        client = _client()
        try:
            c = client.containers.get(container_id)
        except NotFound:
            raise ValueError(f"Container {container_id!r} not found")
        logger.info(f"Removing container: {container_id}")
        c.remove(force=force)
        return {"id": container_id, "status": "removed"}

    return await asyncio.to_thread(_sync)


async def list_images() -> list[dict]:
    def _sync() -> list[dict]:
        client = _client()
        return [_format_image(img) for img in client.images.list()]

    return await asyncio.to_thread(_sync)


async def remove_image(image_id: str, force: bool = False) -> dict:
    def _sync() -> dict:
        client = _client()
        try:
            client.images.remove(image_id, force=force)
        except NotFound:
            raise ValueError(f"Image {image_id!r} not found")
        logger.info(f"Removed Docker image: {image_id}")
        return {"id": image_id, "status": "removed"}

    return await asyncio.to_thread(_sync)
