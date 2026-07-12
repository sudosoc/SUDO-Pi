from __future__ import annotations

import asyncio
import os
from pathlib import Path


async def run_cmd(
    cmd: list[str],
    *,
    timeout: float | None = 10.0,
    stdin: bytes | None = None,
    env: dict[str, str] | None = None,
    cwd: Path | str | None = None,
    merge_stderr: bool = False,
) -> tuple[int, str, str]:
    """Async subprocess helper — the one true _run().

    Returns (returncode, stdout, stderr).

    merge_stderr=True  → stderr is piped into stdout; third element is always "".
    timeout=None       → no deadline; process runs to completion.
    env                → merged on top of the current process environment.
    stdin              → bytes written to the process's stdin pipe.
    cwd                → working directory for the subprocess.
    """
    proc_env: dict[str, str] | None = None
    if env is not None:
        proc_env = {**os.environ, **env}

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT if merge_stderr else asyncio.subprocess.PIPE,
        env=proc_env,
        cwd=str(cwd) if cwd is not None else None,
    )

    try:
        communicate = proc.communicate(input=stdin)
        if timeout is not None:
            raw_out, raw_err = await asyncio.wait_for(communicate, timeout=timeout)
        else:
            raw_out, raw_err = await communicate
    except asyncio.TimeoutError:
        try:
            proc.kill()
            await proc.communicate()
        except Exception:
            pass
        return -1, "", "Command timed out"
    except FileNotFoundError:
        return 127, "", "Command not found"
    except Exception as exc:
        return -1, "", str(exc)

    stdout = raw_out.decode(errors="replace") if raw_out else ""
    stderr = raw_err.decode(errors="replace") if raw_err is not None else ""
    return proc.returncode or 0, stdout, stderr
