from __future__ import annotations

import re

from loguru import logger

# =============================================================================
# Internet sharing (NAT) service
#
# The Pi runs an access point on the AP interface (wlan0) that clients connect
# to for management. For those clients to also reach the internet, the Pi must
# route + NAT their traffic out whichever interface actually has upstream
# internet — that could be ethernet (eth0), a USB Wi-Fi dongle (wlan1), a
# tethered phone (usb0), etc.
#
# The original setup hard-coded wlan1, so if the Pi's upstream was ethernet
# (or anything else) AP clients got an IP + the dashboard but no internet.
#
# This service detects the upstream interface dynamically from the default
# route and (re)builds the forwarding + masquerade rules against it.
# =============================================================================

AP_INTERFACE = "wlan0"
AP_NETWORK = "192.168.4.0/24"


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str]:
    code, out, _ = await run_cmd(cmd, timeout=timeout, merge_stderr=True)
    return code, out.strip()


async def detect_upstream_interface() -> str | None:
    """Return the interface that carries the default route (the internet path).

    Never returns the AP interface — routing traffic back out the AP would loop.
    """
    code, out = await _run(["ip", "route", "show", "default"], timeout=5.0)
    if code != 0 or not out:
        return None
    # Lines look like: "default via 192.168.1.1 dev eth0 proto dhcp metric 100"
    # Prefer the lowest-metric default route that isn't the AP interface.
    best: tuple[int, str] | None = None
    for line in out.splitlines():
        m = re.search(r"\bdev\s+(\S+)", line)
        if not m:
            continue
        dev = m.group(1)
        if dev == AP_INTERFACE:
            continue
        metric_match = re.search(r"\bmetric\s+(\d+)", line)
        metric = int(metric_match.group(1)) if metric_match else 0
        if best is None or metric < best[0]:
            best = (metric, dev)
    return best[1] if best else None


async def _ip_forwarding_enabled() -> bool:
    code, out = await _run(["sysctl", "-n", "net.ipv4.ip_forward"], timeout=5.0)
    return code == 0 and out.strip() == "1"


async def _has_masquerade(upstream: str) -> bool:
    code, out = await _run(
        ["sudo", "iptables", "-t", "nat", "-C", "POSTROUTING",
         "-s", AP_NETWORK, "-o", upstream, "-j", "MASQUERADE"],
        timeout=6.0,
    )
    return code == 0


async def get_status() -> dict:
    """Report whether AP clients currently have a working internet path."""
    upstream = await detect_upstream_interface()
    forwarding = await _ip_forwarding_enabled()

    masquerade = False
    upstream_has_internet = False
    if upstream:
        masquerade = await _has_masquerade(upstream)
        # Quick reachability probe out the upstream interface
        code, _ = await _run(
            ["ping", "-c", "1", "-W", "2", "-I", upstream, "1.1.1.1"],
            timeout=6.0,
        )
        upstream_has_internet = code == 0

    sharing_active = bool(upstream and forwarding and masquerade)

    if not upstream:
        summary = "No upstream internet connection found. Connect the Pi to the internet (ethernet or a second Wi-Fi adapter)."
    elif not upstream_has_internet:
        summary = f"Upstream interface {upstream} is up but has no internet reachability."
    elif sharing_active:
        summary = f"Internet sharing is active — AP clients route through {upstream}."
    else:
        summary = f"Upstream {upstream} has internet, but sharing is not fully configured. Enable it to give AP clients internet."

    return {
        "sharing_active": sharing_active,
        "upstream_interface": upstream,
        "upstream_has_internet": upstream_has_internet,
        "ip_forwarding": forwarding,
        "masquerade_rule": masquerade,
        "ap_interface": AP_INTERFACE,
        "ap_network": AP_NETWORK,
        "summary": summary,
    }


async def enable_sharing() -> dict:
    """Detect the upstream interface and (re)build NAT + forwarding rules.

    Idempotent: it deletes any prior rule for the same subnet/interface before
    adding, so repeated calls don't stack duplicates. Also clears stale rules
    that pointed at a now-wrong upstream interface.
    """
    upstream = await detect_upstream_interface()
    if not upstream:
        raise RuntimeError(
            "No upstream internet interface detected. Connect the Pi to the "
            "internet via ethernet or a second Wi-Fi adapter first."
        )

    # 1. Enable IPv4 forwarding (runtime + persistent)
    await _run(["sudo", "sysctl", "-w", "net.ipv4.ip_forward=1"], timeout=5.0)
    await _run(
        ["sudo", "sh", "-c",
         "grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || "
         "echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf"],
        timeout=5.0,
    )

    # 2. Clear any old MASQUERADE rules for our subnet on ALL interfaces
    #    (handles the case where upstream changed from wlan1 → eth0, etc.)
    _, nat_rules = await _run(
        ["sudo", "iptables", "-t", "nat", "-S", "POSTROUTING"], timeout=6.0
    )
    for line in nat_rules.splitlines():
        if AP_NETWORK in line and "MASQUERADE" in line:
            # Convert the "-A POSTROUTING ..." listing into a "-D" delete
            del_args = line.replace("-A POSTROUTING", "", 1).split()
            await _run(
                ["sudo", "iptables", "-t", "nat", "-D", "POSTROUTING", *del_args],
                timeout=6.0,
            )

    # 3. Add the fresh MASQUERADE rule for the detected upstream
    await _run(
        ["sudo", "iptables", "-t", "nat", "-A", "POSTROUTING",
         "-s", AP_NETWORK, "-o", upstream, "-j", "MASQUERADE"],
        timeout=6.0,
    )

    # 4. Forwarding rules AP ↔ upstream (delete-then-add for idempotency)
    forward_pairs = [
        ["-i", AP_INTERFACE, "-o", upstream, "-j", "ACCEPT"],
        ["-i", upstream, "-o", AP_INTERFACE, "-m", "state",
         "--state", "RELATED,ESTABLISHED", "-j", "ACCEPT"],
    ]
    for rule in forward_pairs:
        await _run(["sudo", "iptables", "-D", "FORWARD", *rule], timeout=6.0)
        await _run(["sudo", "iptables", "-I", "FORWARD", "1", *rule], timeout=6.0)

    # 5. Persist rules across reboots (best effort)
    await _run(
        ["sudo", "sh", "-c",
         "mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4 "
         "2>/dev/null || iptables-save > /etc/iptables.rules 2>/dev/null || true"],
        timeout=8.0,
    )

    logger.info("Internet sharing enabled: {} → {}", AP_NETWORK, upstream)

    status = await get_status()
    status["detail"] = f"Internet sharing enabled via {upstream}"
    return status
