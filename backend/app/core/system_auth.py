from __future__ import annotations

import asyncio
import os
import pty
import select
import time

from loguru import logger

# =============================================================================
# System (Linux) password verification.
#
# Used for "step-up" auth: before a dashboard admin performs a sensitive
# OS-level action (managing Linux users, changing their own dashboard
# password), they must prove they also know the Pi's root password.
#
# The authoritative check drives `su` through a pseudo-terminal — exactly the
# path the OS itself uses — so it validates against PAM and supports EVERY
# hashing scheme (yescrypt $y$, SHA-512 $6$, etc.) and honours account locking.
# A stdlib `crypt` comparison is kept only as a fast positive short-circuit
# for systems whose libcrypt understands the stored scheme.
# =============================================================================


async def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode or 0, out.decode(errors="replace").strip()
    except asyncio.TimeoutError:
        return -1, "timed out"
    except FileNotFoundError:
        return 127, "command not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


# ─── Fast path: stdlib crypt (positive short-circuit only) ───────────────────


async def _shadow_hash(username: str) -> str | None:
    code, out = await _run(["sudo", "getent", "shadow", username], timeout=6.0)
    if code != 0 or not out:
        return None
    parts = out.split(":")
    if len(parts) < 2:
        return None
    return parts[1] or None


def _crypt_matches(password: str, stored: str) -> bool:
    """True only when stdlib crypt can positively confirm the match.

    Any failure (module missing, unsupported scheme, mismatch) returns False,
    which just means "fall through to the authoritative PAM check" — never a
    false positive.
    """
    try:
        import crypt  # noqa: PLC0415 — optional, removed in Python 3.13
    except Exception:
        return False
    try:
        return bool(stored) and crypt.crypt(password, stored) == stored
    except Exception:
        return False


# ─── Authoritative path: PAM via su in a PTY ─────────────────────────────────


def _su_verify_blocking(username: str, password: str, timeout: float = 10.0) -> bool:
    """Return True iff `password` authenticates `username` via `su` + PAM.

    Runs in a forked PTY child so `su` finds a controlling terminal for its
    password prompt. Blocking — call via a thread executor.
    """
    try:
        pid, fd = pty.fork()
    except Exception as exc:  # noqa: BLE001
        logger.error("pty.fork failed during password verification: {}", exc)
        return False

    if pid == 0:
        # Child: become `su username -c true`. A clean env avoids locale noise.
        try:
            os.environ["LC_ALL"] = "C"
            os.execvp("su", ["su", username, "-c", "true"])
        except Exception:
            pass
        os._exit(127)

    # Parent: feed the password when prompted, then reap the exit status.
    deadline = time.time() + timeout
    buf = b""
    wrote = False
    try:
        while time.time() < deadline:
            try:
                r, _, _ = select.select([fd], [], [], 0.25)
            except (OSError, ValueError):
                break
            if fd in r:
                try:
                    data = os.read(fd, 1024)
                except OSError:
                    data = b""
                if data:
                    buf += data
                    if not wrote and b"assword" in buf.lower():
                        try:
                            os.write(fd, password.encode() + b"\n")
                        except OSError:
                            pass
                        wrote = True
            # Has the child finished?
            try:
                wpid, status = os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                # Reaped elsewhere — can't read the status, fail closed.
                return False
            if wpid == pid:
                return os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0
        # Timed out — kill and fail closed
        try:
            os.kill(pid, 9)
            os.waitpid(pid, 0)
        except OSError:
            pass
        return False
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


async def verify_system_password(username: str, password: str) -> bool:
    """True iff `password` is `username`'s actual Linux password on this Pi."""
    if not password:
        return False

    # Fast positive short-circuit when libcrypt understands the stored scheme.
    stored = await _shadow_hash(username)
    if stored and not stored.startswith("!") and stored not in ("*", ""):
        if _crypt_matches(password, stored):
            return True
    elif stored is not None and (stored.startswith("!") or stored in ("*", "")):
        # Locked or password-less account — nothing to verify against.
        return False

    # Authoritative PAM check (handles yescrypt and everything else).
    loop = asyncio.get_running_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _su_verify_blocking, username, password),
            timeout=12.0,
        )
    except asyncio.TimeoutError:
        logger.warning("su-based password verification timed out for {}", username)
        return False


async def verify_system_root_password(password: str) -> bool:
    """True iff `password` is root's actual Linux password on this Pi."""
    return await verify_system_password("root", password)
