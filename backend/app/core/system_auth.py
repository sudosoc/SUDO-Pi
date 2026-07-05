from __future__ import annotations

import asyncio

from loguru import logger

# =============================================================================
# System (Linux) password verification.
#
# Used for "step-up" auth: before a dashboard admin performs a sensitive
# OS-level action (managing Linux users, changing their own dashboard
# password), they must prove they also know the Pi's root password.
#
# We read root's shadow hash via sudo and verify the supplied password against
# it — first with Python's crypt (when available), falling back to `openssl
# passwd` which is present on every Debian/Kali box. No plaintext is ever
# written to disk and the hash never leaves this process.
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


async def _shadow_hash(username: str) -> str | None:
    """Return the password hash field from the shadow entry, or None."""
    code, out = await _run(["sudo", "getent", "shadow", username], timeout=6.0)
    if code != 0 or not out:
        return None
    parts = out.split(":")
    if len(parts) < 2:
        return None
    return parts[1] or None


def _crypt_verify(password: str, stored: str) -> bool | None:
    """Verify with the stdlib crypt module. Returns None if unavailable."""
    try:
        import crypt  # noqa: PLC0415 — optional, removed in Python 3.13
    except Exception:
        return None
    try:
        return crypt.crypt(password, stored) == stored
    except Exception:
        return None


async def _openssl_verify(password: str, stored: str) -> bool:
    """Verify a $id$salt$hash entry using `openssl passwd`.

    Supports the common MD5 ($1$) / SHA-256 ($5$) / SHA-512 ($6$) schemes.
    """
    if not stored.startswith("$"):
        return False
    parts = stored.split("$")
    # parts = ['', id, salt, hash...]
    if len(parts) < 4:
        return False
    scheme_id, salt = parts[1], parts[2]
    flag = {"1": "-1", "5": "-5", "6": "-6"}.get(scheme_id)
    if flag is None:
        return False
    # openssl passwd <flag> -salt <salt> <password> → reproduces the full entry
    code, out = await _run(
        ["openssl", "passwd", flag, "-salt", salt, password], timeout=8.0
    )
    if code != 0 or not out:
        return False
    return out.strip() == stored


async def verify_system_root_password(password: str) -> bool:
    """True iff `password` is root's actual Linux password on this Pi."""
    if not password:
        return False
    stored = await _shadow_hash("root")
    if not stored:
        logger.warning("Could not read root shadow entry for step-up verification")
        return False
    # Locked / no-password accounts can't be verified this way
    if stored in ("!", "*", "!!") or stored.startswith("!"):
        return False

    crypt_result = _crypt_verify(password, stored)
    if crypt_result is not None:
        return crypt_result
    return await _openssl_verify(password, stored)
