from __future__ import annotations

import asyncio
import re

from loguru import logger

# =============================================================================
# Linux (Pi OS) user management — the accounts that exist on the Pi itself,
# not the dashboard's own login accounts.
#
# Everything runs via sudo (the service account is NOPASSWD sudo). Callers
# must pass step-up verification first (see the API layer).
# =============================================================================

USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]*\$?$")
PATH_RE = re.compile(r"^/[^\0]*$")

# Accounts we refuse to touch — deleting/locking these would break the box
PROTECTED_USERS = {"root", "sudo-pi", "daemon", "bin", "sys", "sync", "nobody"}

# UID threshold that separates human logins from system daemons on Debian/Kali
HUMAN_UID_MIN = 1000

VALID_SHELLS_FALLBACK = ["/bin/bash", "/bin/sh", "/usr/bin/zsh", "/usr/sbin/nologin"]


async def _run(cmd: list[str], timeout: float = 15.0, input_text: str | None = None) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE if input_text is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        data = input_text.encode() if input_text is not None else None
        out, _ = await asyncio.wait_for(proc.communicate(input=data), timeout=timeout)
        return proc.returncode or 0, out.decode(errors="replace").strip()
    except asyncio.TimeoutError:
        return -1, "timed out"
    except FileNotFoundError:
        return 127, "command not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def _validate_username(username: str) -> str:
    username = (username or "").strip()
    if not USERNAME_RE.match(username) or len(username) > 32:
        raise ValueError(f"Invalid username: {username!r}")
    return username


def _validate_path(path: str) -> str:
    path = (path or "").strip()
    if not PATH_RE.match(path) or ".." in path.split("/"):
        raise ValueError(f"Invalid path: {path!r}")
    return path


# ─── Read ────────────────────────────────────────────────────────────────────


async def _locked_users() -> set[str]:
    """Usernames whose password is locked (shadow hash starts with !)."""
    locked: set[str] = set()
    code, out = await _run(["sudo", "getent", "shadow"], timeout=8.0)
    if code == 0:
        for line in out.splitlines():
            parts = line.split(":")
            if len(parts) >= 2 and parts[1].startswith("!"):
                locked.add(parts[0])
    return locked


async def _sudo_members() -> set[str]:
    members: set[str] = set()
    for group in ("sudo", "wheel", "admin"):
        code, out = await _run(["getent", "group", group], timeout=5.0)
        if code == 0 and out:
            parts = out.split(":")
            if len(parts) >= 4 and parts[3]:
                members.update(m for m in parts[3].split(",") if m)
    return members


async def _groups_for(username: str) -> list[str]:
    code, out = await _run(["id", "-nG", username], timeout=5.0)
    if code == 0 and out:
        return out.split()
    return []


async def list_users(include_system: bool = False) -> list[dict]:
    """List Linux accounts with uid/gid/home/shell/groups/sudo/locked flags."""
    code, out = await _run(["getent", "passwd"], timeout=8.0)
    if code != 0:
        raise RuntimeError("Failed to read passwd database")

    locked = await _locked_users()
    sudoers = await _sudo_members()

    users: list[dict] = []
    for line in out.splitlines():
        parts = line.split(":")
        if len(parts) < 7:
            continue
        name, _pw, uid_s, gid_s, gecos, home, shell = parts[:7]
        try:
            uid = int(uid_s)
            gid = int(gid_s)
        except ValueError:
            continue

        is_human = uid == 0 or uid >= HUMAN_UID_MIN
        if not include_system and not is_human:
            continue

        users.append({
            "username": name,
            "uid": uid,
            "gid": gid,
            "full_name": gecos.split(",")[0] if gecos else "",
            "home": home,
            "shell": shell,
            "groups": await _groups_for(name),
            "is_sudo": name in sudoers or uid == 0,
            "is_locked": name in locked,
            "is_system": not is_human,
            "is_protected": name in PROTECTED_USERS,
            "is_root": uid == 0,
        })

    users.sort(key=lambda u: (not u["is_root"], u["is_system"], u["username"]))
    return users


async def list_groups() -> list[dict]:
    code, out = await _run(["getent", "group"], timeout=8.0)
    groups: list[dict] = []
    if code == 0:
        for line in out.splitlines():
            parts = line.split(":")
            if len(parts) >= 4:
                try:
                    gid = int(parts[2])
                except ValueError:
                    continue
                groups.append({
                    "name": parts[0],
                    "gid": gid,
                    "members": [m for m in parts[3].split(",") if m],
                    "is_system": gid < HUMAN_UID_MIN and gid != 0,
                })
    groups.sort(key=lambda g: (g["is_system"], g["name"]))
    return groups


async def available_shells() -> list[str]:
    code, out = await _run(["cat", "/etc/shells"], timeout=5.0)
    shells: list[str] = []
    if code == 0:
        shells = [s.strip() for s in out.splitlines() if s.strip() and not s.startswith("#")]
    return shells or VALID_SHELLS_FALLBACK


# ─── Write ───────────────────────────────────────────────────────────────────


async def _set_password(username: str, password: str) -> None:
    # chpasswd reads "user:password" on stdin; keep it inside one process so
    # the plaintext never lands on disk or in a shell history.
    code, out = await _run(["sudo", "chpasswd"], timeout=10.0, input_text=f"{username}:{password}\n")
    if code != 0:
        raise RuntimeError(f"Failed to set password: {out[-200:]}")


