from __future__ import annotations

import asyncio
import json
import os
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

SNAPSHOT_DIR = Path("/opt/sudo-pi/snapshots")
MANIFEST_FILE = SNAPSHOT_DIR / "manifest.json"

_CONFIG_PATHS = [
    "/etc/sudo-pi",
    "/etc/dnsmasq.d",
    "/etc/wireguard",
]
_NGINX_PATTERNS = [
    "/etc/nginx/sites-available/sudo-pi.conf",
    "/etc/nginx/sites-available/sudo-pi-portal",
]


def _load_manifest() -> list[dict]:
    try:
        return json.loads(MANIFEST_FILE.read_text()) if MANIFEST_FILE.exists() else []
    except Exception:
        return []


def _save_manifest(items: list[dict]) -> None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_FILE.write_text(json.dumps(items, indent=2))


def _next_id(items: list[dict]) -> int:
    return max((i.get("id", 0) for i in items), default=0) + 1


async def list_snapshots() -> list[dict]:
    items = _load_manifest()
    for item in items:
        p = Path(item.get("path", ""))
        item["file_exists"] = p.exists()
        if p.exists():
            item["size"] = p.stat().st_size
    return items


async def create_snapshot(label: str = "") -> dict:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc)
    ts_str = ts.strftime("%Y%m%d_%H%M%S")
    filename = f"snapshot_{ts_str}.tar.gz"
    path = SNAPSHOT_DIR / filename

    included: list[str] = []
    with tarfile.open(str(path), "w:gz") as tar:
        for src in _CONFIG_PATHS:
            p = Path(src)
            if p.exists():
                tar.add(str(p), arcname=src.lstrip("/"))
                included.append(src)
        for src in _NGINX_PATTERNS:
            p = Path(src)
            if p.exists():
                tar.add(str(p), arcname=src.lstrip("/"))
                included.append(src)
        # Include backend .env if present
        env_file = Path("/opt/sudo-pi/backend/.env")
        if env_file.exists():
            tar.add(str(env_file), arcname="opt/sudo-pi/backend/.env")
            included.append(str(env_file))

    size = path.stat().st_size
    items = _load_manifest()
    item = {
        "id": _next_id(items),
        "label": label or f"Snapshot {ts_str}",
        "created_at": ts.isoformat(),
        "path": str(path),
        "filename": filename,
        "size": size,
        "file_exists": True,
        "included_paths": included,
    }
    items.insert(0, item)
    _save_manifest(items)
    logger.info("Snapshot created: {} ({} bytes)", filename, size)
    return item


async def delete_snapshot(snapshot_id: int) -> None:
    items = _load_manifest()
    item = next((i for i in items if i["id"] == snapshot_id), None)
    if not item:
        raise ValueError(f"Snapshot {snapshot_id} not found")
    p = Path(item["path"])
    if p.exists():
        p.unlink()
    _save_manifest([i for i in items if i["id"] != snapshot_id])
    logger.info("Snapshot {} deleted", snapshot_id)


async def get_snapshot_path(snapshot_id: int) -> Path:
    items = _load_manifest()
    item = next((i for i in items if i["id"] == snapshot_id), None)
    if not item:
        raise ValueError(f"Snapshot {snapshot_id} not found")
    p = Path(item["path"])
    if not p.exists():
        raise FileNotFoundError(f"Snapshot file not found: {p}")
    return p


async def restore_snapshot(snapshot_id: int) -> dict:
    items = _load_manifest()
    item = next((i for i in items if i["id"] == snapshot_id), None)
    if not item:
        raise ValueError(f"Snapshot {snapshot_id} not found")

    p = Path(item["path"])
    if not p.exists():
        raise FileNotFoundError("Snapshot archive not found on disk")

    restored: list[str] = []
    safe_prefixes = ("etc/sudo-pi/", "etc/dnsmasq.d/", "etc/wireguard/")

    with tempfile.TemporaryDirectory(prefix="sudopi_snap_") as tmpdir:
        # Extract archive to a temp dir (no root needed)
        with tarfile.open(str(p), "r:gz") as tar:
            for member in tar.getmembers():
                if any(member.name.startswith(pfx) for pfx in safe_prefixes):
                    tar.extract(member, path=tmpdir, set_attrs=False)
                    restored.append(f"/{member.name}")

        # Move each file to its destination using sudo
        for rel in restored:
            src = os.path.join(tmpdir, rel.lstrip("/"))
            dst = rel
            dst_dir = os.path.dirname(dst)
            # Ensure parent directory exists
            mk = await asyncio.create_subprocess_exec(
                "sudo", "mkdir", "-p", dst_dir,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await mk.wait()
            cp = await asyncio.create_subprocess_exec(
                "sudo", "cp", "--", src, dst,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await cp.wait()

    # Reload services that depend on restored configs
    for cmd in [
        ["sudo", "systemctl", "reload", "nginx"],
        ["sudo", "systemctl", "restart", "dnsmasq"],
    ]:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    logger.info("Snapshot {} restored: {} files", snapshot_id, len(restored))
    return {
        "snapshot_id": snapshot_id,
        "label": item.get("label", ""),
        "restored_files": len(restored),
        "log": restored[:50],
    }
