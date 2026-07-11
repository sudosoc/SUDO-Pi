from __future__ import annotations

import asyncio
import json
import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

SCRIPTS_DIR = Path("/opt/sudo-pi/scripts")
HISTORY_FILE = Path("/opt/sudo-pi/script-history.json")
MAX_HISTORY = 200
RUN_TIMEOUT = 60.0


def _load_manifest() -> list[dict]:
    manifest = SCRIPTS_DIR / "manifest.json"
    try:
        return json.loads(manifest.read_text()) if manifest.exists() else []
    except Exception:
        return []


def _save_manifest(scripts: list[dict]) -> None:
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    (SCRIPTS_DIR / "manifest.json").write_text(json.dumps(scripts, indent=2))


def _load_history() -> list[dict]:
    try:
        return json.loads(HISTORY_FILE.read_text()) if HISTORY_FILE.exists() else []
    except Exception:
        return []


def _save_history(history: list[dict]) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history[:MAX_HISTORY], indent=2))


def _next_id(scripts: list[dict]) -> int:
    return max((s.get("id", 0) for s in scripts), default=0) + 1


def _script_path(script_id: int, language: str) -> Path:
    ext = "py" if language == "python" else "sh"
    return SCRIPTS_DIR / f"{script_id}.{ext}"


def _safe_language(lang: str) -> str:
    return "python" if lang == "python" else "bash"


async def list_scripts() -> list[dict]:
    scripts = _load_manifest()
    for s in scripts:
        fp = _script_path(s["id"], s.get("language", "bash"))
        s["content"] = fp.read_text(errors="replace") if fp.exists() else ""
    return scripts


async def get_script(script_id: int) -> dict:
    scripts = _load_manifest()
    s = next((s for s in scripts if s["id"] == script_id), None)
    if not s:
        raise ValueError(f"Script {script_id} not found")
    fp = _script_path(s["id"], s.get("language", "bash"))
    s["content"] = fp.read_text(errors="replace") if fp.exists() else ""
    return s


async def create_script(
    name: str,
    content: str,
    language: str = "bash",
    description: str = "",
) -> dict:
    language = _safe_language(language)
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    scripts = _load_manifest()
    script_id = _next_id(scripts)

    fp = _script_path(script_id, language)
    fp.write_text(content)
    if language == "bash":
        fp.chmod(fp.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    meta = {
        "id": script_id,
        "name": name,
        "language": language,
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_run": None,
        "last_exit_code": None,
    }
    scripts.append(meta)
    _save_manifest(scripts)
    meta["content"] = content
    logger.info("Script created: id={} name='{}'", script_id, name)
    return meta


async def update_script(
    script_id: int,
    name: str,
    content: str,
    description: str = "",
) -> dict:
    scripts = _load_manifest()
    idx = next((i for i, s in enumerate(scripts) if s["id"] == script_id), None)
    if idx is None:
        raise ValueError(f"Script {script_id} not found")

    language = scripts[idx].get("language", "bash")
    fp = _script_path(script_id, language)
    fp.write_text(content)
    if language == "bash":
        fp.chmod(fp.stat().st_mode | stat.S_IEXEC)

    scripts[idx].update({
        "name": name,
        "description": description,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    _save_manifest(scripts)
    scripts[idx]["content"] = content
    return scripts[idx]


async def delete_script(script_id: int) -> None:
    scripts = _load_manifest()
    s = next((s for s in scripts if s["id"] == script_id), None)
    if not s:
        raise ValueError(f"Script {script_id} not found")

    for ext in ("sh", "py"):
        fp = SCRIPTS_DIR / f"{script_id}.{ext}"
        fp.unlink(missing_ok=True)

    _save_manifest([s for s in scripts if s["id"] != script_id])
    logger.info("Script {} deleted", script_id)


async def run_script(script_id: int) -> dict:
    scripts = _load_manifest()
    idx = next((i for i, s in enumerate(scripts) if s["id"] == script_id), None)
    if idx is None:
        raise ValueError(f"Script {script_id} not found")

    s = scripts[idx]
    language = s.get("language", "bash")
    fp = _script_path(script_id, language)
    if not fp.exists():
        raise ValueError(f"Script file not found: {fp}")

    cmd = ["python3", str(fp)] if language == "python" else ["bash", str(fp)]
    started_at = datetime.now(timezone.utc)

    env = {**os.environ, "HOME": "/opt/sudo-pi", "TERM": "xterm-256color"}

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=RUN_TIMEOUT)
        exit_code = proc.returncode if proc.returncode is not None else 0
        output = stdout.decode(errors="replace")[:20_000]
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        exit_code = -1
        output = f"Script timed out after {int(RUN_TIMEOUT)}s\n"
    except Exception as exc:
        exit_code = -1
        output = f"Execution error: {exc}\n"

    finished_at = datetime.now(timezone.utc)
    duration_ms = int((finished_at - started_at).total_seconds() * 1000)

    run = {
        "script_id": script_id,
        "script_name": s["name"],
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_ms": duration_ms,
        "exit_code": exit_code,
        "output": output,
        "success": exit_code == 0,
    }

    history = _load_history()
    history.insert(0, run)
    _save_history(history)

    # Update last run info in manifest
    scripts[idx]["last_run"] = started_at.isoformat()
    scripts[idx]["last_exit_code"] = exit_code
    _save_manifest(scripts)

    logger.info(
        "Script {} '{}' ran in {}ms, exit_code={}",
        script_id, s["name"], duration_ms, exit_code,
    )
    return run


async def get_history(script_id: int | None = None, limit: int = 50) -> list[dict]:
    history = _load_history()
    if script_id is not None:
        history = [h for h in history if h.get("script_id") == script_id]
    return history[:limit]
