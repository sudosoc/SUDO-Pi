import re
from pathlib import Path
from loguru import logger

MANAGED_CRON_FILE = Path("/etc/cron.d/sudo-pi-managed")
SYSTEM_CRON_DIR = Path("/etc/cron.d")


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout)


def _looks_like_disabled_job(line: str) -> bool:
    """Return True if a # comment line is actually a disabled cron entry."""
    if not line.startswith("#"):
        return False
    stripped = line[1:].strip()
    parts = stripped.split(None, 5)
    if len(parts) < 6:
        return False
    return all(re.match(r"^[\d\*/,\-]+$", p) for p in parts[:5])


def _parse_crontab_line(
    line: str, source: str, line_num: int, comment_above: str = ""
) -> dict | None:
    """Parse a single cron line (cron.d format: MIN HOUR DOM MON DOW USER COMMAND).

    Disabled jobs start with # followed by valid cron fields.
    Returns None for blank lines, pure comments, or variable assignments.
    """
    stripped = line.strip()
    enabled = True

    if not stripped:
        return None

    # Variable assignment
    if re.match(r"^\s*\w+=", stripped):
        return None

    # Possibly a disabled cron entry
    if stripped.startswith("#"):
        if not _looks_like_disabled_job(stripped):
            return None
        # It IS a disabled job
        enabled = False
        stripped = stripped[1:].strip()

    parts = stripped.split(None, 6)
    if len(parts) < 6:
        return None

    minute, hour, dom, month, dow = parts[0], parts[1], parts[2], parts[3], parts[4]

    # Validate the first 5 fields look like cron
    for field in [minute, hour, dom, month, dow]:
        if not re.match(r"^[\d\*/,\-]+$", field):
            return None

    if len(parts) == 7:
        user = parts[5]
        command = parts[6]
    else:
        user = "root"
        command = parts[5]

    schedule = f"{minute} {hour} {dom} {month} {dow}"
    job_id = f"{source}:{line_num}"
    is_read_only = not source.startswith("managed")

    return {
        "id": job_id,
        "schedule": schedule,
        "minute": minute,
        "hour": hour,
        "dom": dom,
        "month": month,
        "dow": dow,
        "user": user,
        "command": command,
        "enabled": enabled,
        "source": source,
        "comment": comment_above,
        "read_only": is_read_only,
    }


def _read_managed_file() -> list[str]:
    """Read the managed cron file, creating it with a header if it does not exist."""
    if not MANAGED_CRON_FILE.exists():
        try:
            MANAGED_CRON_FILE.parent.mkdir(parents=True, exist_ok=True)
            MANAGED_CRON_FILE.write_text(
                "# SUDO-Pi Managed Cron Jobs\n"
                "# Do not edit manually — managed by SUDO-Pi web interface\n"
                "SHELL=/bin/bash\n"
                "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n"
            )
        except Exception as exc:
            logger.warning("Could not create managed cron file: {}", exc)
            return []
    try:
        return MANAGED_CRON_FILE.read_text().splitlines()
    except Exception as exc:
        logger.error("Could not read managed cron file: {}", exc)
        return []


def _parse_lines(lines: list[str], source: str) -> list[dict]:
    jobs = []
    comment_above = ""
    for i, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped:
            comment_above = ""
            continue
        if stripped.startswith("#") and not _looks_like_disabled_job(stripped):
            comment_above = stripped[1:].strip()
            continue
        job = _parse_crontab_line(stripped, source, i, comment_above)
        if job is not None:
            jobs.append(job)
            comment_above = ""
        else:
            # non-job, non-comment line resets the pending comment
            if "=" not in stripped:
                comment_above = ""
    return jobs


async def list_jobs() -> list[dict]:
    """Return all cron jobs: managed (read-write) + system cron.d (read-only)."""
    jobs: list[dict] = []

    # Managed file
    lines = _read_managed_file()
    jobs.extend(_parse_lines(lines, "managed"))

    # System cron.d files (read-only)
    try:
        if SYSTEM_CRON_DIR.exists():
            for cron_file in sorted(SYSTEM_CRON_DIR.iterdir()):
                if cron_file.name == MANAGED_CRON_FILE.name:
                    continue
                if not cron_file.is_file():
                    continue
                try:
                    file_lines = cron_file.read_text().splitlines()
                    source_name = f"system:{cron_file.name}"
                    file_jobs = _parse_lines(file_lines, source_name)
                    for j in file_jobs:
                        j["read_only"] = True
                    jobs.extend(file_jobs)
                except Exception as exc:
                    logger.debug("Could not read {}: {}", cron_file, exc)
    except Exception as exc:
        logger.debug("Could not scan cron.d: {}", exc)

    return jobs


async def _write_managed(lines: list[str]) -> None:
    """Write lines to the managed cron file, using sudo if needed."""
    content = "\n".join(lines)
    if not content.endswith("\n"):
        content += "\n"
    try:
        MANAGED_CRON_FILE.write_text(content)
    except PermissionError:
        import tempfile, os
        with tempfile.NamedTemporaryFile(mode="w", suffix=".cron", delete=False) as f:
            f.write(content)
            tmp_path = f.name
        rc, _, err = await _run(["sudo", "cp", tmp_path, str(MANAGED_CRON_FILE)])
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        if rc != 0:
            raise RuntimeError(f"Failed to write cron file: {err}")


