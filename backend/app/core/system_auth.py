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


import ctypes
import ctypes.util
import threading

# crypt(3) from the system C library is NOT thread-safe (static return buffer),
# and we call it from executor threads — serialise access.
_crypt_lock = threading.Lock()
_libcrypt: ctypes.CDLL | None = None
_libcrypt_loaded = False


def _load_libcrypt() -> ctypes.CDLL | None:
    """Load the system libcrypt once. On Debian/Kali this is libxcrypt, which
    understands yescrypt ($y$), SHA-512 ($6$), and every other stored scheme —
    the same library PAM's pam_unix uses, so it's authoritative."""
    global _libcrypt, _libcrypt_loaded
    if _libcrypt_loaded:
        return _libcrypt
    _libcrypt_loaded = True
    for name in ("crypt", None):
        try:
            libname = ctypes.util.find_library(name) if name else "libcrypt.so.1"
            if not libname:
                continue
            lib = ctypes.CDLL(libname, use_errno=True)
            lib.crypt.restype = ctypes.c_char_p
            lib.crypt.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
            _libcrypt = lib
            return _libcrypt
        except Exception:
            continue
    logger.warning("system libcrypt not loadable — falling back to su for password checks")
    return None


def _crypt_matches(password: str, stored: str) -> bool:
    """True only when the system libcrypt positively confirms the match.

    Calls crypt(3) with the stored hash as the setting: for yescrypt/SHA-512
    the returned string equals the stored hash exactly on success. Any failure
    (lib missing, unsupported scheme, mismatch, NULL return) yields False, which
    just means "fall through to the su check" — never a false positive.

    Tries the system libcrypt via ctypes first (works on Python 3.13 where the
    stdlib crypt module was removed), then the stdlib module as a backup.
    """
    if not stored:
        return False

    lib = _load_libcrypt()
    if lib is not None:
        try:
            with _crypt_lock:
                res = lib.crypt(password.encode("utf-8", "surrogateescape"),
                                stored.encode("utf-8", "surrogateescape"))
            if res:
                return res.decode("utf-8", "replace") == stored
        except Exception as exc:  # noqa: BLE001
            logger.debug("libcrypt crypt() failed: {}", exc)

    # Backup: stdlib crypt (present on Python < 3.13, may lack yescrypt)
    try:
        import crypt as _pycrypt  # noqa: PLC0415
        return _pycrypt.crypt(password, stored) == stored
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

    loop = asyncio.get_running_loop()

    # Authoritative check: hash the candidate with the system libcrypt and
    # compare to /etc/shadow. This handles yescrypt natively and is the whole
    # fix — the old su/PTY path failed on Kali's yescrypt root hash.
    stored = await _shadow_hash(username)
    if stored is not None:
        if stored.startswith("!") or stored in ("*", ""):
            # Locked or password-less account — nothing to authenticate against.
            return False
        try:
            matched = await asyncio.wait_for(
                loop.run_in_executor(None, _crypt_matches, password, stored),
                timeout=8.0,
            )
            if matched:
                return True
            # A readable hash that didn't match means the password is wrong —
            # but only trust that verdict if libcrypt actually handled the
            # scheme. If libcrypt is unavailable we can't be sure, so we still
            # fall through to su below.
            if _load_libcrypt() is not None:
                return False
        except asyncio.TimeoutError:
            logger.warning("libcrypt password verification timed out for {}", username)

    # Fallback: PAM via su (covers exotic setups where we can't read shadow).
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
