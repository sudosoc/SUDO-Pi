from __future__ import annotations

import configparser
import io
import re
import time
from pathlib import Path

from loguru import logger

# ─── Constants ────────────────────────────────────────────────────────────────

RCLONE_CONFIG = Path("/opt/sudo-pi/.rclone.conf")
RCLONE_BIN = "/usr/bin/rclone"

CLOUD_PROVIDERS = [
    {"id": "gdrive",   "name": "Google Drive",  "type": "drive"},
    {"id": "s3",       "name": "Amazon S3",      "type": "s3"},
    {"id": "dropbox",  "name": "Dropbox",        "type": "dropbox"},
    {"id": "onedrive", "name": "OneDrive",       "type": "onedrive"},
    {"id": "sftp",     "name": "SFTP Server",    "type": "sftp"},
    {"id": "b2",       "name": "Backblaze B2",   "type": "b2"},
    {"id": "webdav",   "name": "WebDAV",         "type": "webdav"},
]

BACKUP_DIR = Path("/opt/sudo-pi/backups")

# ─── Internal helpers ─────────────────────────────────────────────────────────


from app.core.subprocess import run_cmd

async def _run(
    cmd: list[str],
    timeout: float = 60.0,
    env: dict[str, str] | None = None,
) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout, env=env)


def _rclone_env() -> dict[str, str]:
    """Pass config path via environment so we don't need --config on every call."""
    return {"RCLONE_CONFIG": str(RCLONE_CONFIG)}


def _load_config() -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    if RCLONE_CONFIG.exists():
        cfg.read(str(RCLONE_CONFIG))
    return cfg


def _save_config(cfg: configparser.ConfigParser) -> None:
    RCLONE_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    with open(RCLONE_CONFIG, "w") as f:
        cfg.write(f)


# ─── Public API ───────────────────────────────────────────────────────────────


async def is_rclone_installed() -> bool:
    """Check if rclone binary is available."""
    code, _, _ = await _run(["which", "rclone"], timeout=5.0)
    if code == 0:
        return True
    return Path(RCLONE_BIN).exists()


async def get_rclone_version() -> str | None:
    """Return rclone version string or None if not installed."""
    code, out, _ = await _run(["rclone", "version"], timeout=10.0)
    if code != 0:
        code, out, _ = await _run([RCLONE_BIN, "version"], timeout=10.0)
    if out:
        first_line = out.strip().splitlines()[0] if out.strip() else ""
        return first_line
    return None


async def install_rclone() -> dict:
    """Download and install rclone using the official install script."""
    if await is_rclone_installed():
        version = await get_rclone_version()
        return {"success": True, "message": "rclone is already installed", "version": version}

    code, out, err = await _run(
        ["sudo", "bash", "-c", "curl -s https://rclone.org/install.sh | sudo bash"],
        timeout=300.0,
    )
    if code == 0:
        version = await get_rclone_version()
        return {
            "success": True,
            "message": "rclone installed successfully",
            "version": version,
            "output": out.strip(),
        }

    # Fallback: try apt
    code2, out2, err2 = await _run(
        ["sudo", "apt-get", "install", "-y", "rclone"],
        timeout=300.0,
    )
    if code2 == 0:
        version = await get_rclone_version()
        return {
            "success": True,
            "message": "rclone installed via apt",
            "version": version,
        }

    return {
        "success": False,
        "message": "Installation failed",
        "error": (err + err2).strip(),
    }


async def get_remotes() -> list[dict]:
    """List all configured remotes with their type."""
    cfg = _load_config()
    remotes: list[dict] = []
    for section in cfg.sections():
        remote_type = cfg.get(section, "type", fallback="unknown")
        remotes.append({"name": section, "type": remote_type})
    return remotes


async def add_remote(name: str, provider_type: str, config_params: dict) -> dict:
    """
    Add a new rclone remote by writing the config file directly.

    provider_type should match rclone type strings: drive, s3, dropbox,
    onedrive, sftp, b2, webdav.
    """
    if not name or not re.match(r"^[a-zA-Z0-9_\-]+$", name):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail="Remote name must be alphanumeric (letters, digits, _ and - only)",
        )

    cfg = _load_config()
    if cfg.has_section(name):
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=f"Remote '{name}' already exists")

    cfg.add_section(name)
    cfg.set(name, "type", provider_type)

    # Provider-specific field mapping
    field_map: dict[str, list[str]] = {
        "drive": ["client_id", "client_secret", "token", "scope", "root_folder_id"],
        "s3": [
            "provider", "access_key_id", "secret_access_key", "region",
            "bucket", "endpoint", "acl",
        ],
        "dropbox": ["token", "client_id", "client_secret"],
        "onedrive": ["token", "client_id", "client_secret", "drive_id", "drive_type"],
        "sftp": ["host", "port", "user", "pass", "key_file", "key_pem"],
        "b2": ["account", "key", "hard_delete"],
        "webdav": ["url", "vendor", "user", "pass"],
    }

    allowed_keys = field_map.get(provider_type, list(config_params.keys()))

    for key, value in config_params.items():
        if key in allowed_keys and value not in (None, "", "null"):
            cfg.set(name, key, str(value))

    # S3: set default provider if not specified
    if provider_type == "s3" and not cfg.has_option(name, "provider"):
        cfg.set(name, "provider", "AWS")

    # SFTP: default port
    if provider_type == "sftp" and not cfg.has_option(name, "port"):
        cfg.set(name, "port", "22")

    _save_config(cfg)
    logger.info("Added rclone remote '{}' type={}", name, provider_type)
    return {"name": name, "type": provider_type, "message": "Remote added successfully"}