async def add_job(
    minute: str,
    hour: str,
    dom: str,
    month: str,
    dow: str,
    user: str,
    command: str,
    comment: str = "",
) -> dict:
    """Append a new job to the managed cron file and return the created job dict."""
    lines = _read_managed_file()
    # Remove trailing blank lines
    while lines and not lines[-1].strip():
        lines.pop()

    line_num = len(lines) + (1 if comment else 0)

    if comment:
        lines.append(f"# {comment}")
    lines.append(f"{minute} {hour} {dom} {month} {dow} {user} {command}")
    lines.append("")

    await _write_managed(lines)

    schedule = f"{minute} {hour} {dom} {month} {dow}"
    return {
        "id": f"managed:{line_num}",
        "schedule": schedule,
        "minute": minute,
        "hour": hour,
        "dom": dom,
        "month": month,
        "dow": dow,
        "user": user,
        "command": command,
        "enabled": True,
        "source": "managed",
        "comment": comment,
        "read_only": False,
    }


async def update_job(
    job_id: str,
    minute: str,
    hour: str,
    dom: str,
    month: str,
    dow: str,
    user: str,
    command: str,
    comment: str = "",
) -> dict | None:
    """Rewrite a managed job in-place. Returns updated job dict or None if not found."""
    if not job_id.startswith("managed:"):
        return None
    try:
        target_line = int(job_id.split(":", 1)[1])
    except ValueError:
        return None

    lines = _read_managed_file()
    if target_line >= len(lines):
        return None

    new_job_line = f"{minute} {hour} {dom} {month} {dow} {user} {command}"
    new_lines = list(lines)

    # Detect existing comment line directly above the job
    comment_idx = target_line - 1
    has_comment = (
        comment_idx >= 0
        and new_lines[comment_idx].strip().startswith("#")
        and not _looks_like_disabled_job(new_lines[comment_idx].strip())
    )

    if comment:
        if has_comment:
            new_lines[comment_idx] = f"# {comment}"
        else:
            new_lines.insert(target_line, f"# {comment}")
            target_line += 1
    else:
        if has_comment:
            new_lines.pop(comment_idx)
            target_line -= 1

    new_lines[target_line] = new_job_line

    await _write_managed(new_lines)

    schedule = f"{minute} {hour} {dom} {month} {dow}"
    return {
        "id": job_id,
        "schedule": schedule,
        "minute": minute,
        "hour": hour,
        "dom": dom,
        "month": month,
        "dow": dow,
        "user": user,
        "command": command,
        "enabled": True,
        "source": "managed",
        "comment": comment,
        "read_only": False,
    }


async def delete_job(job_id: str) -> bool:
    """Delete a managed job by its id. Returns True on success."""
    if not job_id.startswith("managed:"):
        return False
    try:
        target_line = int(job_id.split(":", 1)[1])
    except ValueError:
        return False

    lines = _read_managed_file()
    if target_line >= len(lines):
        return False

    new_lines = list(lines)

    # Remove comment line above if it belongs to this job
    comment_idx = target_line - 1
    if (
        comment_idx >= 0
        and new_lines[comment_idx].strip().startswith("#")
        and not _looks_like_disabled_job(new_lines[comment_idx].strip())
    ):
        new_lines.pop(comment_idx)
        target_line -= 1

    if target_line < len(new_lines):
        new_lines.pop(target_line)

    # Remove blank line that was below
    if target_line < len(new_lines) and not new_lines[target_line].strip():
        new_lines.pop(target_line)

    try:
        await _write_managed(new_lines)
        return True
    except Exception as exc:
        logger.error("Failed to delete job {}: {}", job_id, exc)
        return False


async def toggle_job(job_id: str) -> bool | None:
    """Comment/uncomment a managed job line. Returns new enabled state, or None on error."""
    if not job_id.startswith("managed:"):
        return None
    try:
        target_line = int(job_id.split(":", 1)[1])
    except ValueError:
        return None

    lines = _read_managed_file()
    if target_line >= len(lines):
        return None

    stripped = lines[target_line].strip()

    if stripped.startswith("#") and _looks_like_disabled_job(stripped):
        # Enable it
        new_line = stripped[1:].strip()
        new_enabled = True
    else:
        # Disable it
        new_line = f"# {stripped}"
        new_enabled = False

    new_lines = list(lines)
    new_lines[target_line] = new_line

    try:
        await _write_managed(new_lines)
        return new_enabled
    except Exception as exc:
        logger.error("Failed to toggle job {}: {}", job_id, exc)
        return None


def validate_cron_schedule(
    minute: str, hour: str, dom: str, month: str, dow: str
) -> bool:
    """Return True if all five cron schedule fields are syntactically valid."""

    def valid_field(val: str, lo: int, hi: int) -> bool:
        if val == "*":
            return True
        if val.startswith("*/"):
            try:
                n = int(val[2:])
                return n > 0
            except ValueError:
                return False
        for part in val.split(","):
            if "/" in part:
                base, _, step = part.partition("/")
                try:
                    int(step)
                except ValueError:
                    return False
                part = base
            if "-" in part:
                sub = part.split("-")
                if len(sub) != 2:
                    return False
                try:
                    a, b = int(sub[0]), int(sub[1])
                    if not (lo <= a <= b <= hi):
                        return False
                except ValueError:
                    return False
            else:
                try:
                    v = int(part)
                    if not (lo <= v <= hi):
                        return False
                except ValueError:
                    return False
        return True

    try:
        return (
            valid_field(minute, 0, 59)
            and valid_field(hour, 0, 23)
            and valid_field(dom, 1, 31)
            and valid_field(month, 1, 12)
            and valid_field(dow, 0, 7)
        )
    except Exception:
        return False


async def run_job_now(command: str, user: str = "root") -> tuple[int, str, str]:
    """Execute a cron command immediately via sudo -u <user> bash -c."""
    return await _run(["sudo", "-u", user, "bash", "-c", command], timeout=60.0)