async def create_user(
    username: str,
    password: str,
    *,
    full_name: str | None = None,
    shell: str = "/bin/bash",
    create_home: bool = True,
    is_sudo: bool = False,
    extra_groups: list[str] | None = None,
) -> dict:
    username = _validate_username(username)
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    cmd = ["sudo", "useradd", "--shell", shell]
    if create_home:
        cmd += ["--create-home"]
    else:
        cmd += ["--no-create-home"]
    if full_name:
        cmd += ["--comment", full_name.replace(":", " ")]
    groups = list(extra_groups or [])
    if is_sudo and "sudo" not in groups:
        groups.append("sudo")
    if groups:
        cmd += ["--groups", ",".join(groups)]
    cmd += [username]

    code, out = await _run(cmd, timeout=20.0)
    if code != 0:
        raise RuntimeError(f"useradd failed: {out[-300:]}")

    await _set_password(username, password)
    logger.info("Linux user created: {} (sudo={})", username, is_sudo)
    return {"username": username, "created": True}


async def delete_user(username: str, *, remove_home: bool = False) -> dict:
    username = _validate_username(username)
    if username in PROTECTED_USERS:
        raise ValueError(f"Refusing to delete protected account '{username}'")

    cmd = ["sudo", "userdel"]
    if remove_home:
        cmd += ["--remove"]
    cmd += [username]
    code, out = await _run(cmd, timeout=20.0)
    if code != 0:
        raise RuntimeError(f"userdel failed: {out[-300:]}")
    logger.info("Linux user deleted: {} (remove_home={})", username, remove_home)
    return {"username": username, "deleted": True}


async def set_password(username: str, password: str) -> dict:
    username = _validate_username(username)
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    await _set_password(username, password)
    return {"username": username, "password_changed": True}


async def set_locked(username: str, locked: bool) -> dict:
    username = _validate_username(username)
    if username in PROTECTED_USERS and locked:
        raise ValueError(f"Refusing to lock protected account '{username}'")
    flag = "--lock" if locked else "--unlock"
    code, out = await _run(["sudo", "usermod", flag, username], timeout=10.0)
    if code != 0:
        raise RuntimeError(f"usermod failed: {out[-200:]}")
    return {"username": username, "locked": locked}


async def set_groups(username: str, groups: list[str], *, is_sudo: bool | None = None) -> dict:
    username = _validate_username(username)
    clean = [g.strip() for g in groups if g.strip() and USERNAME_RE.match(g.strip())]
    if is_sudo is True and "sudo" not in clean:
        clean.append("sudo")
    if is_sudo is False:
        clean = [g for g in clean if g not in ("sudo", "wheel", "admin")]
    # -G replaces all supplementary groups in one shot
    code, out = await _run(
        ["sudo", "usermod", "-G", ",".join(clean), username], timeout=10.0
    )
    if code != 0:
        raise RuntimeError(f"usermod -G failed: {out[-200:]}")
    return {"username": username, "groups": await _groups_for(username)}


async def set_shell(username: str, shell: str) -> dict:
    username = _validate_username(username)
    code, out = await _run(["sudo", "usermod", "--shell", shell, username], timeout=10.0)
    if code != 0:
        raise RuntimeError(f"usermod --shell failed: {out[-200:]}")
    return {"username": username, "shell": shell}


# ─── File access (POSIX ACLs) ────────────────────────────────────────────────


async def list_file_access(path: str) -> dict:
    """Return the owner, mode and per-user ACL entries for a path."""
    path = _validate_path(path)
    code, out = await _run(["getfacl", "-p", path], timeout=8.0)
    if code != 0:
        raise RuntimeError(f"Cannot read ACLs for {path}: {out[-200:]}")

    owner = group = ""
    entries: list[dict] = []
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("# owner:"):
            owner = line.split(":", 1)[1].strip()
        elif line.startswith("# group:"):
            group = line.split(":", 1)[1].strip()
        elif line.startswith("user:") and line.count(":") >= 2:
            _, name, perms = line.split(":", 2)
            if name:  # named user ACL (skip the base "user::" entry)
                entries.append({"user": name, "perms": perms})
    return {"path": path, "owner": owner, "group": group, "acl": entries}


async def grant_file_access(path: str, username: str, perms: str, *, recursive: bool = False) -> dict:
    path = _validate_path(path)
    username = _validate_username(username)
    if not re.match(r"^[rwx-]{1,3}$", perms):
        raise ValueError("Permissions must be some combination of r, w, x")
    cmd = ["sudo", "setfacl"]
    if recursive:
        cmd += ["-R"]
    cmd += ["-m", f"u:{username}:{perms}", path]
    code, out = await _run(cmd, timeout=20.0)
    if code != 0:
        raise RuntimeError(f"setfacl failed: {out[-200:]}")
    return await list_file_access(path)


async def revoke_file_access(path: str, username: str, *, recursive: bool = False) -> dict:
    path = _validate_path(path)
    username = _validate_username(username)
    cmd = ["sudo", "setfacl"]
    if recursive:
        cmd += ["-R"]
    cmd += ["-x", f"u:{username}", path]
    code, out = await _run(cmd, timeout=20.0)
    if code != 0:
        raise RuntimeError(f"setfacl -x failed: {out[-200:]}")
    return await list_file_access(path)
