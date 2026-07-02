from __future__ import annotations

import asyncio
import re
from pathlib import Path

from loguru import logger


DNSMASQ_LEASES = "/var/lib/misc/dnsmasq.leases"
ARP_TABLE = "/proc/net/arp"
AP_SUBNET_PREFIX = "192.168.4."


async def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "Command timed out"
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


def _parse_leases() -> dict[str, dict]:
    """Parse dnsmasq.leases → {ip: {mac, hostname}}"""
    result: dict[str, dict] = {}
    try:
        text = Path(DNSMASQ_LEASES).read_text(errors="replace")
        for line in text.strip().splitlines():
            parts = line.split()
            if len(parts) >= 4:
                mac = parts[1].lower()
                ip = parts[2]
                hostname = parts[3] if parts[3] != "*" else None
                result[ip] = {"mac": mac, "hostname": hostname}
    except OSError:
        pass
    return result


def _parse_arp() -> dict[str, str]:
    """Parse /proc/net/arp → {ip: mac}"""
    result: dict[str, str] = {}
    try:
        text = Path(ARP_TABLE).read_text(errors="replace")
        for line in text.splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 4 and parts[3] != "00:00:00:00:00:00":
                result[parts[0]] = parts[3].lower()
    except OSError:
        pass
    return result


async def ensure_iptables_accounting() -> None:
    """Create SUDO_PI_ACCT_IN / SUDO_PI_ACCT_OUT chains and wire them into FORWARD if needed."""
    for chain in ("SUDO_PI_ACCT_IN", "SUDO_PI_ACCT_OUT"):
        code, _, _ = await _run(["sudo", "iptables", "-n", "-L", chain], timeout=5.0)
        if code != 0:
            await _run(["sudo", "iptables", "-N", chain], timeout=5.0)
            logger.info("Created iptables chain {}", chain)

    # Wire into FORWARD only if not already present
    code, out, _ = await _run(["sudo", "iptables", "-n", "-L", "FORWARD"], timeout=5.0)
    if "SUDO_PI_ACCT_IN" not in out:
        await _run(
            ["sudo", "iptables", "-I", "FORWARD", "1", "-j", "SUDO_PI_ACCT_IN"],
            timeout=5.0,
        )
        logger.info("Inserted SUDO_PI_ACCT_IN jump into FORWARD chain")

    if "SUDO_PI_ACCT_OUT" not in out:
        await _run(
            ["sudo", "iptables", "-I", "FORWARD", "2", "-j", "SUDO_PI_ACCT_OUT"],
            timeout=5.0,
        )
        logger.info("Inserted SUDO_PI_ACCT_OUT jump into FORWARD chain")

    # Ensure per-IP rules exist for the AP subnet range
    leases = _parse_leases()
    code_in, out_in, _ = await _run(
        ["sudo", "iptables", "-nxvL", "SUDO_PI_ACCT_IN"], timeout=5.0
    )
    code_out, out_out, _ = await _run(
        ["sudo", "iptables", "-nxvL", "SUDO_PI_ACCT_OUT"], timeout=5.0
    )

    for ip in leases:
        if not ip.startswith(AP_SUBNET_PREFIX):
            continue
        if ip not in out_in:
            await _run(
                ["sudo", "iptables", "-A", "SUDO_PI_ACCT_IN", "-d", ip],
                timeout=5.0,
            )
        if ip not in out_out:
            await _run(
                ["sudo", "iptables", "-A", "SUDO_PI_ACCT_OUT", "-s", ip],
                timeout=5.0,
            )


def _parse_iptables_chain(output: str) -> dict[str, dict]:
    """Parse iptables -nxvL output into {ip: {bytes, packets}}."""
    result: dict[str, dict] = {}
    # Line format: pkts bytes target prot opt in out source destination
    for line in output.strip().splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            packets = int(parts[0])
            bytes_ = int(parts[1])
        except (ValueError, IndexError):
            continue
        # Look for an IP address in the line (source or destination)
        ip_match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})(?:/32)?", line)
        if ip_match:
            ip = ip_match.group(1)
            if ip.startswith(AP_SUBNET_PREFIX):
                result[ip] = {"bytes": bytes_, "packets": packets}
    return result


async def get_traffic_stats() -> list[dict]:
    """Return per-device traffic stats merged from iptables + dnsmasq + ARP."""
    await ensure_iptables_accounting()

    _, out_in, _ = await _run(
        ["sudo", "iptables", "-nxvL", "SUDO_PI_ACCT_IN"], timeout=10.0
    )
    _, out_out, _ = await _run(
        ["sudo", "iptables", "-nxvL", "SUDO_PI_ACCT_OUT"], timeout=10.0
    )

    rx_data = _parse_iptables_chain(out_in)   # ACCT_IN  → rx from internet to client (dst=client)
    tx_data = _parse_iptables_chain(out_out)  # ACCT_OUT → tx from client to internet (src=client)

    leases = _parse_leases()
    arp = _parse_arp()

    all_ips = set(rx_data) | set(tx_data) | {
        ip for ip in leases if ip.startswith(AP_SUBNET_PREFIX)
    }

    stats: list[dict] = []
    for ip in sorted(all_ips):
        lease_info = leases.get(ip, {})
        mac = lease_info.get("mac") or arp.get(ip) or "unknown"
        hostname = lease_info.get("hostname")

        rx = rx_data.get(ip, {})
        tx = tx_data.get(ip, {})

        stats.append(
            {
                "ip": ip,
                "mac": mac,
                "hostname": hostname,
                "rx_bytes": rx.get("bytes", 0),
                "tx_bytes": tx.get("bytes", 0),
                "rx_packets": rx.get("packets", 0),
                "tx_packets": tx.get("packets", 0),
            }
        )

    return stats


async def reset_counters() -> None:
    """Zero all packet/byte counters in both accounting chains."""
    for chain in ("SUDO_PI_ACCT_IN", "SUDO_PI_ACCT_OUT"):
        code, _, err = await _run(["sudo", "iptables", "-Z", chain], timeout=5.0)
        if code != 0:
            logger.warning("Failed to zero chain {}: {}", chain, err)
        else:
            logger.info("Zeroed counters for chain {}", chain)


async def get_aggregate_stats() -> dict:
    """Return aggregate stats across all AP clients."""
    stats = await get_traffic_stats()

    total_rx = sum(d["rx_bytes"] for d in stats)
    total_tx = sum(d["tx_bytes"] for d in stats)

    top_consumer: dict | None = None
    top_bytes = -1
    for d in stats:
        total = d["rx_bytes"] + d["tx_bytes"]
        if total > top_bytes:
            top_bytes = total
            top_consumer = {
                "ip": d["ip"],
                "hostname": d["hostname"],
                "bytes": total,
            }

    return {
        "total_devices": len(stats),
        "total_rx_bytes": total_rx,
        "total_tx_bytes": total_tx,
        "top_consumer": top_consumer,
    }
