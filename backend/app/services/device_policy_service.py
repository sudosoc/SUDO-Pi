from __future__ import annotations

import asyncio
import json
import re

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_policy import DevicePolicy

# =============================================================================
# Device policy enforcement — bandwidth limits, blocking, and curfews
# for AP clients on wlan0 (192.168.4.0/24).
#
# Download limit  → HTB class on wlan0 egress (traffic *to* the client),
#                   selected by a u32 filter on destination IP.
# Upload limit    → ingress police filter on wlan0 (traffic *from* the client),
#                   selected by source IP.
# Block           → iptables FORWARD drop by MAC in a dedicated chain.
# Curfew (simple) → same chain, with the kernel time match (local kernel tz).
# Curfew (per-day)→ same chain, with --weekdays flag to select specific days.
#                   Days are encoded as 1-7 (Mon-Sun) per iptables convention.
#
# All rules live in our own tc qdiscs / iptables chain so re-applying is a
# clean teardown + rebuild — no leftovers, no duplicates, order-independent.
# =============================================================================

AP_INTERFACE = "wlan0"
CHAIN = "SUDO_PI_POLICY"

# iptables --weekdays number mapping (1=Mon … 7=Sun)
_DAY_MAP = {0: "1", 1: "2", 2: "3", 3: "4", 4: "5", 5: "6", 6: "7"}

_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
_TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")

# Serialize enforcement — concurrent rebuilds would race on tc/iptables
_apply_lock = asyncio.Lock()


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str]:
    code, out, _ = await run_cmd(cmd, timeout=timeout, merge_stderr=True)
    return code, out.strip()


