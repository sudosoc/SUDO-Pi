import os
import re
import shlex
import tempfile
from datetime import datetime
from pathlib import Path
from loguru import logger

SSHD_CONFIG = Path("/etc/ssh/sshd_config")

_IMPORTANT_KEYS = [
    "Port",
    "PasswordAuthentication",
    "PubkeyAuthentication",
    "PermitRootLogin",
    "MaxAuthTries",
    "LoginGraceTime",
    "AllowUsers",
    "DenyUsers",
    "Protocol",
    "X11Forwarding",
    "UsePAM",
]

_VALID_KEY_TYPES = {
    "ssh-rsa",
    "ssh-dss",
    "ssh-ed25519",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "sk-ssh-ed25519@openssh.com",
    "sk-ecdsa-sha2-nistp256@openssh.com",
}


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 15.0, stdin: bytes | None = None) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout, stdin=stdin)


def _home_dir(user: str) -> Path:
    if user == "root":
        return Path("/root")
    return Path(f"/home/{user}")


def _authorized_keys_path(user: str) -> Path:
    return _home_dir(user) / ".ssh" / "authorized_keys"


async def get_ssh_config() -> dict:
    """Parse /etc/ssh/sshd_config and return a dict of important keys."""
    defaults = {
        "Port": "22",
        "PasswordAuthentication": "yes",
        "PubkeyAuthentication": "yes",
        "PermitRootLogin": "prohibit-password",
        "MaxAuthTries": "6",
        "LoginGraceTime": "120",
        "AllowUsers": "",
        "DenyUsers": "",
        "Protocol": "2",
        "X11Forwarding": "no",
        "UsePAM": "yes",
    }
    result = dict(defaults)

    try:
        content = SSHD_CONFIG.read_text(errors="replace")
    except PermissionError:
        rc, content, _ = await _run(["sudo", "cat", str(SSHD_CONFIG)])
        if rc != 0:
            return result
    except FileNotFoundError:
        return result

    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) == 2:
            key, value = parts[0], parts[1]
            if key in result or key in _IMPORTANT_KEYS:
                result[key] = value.strip()

    return result


async def update_ssh_config(key: str, value: str) -> bool:
    """Update or add a key in /etc/ssh/sshd_config. Backs up first, then restarts sshd."""
    if key not in _IMPORTANT_KEYS:
        raise ValueError(f"Key {key!r} is not allowed")

    try:
        content = SSHD_CONFIG.read_text(errors="replace")
    except PermissionError:
        rc, content, _ = await _run(["sudo", "cat", str(SSHD_CONFIG)])
        if rc != 0:
            return False
    except FileNotFoundError:
        content = ""

    # Backup
    backup_path = SSHD_CONFIG.with_suffix(".bak")
    try:
        backup_path.write_text(content)
    except PermissionError:
        await _run(["sudo", "cp", str(SSHD_CONFIG), str(backup_path)])

    lines = content.splitlines()
    key_pattern = re.compile(r"^#?\s*" + re.escape(key) + r"\s+", re.IGNORECASE)
    new_line = f"{key} {value}"
    replaced = False
    new_lines = []
    for line in lines:
        if key_pattern.match(line) and not replaced:
            new_lines.append(new_line)
            replaced = True
        else:
            new_lines.append(line)

    if not replaced:
        new_lines.append(new_line)

    new_content = "\n".join(new_lines) + "\n"

    try:
        SSHD_CONFIG.write_text(new_content)
    except PermissionError:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sshd_config", delete=False) as f:
            f.write(new_content)
            tmp = f.name
        rc, _, err = await _run(["sudo", "cp", tmp, str(SSHD_CONFIG)])
        try:
            os.unlink(tmp)
        except Exception:
            pass
        if rc != 0:
            logger.error("Failed to write sshd_config: {}", err)
            return False

    # Restart sshd
    return await restart_ssh_service()


