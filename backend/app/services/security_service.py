from __future__ import annotations

import asyncio
import re
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.session_repository import SessionRepository


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout)


async def get_fail2ban_status() -> dict:
    code, out, err = await _run(["sudo", "fail2ban-client", "status"])
    if code != 0:
        return {"jails": [], "total_banned": 0, "error": err.strip()}

    jails: list[dict] = []
    jail_names: list[str] = []
    for line in out.splitlines():
        if "Jail list:" in line:
            names_part = line.split(":", 1)[1].strip()
            jail_names = [n.strip() for n in names_part.split(",") if n.strip()]

    for jail_name in jail_names:
        jc, jout, _ = await _run(["sudo", "fail2ban-client", "status", jail_name])
        jail_info = _parse_jail_status(jail_name, jout)
        jails.append(jail_info)

    total = sum(j.get("total_banned", 0) for j in jails)
    return {"jails": jails, "total_banned": total}


def _parse_jail_status(name: str, output: str) -> dict:
    info: dict[str, Any] = {
        "name": name,
        "enabled": True,
        "banned_ips": [],
        "total_banned": 0,
        "currently_failed": 0,
        "find_time": 600,
        "ban_time": 900,
        "max_retry": 5,
    }
    for line in output.splitlines():
        line = line.strip()
        if "Currently failed:" in line:
            m = re.search(r"\d+", line)
            if m:
                info["currently_failed"] = int(m.group())
        elif "Total banned:" in line:
            m = re.search(r"\d+", line)
            if m:
                info["total_banned"] = int(m.group())
        elif "Banned IP list:" in line:
            ips_part = line.split(":", 1)[1].strip()
            info["banned_ips"] = [ip.strip() for ip in ips_part.split() if ip.strip()]
    return info


async def unban_ip(jail: str, ip: str) -> dict:
    if not _is_safe_jail_name(jail):
        raise ValueError(f"Invalid jail name: {jail!r}")
    if not _is_safe_ip(ip):
        raise ValueError(f"Invalid IP address: {ip!r}")
    logger.info(f"Unbanning {ip} from fail2ban jail '{jail}'")
    code, out, err = await _run(["sudo", "fail2ban-client", "set", jail, "unbanip", ip])
    if code != 0:
        raise RuntimeError(f"Unban failed: {err.strip()}")
    return {"jail": jail, "ip": ip, "status": "unbanned"}


async def get_active_sessions(db: AsyncSession, user_id: int | None = None, is_admin: bool = False) -> list[dict]:
    repo = SessionRepository(db)
    if is_admin:
        sessions = await repo.get_all_active_sessions()
    else:
        if user_id is None:
            return []
        sessions = await repo.get_active_sessions(user_id)
    return [
        {
            "jti": s.jti,
            "user_id": s.user_id,
            "ip_address": s.ip_address,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        }
        for s in sessions
    ]


async def revoke_session(jti: str, db: AsyncSession) -> dict:
    repo = SessionRepository(db)
    await repo.revoke_token(jti)
    return {"jti": jti, "status": "revoked"}


async def revoke_all_sessions(db: AsyncSession) -> dict:
    from sqlalchemy import update
    from app.models.session import RefreshToken
    from app.core.database import AsyncSessionFactory

    async with AsyncSessionFactory() as session:
        from sqlalchemy import text
        await session.execute(
            text("UPDATE refresh_tokens SET is_revoked = 1 WHERE is_revoked = 0")
        )
        await session.commit()
    return {"status": "all_revoked"}


async def get_firewall_rules() -> dict:
    code, out, err = await _run(["sudo", "iptables", "-L", "-n", "--line-numbers", "-v"])
    if code != 0:
        return {"enabled": False, "rules": [], "error": err.strip()}

    rules: list[dict] = []
    current_chain = ""
    for line in out.splitlines():
        if line.startswith("Chain "):
            current_chain = line.split()[1]
            continue
        if line.startswith("num") or not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 8:
            rules.append({
                "chain": current_chain,
                "target": parts[3] if len(parts) > 3 else "",
                "proto": parts[4] if len(parts) > 4 else "all",
                "source": parts[7] if len(parts) > 7 else "anywhere",
                "destination": parts[8] if len(parts) > 8 else "anywhere",
                "comment": " ".join(parts[9:]) if len(parts) > 9 else "",
            })
    return {"enabled": True, "rules": rules}


async def get_ssh_attempts() -> dict:
    from datetime import datetime, timedelta, timezone

    code, out, _ = await _run(
        ["sudo", "grep", "-hE", "sshd.*Failed password|sshd.*Invalid user|sshd.*Connection closed.*preauth",
         "/var/log/auth.log", "/var/log/auth.log.1"],
    )

    lines = out.splitlines() if code == 0 else []
    now = datetime.now(timezone.utc)

    ip_counts: dict[str, int] = {}
    user_counts: dict[str, int] = {}
    # heatmap[day_offset][hour] = count (day_offset 0 = today)
    heatmap: list[list[int]] = [[0] * 24 for _ in range(7)]
    recent: list[dict] = []

    ip_re = re.compile(r"from (\d+\.\d+\.\d+\.\d+)")
    user_re = re.compile(r"(?:for invalid user|for) (\S+) from")

    for line in lines:
        try:
            # Parse syslog timestamp (no year): "Jan 15 14:23:01"
            parts = line.split()
            if len(parts) < 3:
                continue
            ts_str = f"{parts[0]} {parts[1]} {parts[2]}"
            ts = datetime.strptime(ts_str, "%b %d %H:%M:%S").replace(
                year=now.year, tzinfo=timezone.utc
            )
            # Handle year wrap-around (Jan log entries read in Dec)
            if ts > now + timedelta(hours=1):
                ts = ts.replace(year=now.year - 1)

            day_offset = (now.date() - ts.date()).days
            if 0 <= day_offset < 7:
                heatmap[day_offset][ts.hour] += 1

            ip_m = ip_re.search(line)
            ip = ip_m.group(1) if ip_m else "unknown"
            user_m = user_re.search(line)
            user = user_m.group(1) if user_m else "unknown"

            ip_counts[ip] = ip_counts.get(ip, 0) + 1
            user_counts[user] = user_counts.get(user, 0) + 1

            if len(recent) < 100:
                recent.append({
                    "timestamp": ts.isoformat(),
                    "ip": ip,
                    "user": user,
                    "message": " ".join(parts[3:])[:200],
                })
        except Exception:
            continue

    top_ips = sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:20]
    top_users = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:20]

    return {
        "total_attempts": sum(ip_counts.values()),
        "unique_ips": len(ip_counts),
        "heatmap": heatmap,
        "top_ips": [{"ip": ip, "count": c} for ip, c in top_ips],
        "top_users": [{"user": u, "count": c} for u, c in top_users],
        "recent": recent[:50],
    }


def _is_safe_jail_name(name: str) -> bool:
    return bool(re.match(r"^[a-z0-9][a-z0-9_\-]{0,63}$", name))


def _is_safe_ip(ip: str) -> bool:
    pattern = r"^(\d{1,3}\.){3}\d{1,3}$"
    return bool(re.match(pattern, ip))