def validate_mac(mac: str) -> str:
    mac = mac.strip().lower()
    if not _MAC_RE.match(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    return mac


def validate_time(value: str) -> str:
    value = value.strip()
    if not _TIME_RE.match(value):
        raise ValueError(f"Invalid time (expected HH:MM): {value!r}")
    hh, mm = (int(x) for x in value.split(":"))
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise ValueError(f"Invalid time: {value!r}")
    return f"{hh:02d}:{mm:02d}"


def validate_curfew_schedule(schedule: list | None) -> str | None:
    """Validate and serialise per-day curfew schedule to JSON string."""
    if schedule is None:
        return None
    if not isinstance(schedule, list):
        raise ValueError("curfew_schedule must be a list")
    for entry in schedule:
        days = entry.get("days", [])
        if not isinstance(days, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in days):
            raise ValueError("Each curfew entry must have 'days' as a list of ints 0-6")
        validate_time(entry.get("start", ""))
        validate_time(entry.get("end", ""))
    return json.dumps(schedule)


# ─── ARP / lease lookup: map MACs to current IPs ─────────────────────────────


async def _mac_to_ip_map() -> dict[str, str]:
    """MAC → current IP for AP-subnet clients, from dnsmasq leases + ARP."""
    result: dict[str, str] = {}

    for lease_path in ("/var/lib/misc/dnsmasq.leases", "/var/lib/dnsmasq/dnsmasq.leases"):
        code, out = await _run(["cat", lease_path], timeout=5.0)
        if code == 0 and out:
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 3 and _MAC_RE.match(parts[1]):
                    result[parts[1].lower()] = parts[2]
            break

    code, out = await _run(["ip", "neigh", "show", "dev", AP_INTERFACE], timeout=5.0)
    if code == 0:
        for line in out.splitlines():
            m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+lladdr\s+([0-9a-f:]{17})", line.strip())
            if m and not line.strip().endswith("FAILED"):
                result[m.group(2).lower()] = m.group(1)

    return result


# ─── Per-day curfew helpers ──────────────────────────────────────────────────


async def _apply_per_day_curfew(mac: str, schedule: list) -> None:
    """Add iptables rules for a per-day curfew schedule."""
    for entry in schedule:
        days: list[int] = entry.get("days", [])
        start: str = entry["start"]
        end: str = entry["end"]
        if not days:
            continue

        # iptables --weekdays uses comma-separated 1-7 (Mon=1)
        weekdays_str = ",".join(_DAY_MAP[d] for d in days if d in _DAY_MAP)

        if start <= end:
            await _run([
                "sudo", "iptables", "-A", CHAIN,
                "-m", "mac", "--mac-source", mac,
                "-m", "time",
                "--timestart", start, "--timestop", end,
                "--weekdays", weekdays_str,
                "--kerneltz",
                "-j", "DROP",
            ])
        else:
            # Overnight split: e.g. 22:00 → 06:00
            await _run([
                "sudo", "iptables", "-A", CHAIN,
                "-m", "mac", "--mac-source", mac,
                "-m", "time",
                "--timestart", start, "--timestop", "23:59",
                "--weekdays", weekdays_str,
                "--kerneltz",
                "-j", "DROP",
            ])
            await _run([
                "sudo", "iptables", "-A", CHAIN,
                "-m", "mac", "--mac-source", mac,
                "-m", "time",
                "--timestart", "00:00", "--timestop", end,
                "--weekdays", weekdays_str,
                "--kerneltz",
                "-j", "DROP",
            ])


# ─── Enforcement ─────────────────────────────────────────────────────────────


async def _teardown() -> None:
    """Remove all our tc/iptables state. Errors are expected when absent."""
    await _run(["sudo", "tc", "qdisc", "del", "dev", AP_INTERFACE, "root"])
    await _run(["sudo", "tc", "qdisc", "del", "dev", AP_INTERFACE, "ingress"])
    await _run(["sudo", "iptables", "-D", "FORWARD", "-j", CHAIN])
    await _run(["sudo", "iptables", "-F", CHAIN])
    await _run(["sudo", "iptables", "-X", CHAIN])


async def apply_policies(policies: list[DevicePolicy]) -> dict:
    """Rebuild all tc + iptables rules from the given policy rows."""
    async with _apply_lock:
        await _teardown()

        def _has_curfew(p: DevicePolicy) -> bool:
            return (p.curfew_schedule is not None) or p.schedule_enabled

        active = [
            p for p in policies
            if p.blocked or _has_curfew(p) or p.download_kbps > 0 or p.upload_kbps > 0
        ]
        if not active:
            return {"applied": 0, "skipped_offline": 0}

        mac_ip = await _mac_to_ip_map()

        await _run(["sudo", "iptables", "-N", CHAIN])
        await _run(["sudo", "iptables", "-I", "FORWARD", "1", "-j", CHAIN])

        limited = [p for p in active if p.download_kbps > 0 or p.upload_kbps > 0]
        if limited:
            await _run([
                "sudo", "tc", "qdisc", "add", "dev", AP_INTERFACE,
                "root", "handle", "1:", "htb", "default", "999",
            ])
            await _run([
                "sudo", "tc", "class", "add", "dev", AP_INTERFACE,
                "parent", "1:", "classid", "1:999", "htb", "rate", "1000mbit",
            ])
            await _run([
                "sudo", "tc", "qdisc", "add", "dev", AP_INTERFACE,
                "handle", "ffff:", "ingress",
            ])

        applied = 0
        skipped_offline = 0

        for idx, policy in enumerate(active, start=1):
            mac = policy.mac.lower()

            if policy.blocked:
                await _run([
                    "sudo", "iptables", "-A", CHAIN,
                    "-m", "mac", "--mac-source", mac, "-j", "DROP",
                ])
            elif policy.curfew_schedule:
                try:
                    schedule = json.loads(policy.curfew_schedule)
                    await _apply_per_day_curfew(mac, schedule)
                except Exception as exc:  # noqa: BLE001
                    logger.error("Failed to apply per-day curfew for {}: {}", mac, exc)
            elif policy.schedule_enabled:
                start, end = policy.block_start, policy.block_end
                if start > end:
                    await _run([
                        "sudo", "iptables", "-A", CHAIN, "-m", "mac", "--mac-source", mac,
                        "-m", "time", "--timestart", start, "--timestop", "23:59", "--kerneltz",
                        "-j", "DROP",
                    ])
                    await _run([
                        "sudo", "iptables", "-A", CHAIN, "-m", "mac", "--mac-source", mac,
                        "-m", "time", "--timestart", "00:00", "--timestop", end, "--kerneltz",
                        "-j", "DROP",
                    ])
                else:
                    await _run([
                        "sudo", "iptables", "-A", CHAIN, "-m", "mac", "--mac-source", mac,
                        "-m", "time", "--timestart", start, "--timestop", end, "--kerneltz",
                        "-j", "DROP",
                    ])

            if policy.download_kbps > 0 or policy.upload_kbps > 0:
                ip = mac_ip.get(mac)
                if not ip:
                    skipped_offline += 1
                    logger.info("Policy for {}: rate limit skipped (device offline)", mac)
                else:
                    if policy.download_kbps > 0:
                        classid = f"1:{idx + 10}"
                        rate = f"{policy.download_kbps}kbit"
                        await _run([
                            "sudo", "tc", "class", "add", "dev", AP_INTERFACE,
                            "parent", "1:", "classid", classid,
                            "htb", "rate", rate, "ceil", rate,
                        ])
                        await _run([
                            "sudo", "tc", "filter", "add", "dev", AP_INTERFACE,
                            "protocol", "ip", "parent", "1:", "prio", "1",
                            "u32", "match", "ip", "dst", f"{ip}/32",
                            "flowid", classid,
                        ])
                    if policy.upload_kbps > 0:
                        rate = f"{policy.upload_kbps}kbit"
                        burst = f"{max(10, policy.upload_kbps // 8)}k"
                        await _run([
                            "sudo", "tc", "filter", "add", "dev", AP_INTERFACE,
                            "parent", "ffff:", "protocol", "ip", "prio", "1",
                            "u32", "match", "ip", "src", f"{ip}/32",
                            "police", "rate", rate, "burst", burst, "drop",
                            "flowid", ":1",
                        ])

            applied += 1

        logger.info(
            "Device policies applied: {} active, {} offline rate-limits skipped",
            applied, skipped_offline,
        )
        return {"applied": applied, "skipped_offline": skipped_offline}


# ─── CRUD + orchestration ────────────────────────────────────────────────────


async def list_policies(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(DevicePolicy).order_by(DevicePolicy.mac))
    return [p.to_dict() for p in result.scalars().all()]


async def _get_all(db: AsyncSession) -> list[DevicePolicy]:
    result = await db.execute(select(DevicePolicy))
    return list(result.scalars().all())


async def upsert_policy(
    db: AsyncSession,
    mac: str,
    *,
    hostname: str | None = None,
    last_ip: str | None = None,
    download_kbps: int | None = None,
    upload_kbps: int | None = None,
    blocked: bool | None = None,
    schedule_enabled: bool | None = None,
    block_start: str | None = None,
    block_end: str | None = None,
    curfew_schedule: list | None = None,
    monthly_quota_mb: int | None = None,
    quota_reset_day: int | None = None,
) -> dict:
    mac = validate_mac(mac)
    if block_start is not None:
        block_start = validate_time(block_start)
    if block_end is not None:
        block_end = validate_time(block_end)
    if quota_reset_day is not None and not (1 <= quota_reset_day <= 28):
        raise ValueError("quota_reset_day must be between 1 and 28")

    # Validate and serialise per-day schedule
    curfew_json: str | None | bool = False  # False = don't update
    if curfew_schedule is not None:
        curfew_json = validate_curfew_schedule(curfew_schedule)
    elif "curfew_schedule" in locals() and curfew_schedule == []:
        curfew_json = None  # Explicit empty list clears the schedule

    result = await db.execute(select(DevicePolicy).where(DevicePolicy.mac == mac))
    policy = result.scalar_one_or_none()
    if policy is None:
        policy = DevicePolicy(mac=mac)
        db.add(policy)

    for field, value in (
        ("hostname", hostname),
        ("last_ip", last_ip),
        ("download_kbps", download_kbps),
        ("upload_kbps", upload_kbps),
        ("blocked", blocked),
        ("schedule_enabled", schedule_enabled),
        ("block_start", block_start),
        ("block_end", block_end),
        ("monthly_quota_mb", monthly_quota_mb),
        ("quota_reset_day", quota_reset_day),
    ):
        if value is not None:
            setattr(policy, field, value)

    if curfew_json is not False:
        policy.curfew_schedule = curfew_json

    await db.flush()
    await db.refresh(policy)

    await apply_policies(await _get_all(db))
    await db.commit()
    return policy.to_dict()


async def delete_policy(db: AsyncSession, mac: str) -> bool:
    mac = validate_mac(mac)
    result = await db.execute(select(DevicePolicy).where(DevicePolicy.mac == mac))
    policy = result.scalar_one_or_none()
    if policy is None:
        return False
    await db.delete(policy)
    await db.flush()
    await apply_policies(await _get_all(db))
    await db.commit()
    return True


async def reapply_all(db: AsyncSession) -> dict:
    return await apply_policies(await _get_all(db))


async def reapply_on_startup() -> None:
    from app.core.database import AsyncSessionFactory

    try:
        async with AsyncSessionFactory() as db:
            stats = await reapply_all(db)
            if stats["applied"]:
                logger.info("Startup device-policy enforcement: {}", stats)
    except Exception as exc:  # noqa: BLE001
        logger.error("Startup device-policy enforcement failed: {}", exc)


async def refresh_loop() -> None:
    """Re-apply rate limits every 5 minutes so devices that reconnect with a
    new DHCP lease get their limits back (tc filters are IP-based)."""
    from app.core.database import AsyncSessionFactory

    while True:
        await asyncio.sleep(300)
        try:
            async with AsyncSessionFactory() as db:
                policies = await _get_all(db)
                if any(p.download_kbps > 0 or p.upload_kbps > 0 for p in policies):
                    await apply_policies(policies)
        except Exception as exc:  # noqa: BLE001
            logger.error("Device-policy refresh iteration failed: {}", exc)