async def get_authorized_keys(user: str = "root") -> list[dict]:
    """Return list of authorized keys for a user."""
    ak_path = _authorized_keys_path(user)
    try:
        content = ak_path.read_text(errors="replace")
    except PermissionError:
        rc, content, _ = await _run(["sudo", "cat", str(ak_path)])
        if rc != 0:
            return []
    except FileNotFoundError:
        return []

    mtime = None
    try:
        mtime = datetime.fromtimestamp(ak_path.stat().st_mtime).isoformat()
    except Exception:
        pass

    keys = []
    for idx, line in enumerate(content.splitlines()):
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split()
        if len(parts) < 2:
            continue

        key_type = parts[0]
        key_data = parts[1]
        comment = " ".join(parts[2:]) if len(parts) > 2 else ""

        # Compute fingerprint
        fingerprint = ""
        try:
            rc, fp_out, _ = await _run(
                ["ssh-keygen", "-lf", "-"],
                timeout=5.0,
                stdin=line.encode(),
            )
            if rc == 0:
                fingerprint = fp_out.strip()
        except Exception:
            pass

        keys.append({
            "id": idx,
            "type": key_type,
            "key": line,
            "key_preview": key_data[:32] + "...",
            "comment": comment,
            "fingerprint": fingerprint,
            "added_at": mtime if idx == 0 else None,
        })

    return keys


async def add_authorized_key(user: str, key: str) -> bool:
    """Append a public key to the user's authorized_keys file."""
    key = key.strip()
    parts = key.split()
    if not parts:
        raise ValueError("Empty key")
    key_type = parts[0]
    if key_type not in _VALID_KEY_TYPES:
        raise ValueError(f"Unsupported key type: {key_type!r}")

    ak_path = _authorized_keys_path(user)
    ssh_dir = ak_path.parent

    try:
        ssh_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    except PermissionError:
        rc, _, _ = await _run(["sudo", "mkdir", "-p", "-m", "700", str(ssh_dir)])
        if rc != 0:
            return False

    # Read existing
    try:
        existing = ak_path.read_text(errors="replace")
    except PermissionError:
        rc, existing, _ = await _run(["sudo", "cat", str(ak_path)])
        if rc != 0:
            existing = ""
    except FileNotFoundError:
        existing = ""

    if key in existing:
        raise ValueError("Key already exists")

    new_content = existing.rstrip("\n") + "\n" + key + "\n"

    try:
        ak_path.write_text(new_content)
        ak_path.chmod(0o600)
    except PermissionError:
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
            f.write(new_content)
            tmp = f.name
        rc, _, _ = await _run(["sudo", "cp", tmp, str(ak_path)])
        try:
            os.unlink(tmp)
        except Exception:
            pass
        if rc != 0:
            return False
        await _run(["sudo", "chmod", "600", str(ak_path)])

    return True


async def delete_authorized_key(user: str, key_index: int) -> bool:
    """Remove the key at the given index from the user's authorized_keys."""
    ak_path = _authorized_keys_path(user)
    try:
        content = ak_path.read_text(errors="replace")
    except PermissionError:
        rc, content, _ = await _run(["sudo", "cat", str(ak_path)])
        if rc != 0:
            return False
    except FileNotFoundError:
        return False

    # Filter to non-empty, non-comment lines
    all_lines = content.splitlines(keepends=True)
    key_lines_idx = []
    for i, line in enumerate(all_lines):
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            key_lines_idx.append(i)

    if key_index >= len(key_lines_idx):
        return False

    real_idx = key_lines_idx[key_index]
    new_lines = [l for i, l in enumerate(all_lines) if i != real_idx]
    new_content = "".join(new_lines)

    try:
        ak_path.write_text(new_content)
    except PermissionError:
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
            f.write(new_content)
            tmp = f.name
        rc, _, _ = await _run(["sudo", "cp", tmp, str(ak_path)])
        try:
            os.unlink(tmp)
        except Exception:
            pass
        if rc != 0:
            return False

    return True