async def remove_remote(name: str) -> None:
    """Remove a remote from the rclone config file."""
    cfg = _load_config()
    if not cfg.has_section(name):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Remote '{name}' not found")
    cfg.remove_section(name)
    _save_config(cfg)
    logger.info("Removed rclone remote '{}'", name)


async def sync_to_remote(
    remote_path: str,
    local_dir: Path = BACKUP_DIR,
) -> dict:
    """
    Copy local backup directory to the remote path using rclone copy.

    remote_path should be e.g. "gdrive:sudo-pi-backups/"
    """
    if not await is_rclone_installed():
        return {
            "success": False,
            "error": "rclone is not installed",
            "transferred_count": 0,
            "transferred_bytes": 0,
            "elapsed_seconds": 0,
        }

    local_dir.mkdir(parents=True, exist_ok=True)
    start = time.monotonic()

    code, out, err = await _run(
        [
            "rclone", "copy",
            str(local_dir), remote_path,
            "--stats", "1s",
            "--stats-one-line",
            "--no-check-certificate",
        ],
        timeout=3600.0,
        env=_rclone_env(),
    )
    elapsed = time.monotonic() - start

    combined = (out + "\n" + err).strip()

    # Parse transferred count and size from rclone output
    transferred_count = 0
    transferred_bytes = 0
    m_count = re.search(r"Transferred:\s+(\d+)\s*/", combined)
    if m_count:
        transferred_count = int(m_count.group(1))

    m_bytes = re.search(r"Transferred:\s+([\d.]+\s*[KMGT]?Bytes)", combined, re.IGNORECASE)
    if m_bytes:
        raw = m_bytes.group(1).strip()
        transferred_bytes = _parse_size_str(raw)

    if code == 0:
        logger.info(
            "rclone sync to {} completed: {} files, {} bytes in {:.1f}s",
            remote_path, transferred_count, transferred_bytes, elapsed,
        )
        return {
            "success": True,
            "transferred_count": transferred_count,
            "transferred_bytes": transferred_bytes,
            "elapsed_seconds": round(elapsed, 2),
            "output": combined,
        }

    logger.error("rclone sync to {} failed: {}", remote_path, err.strip())
    return {
        "success": False,
        "error": (err or out).strip(),
        "transferred_count": transferred_count,
        "transferred_bytes": transferred_bytes,
        "elapsed_seconds": round(elapsed, 2),
    }


def _parse_size_str(s: str) -> int:
    """Parse rclone size string like '1.234 GBytes' to bytes."""
    s = s.strip()
    units = {
        "pbytes": 1024 ** 5, "tbytes": 1024 ** 4, "gbytes": 1024 ** 3,
        "mbytes": 1024 ** 2, "kbytes": 1024,      "bytes": 1,
    }
    lower = s.lower().replace(" ", "")
    for suffix, factor in units.items():
        if lower.endswith(suffix):
            try:
                return int(float(lower[: -len(suffix)]) * factor)
            except ValueError:
                return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


async def list_remote_files(remote_path: str) -> list[dict]:
    """
    List files at the given remote path.

    Returns list of {name, size, modified}.
    """
    code, out, err = await _run(
        ["rclone", "lsf", "--format=nst", remote_path],
        timeout=60.0,
        env=_rclone_env(),
    )
    if code != 0:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"rclone lsf failed: {err.strip() or out.strip()}",
        )

    files: list[dict] = []
    for line in out.strip().splitlines():
        parts = line.split(";", 2)
        if len(parts) == 3:
            name_raw, size_raw, modified_raw = parts
            try:
                size = int(size_raw.strip())
            except ValueError:
                size = 0
            files.append(
                {
                    "name": name_raw.strip(),
                    "size": size,
                    "modified": modified_raw.strip(),
                }
            )
    return files


async def test_remote(remote_name: str) -> dict:
    """
    Test a remote by listing a small number of files.

    Returns {success, files, error}.
    """
    if not await is_rclone_installed():
        return {"success": False, "error": "rclone is not installed", "files": []}

    code, out, err = await _run(
        ["rclone", "ls", "--max-depth", "1", f"{remote_name}:"],
        timeout=30.0,
        env=_rclone_env(),
    )
    if code != 0:
        return {
            "success": False,
            "error": (err or out).strip(),
            "files": [],
        }

    lines = out.strip().splitlines()
    sample: list[str] = []
    for line in lines[:5]:
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            sample.append(parts[1])

    return {
        "success": True,
        "files": sample,
        "message": f"Connection successful — {len(lines)} item(s) found",
    }


async def get_status() -> dict:
    """Return overall rclone status including version and configured remotes."""
    installed = await is_rclone_installed()
    version = None
    if installed:
        version = await get_rclone_version()
    remotes = await get_remotes() if installed else []
    providers = CLOUD_PROVIDERS

    return {
        "installed": installed,
        "version": version,
        "remotes": remotes,
        "providers": providers,
        "config_path": str(RCLONE_CONFIG),
    }
