from __future__ import annotations

import asyncio
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
# Curfew          → same chain, with the kernel time match (local kernel tz).
#
# All rules live in our own tc qdiscs / iptables chain so re-applying is a
# clean teardown + rebuild — no leftovers, no duplicates, order-independent.
# =============================================================================

AP_INTERFACE = "wlan0"
CHAIN = "SUDO_PI_POLICY"

_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
_TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")

# Serialize enforcement — concurrent rebuilds would race on tc/iptables
_apply_lock = asyncio.Lock()


async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str]:
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


# ─── ARP / lease lookup: map MACs to current IPs ─────────────────────────────


async def _mac_to_ip_map() -> dict[str, str]:
    """MAC → current IP for AP-subnet clients, from dnsmasq leases + ARP."""
    result: dict[str, str] = {}

    # dnsmasq leases: "<expiry> <mac> <ip> <hostname> <client-id>"
    for lease_path in ("/var/lib/misc/dnsmasq.leases", "/var/lib/dnsmasq/dnsmasq.leases"):
        code, out = await _run(["cat", lease_path], timeout=5.0)
        if code == 0 and out:
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 3 and _MAC_RE.match(parts[1]):
                    result[parts[1].lower()] = parts[2]
            break

    # ARP as a fallback/refresher (more current than an old lease)
    code, out = await _run(["ip", "neigh", "show", "dev", AP_INTERFACE], timeout=5.0)
    if code == 0:
        for line in out.splitlines():
            # "192.168.4.23 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
            m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+lladdr\s+([0-9a-f:]{17})", line.strip())
            if m and not line.strip().endswith("FAILED"):
                result[m.group(2).lower()] = m.group(1)

    return result


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

        active = [p for p in policies if p.blocked or p.schedule_enabled
                  or p.download_kbps > 0 or p.upload_kbps > 0]
        if not active:
            return {"applied": 0, "skipped_offline": 0}

        mac_ip = await _mac_to_ip_map()

        # ── iptables chain for blocks and curfews (MAC-based, IP-independent)
        await _run(["sudo", "iptables", "-N", CHAIN])
        await _run(["sudo", "iptables", "-I", "FORWARD", "1", "-j", CHAIN])

        # ── tc scaffolding, only if any device has a rate limit
        limited = [p for p in active if p.download_kbps > 0 or p.upload_kbps > 0]
        if limited:
            # Egress HTB (download to clients): default class = unlimited
            await _run([
                "sudo", "tc", "qdisc", "add", "dev", AP_INTERFACE,
                "root", "handle", "1:", "htb", "default", "999",
            ])
            await _run([
                "sudo", "tc", "class", "add", "dev", AP_INTERFACE,
                "parent", "1:", "classid", "1:999", "htb", "rate", "1000mbit",
            ])
            # Ingress qdisc (upload from clients)
            await _run([
                "sudo", "tc", "qdisc", "add", "dev", AP_INTERFACE,
                "handle", "ffff:", "ingress",
            ])

        applied = 0
        skipped_offline = 0

        for idx, policy in enumerate(active, start=1):
            mac = policy.mac.lower()

            # Blocking / curfew — by MAC, works even before the device gets an IP
            if policy.blocked:
                await _run([
                    "sudo", "iptables", "-A", CHAIN,
                    "-m", "mac", "--mac-source", mac, "-j", "DROP",
                ])
            elif policy.schedule_enabled:
                start, end = policy.block_start, policy.block_end
                time_args = ["-m", "time", "--timestart", start, "--timestop", end, "--kerneltz"]
                if start > end:
                    # Overnight window (e.g. 22:00→06:00): kernel handles the
                    # wrap when timestart > timestop only on some versions, so
                    # split into two explicit windows for portability.
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
                        *time_args, "-j", "DROP",
                    ])

            # Rate limits — need the device's current IP
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
) -> dict:
    mac = validate_mac(mac)
    if block_start is not None:
        block_start = validate_time(block_start)
    if block_end is not None:
        block_end = validate_time(block_end)

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
    ):
        if value is not None:
            setattr(policy, field, value)

    await db.flush()
    await db.refresh(policy)

    # Re-enforce everything so tc/iptables reflect the new state
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
    """Rebuild enforcement from the DB — used on startup and on demand."""
    return await apply_policies(await _get_all(db))


async def reapply_on_startup() -> None:
    """Startup hook with its own session; never raises."""
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