async def generate_key_pair(
    key_type: str = "ed25519", comment: str = "sudo-pi-generated"
) -> dict:
    """Generate an SSH key pair and return the keys + fingerprint."""
    allowed_types = {"ed25519", "rsa", "ecdsa"}
    if key_type not in allowed_types:
        raise ValueError(f"Key type must be one of {allowed_types}")

    tmp_dir = tempfile.mkdtemp(prefix="sudo-pi-keygen-")
    key_path = os.path.join(tmp_dir, "id_key")

    cmd = ["ssh-keygen", "-t", key_type, "-C", comment, "-f", key_path, "-N", ""]
    if key_type == "rsa":
        cmd += ["-b", "4096"]

    rc, _, err = await _run(cmd, timeout=30.0)
    if rc != 0:
        raise RuntimeError(f"ssh-keygen failed: {err}")

    try:
        private_key = Path(key_path).read_text()
        public_key = Path(key_path + ".pub").read_text().strip()
    except Exception as exc:
        raise RuntimeError(f"Failed to read generated keys: {exc}")

    # Get fingerprint
    fingerprint = ""
    rc2, fp_out, _ = await _run(["ssh-keygen", "-lf", key_path + ".pub"])
    if rc2 == 0:
        fingerprint = fp_out.strip()

    # Cleanup
    try:
        os.unlink(key_path)
        os.unlink(key_path + ".pub")
        os.rmdir(tmp_dir)
    except Exception:
        pass

    return {
        "private_key": private_key,
        "public_key": public_key,
        "fingerprint": fingerprint,
        "key_type": key_type,
    }


async def get_active_ssh_sessions() -> list[dict]:
    """Return active SSH sessions from 'who' and 'ss'."""
    sessions: list[dict] = []

    # Use 'who' for logged-in users
    rc, out, _ = await _run(["who"])
    if rc == 0:
        for line in out.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            user = parts[0]
            from_ip = ""
            login_time_str = ""
            pid = ""

            # who output: user tty date time (from_ip) ...
            # Try to find IP in parentheses
            ip_match = re.search(r"\(([^\)]+)\)", line)
            if ip_match:
                from_ip = ip_match.group(1)

            # Columns: user, tty, date, time, ...
            if len(parts) >= 4:
                try:
                    login_time_str = f"{parts[2]} {parts[3]}"
                except IndexError:
                    pass

            sessions.append({
                "user": user,
                "from_ip": from_ip,
                "login_time": login_time_str,
                "pid": pid,
                "tty": parts[1] if len(parts) > 1 else "",
            })

    # Augment with PIDs from ss
    rc2, ss_out, _ = await _run(["ss", "-tnp"])
    if rc2 == 0:
        for line in ss_out.splitlines():
            if ":22" not in line:
                continue
            pid_match = re.search(r"pid=(\d+)", line)
            if pid_match:
                pid_val = pid_match.group(1)
                # Match to session by remote IP
                remote_match = re.search(r"(\d+\.\d+\.\d+\.\d+):(\d+)\s", line)
                if remote_match:
                    remote_ip = remote_match.group(1)
                    for s in sessions:
                        if s["from_ip"] == remote_ip and not s["pid"]:
                            s["pid"] = pid_val
                            break

    return sessions


async def get_ssh_service_status() -> dict:
    """Check sshd service status via systemctl."""
    active = False
    enabled = False
    port = 22

    for service_name in ("ssh", "sshd"):
        rc, out, _ = await _run(
            ["systemctl", "show", service_name,
             "--property=ActiveState,UnitFileState"],
            timeout=5.0,
        )
        if rc == 0 and out.strip():
            props = {}
            for line in out.splitlines():
                if "=" in line:
                    k, _, v = line.partition("=")
                    props[k.strip()] = v.strip()
            if props.get("ActiveState") == "active":
                active = True
            if props.get("UnitFileState") == "enabled":
                enabled = True
            break

    # Try to read port from config
    try:
        cfg = await get_ssh_config()
        port = int(cfg.get("Port", 22))
    except Exception:
        pass

    return {"active": active, "enabled": enabled, "port": port}


async def restart_ssh_service() -> bool:
    """Restart sshd."""
    for service_name in ("ssh", "sshd"):
        rc, _, err = await _run(["sudo", "systemctl", "restart", service_name], timeout=30.0)
        if rc == 0:
            return True
        logger.debug("restart {} failed: {}", service_name, err)
    return False
