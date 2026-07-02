from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
from loguru import logger


BLOCKLIST_FILE = "/etc/dnsmasq.d/sudo-pi-blocklist.conf"
HOSTS_FILE = "/etc/sudo-pi-adblock-hosts"

BLOCKLIST_SOURCES: dict[str, dict] = {
    "StevenBlack Unified": {
        "url": "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
        "description": "Combines several reputable hosts files including adware and malware sites",
    },
    "AdAway Default": {
        "url": "https://adaway.org/hosts.txt",
        "description": "Well-maintained blocklist used by the AdAway Android app",
    },
    "OISD Basic": {
        "url": "https://basic.oisd.nl/",
        "description": "OISD basic blocklist covering ads, tracking, and malware domains",
    },
}


async def _run(cmd: list[str], timeout: float = 15.0) -> tuple[int, str, str]:
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


def _extract_domains(content: str) -> set[str]:
    """Parse a hosts-format file and extract blocked domains."""
    domains: set[str] = set()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Match lines like: 0.0.0.0 domain.com  or  127.0.0.1 domain.com
        m = re.match(r"^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)", line)
        if m:
            domain = m.group(1).lower()
            # Skip localhost entries and invalid domains
            if domain in ("localhost", "localhost.localdomain", "broadcasthost", "0.0.0.0"):
                continue
            if "." in domain and not domain.startswith("."):
                domains.add(domain)
    return domains


async def _download_list(name: str, url: str) -> set[str]:
    """Download and parse a single blocklist."""
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            domains = _extract_domains(response.text)
            logger.info("Downloaded {} — {} domains from {}", name, len(domains), url)
            return domains
    except Exception as exc:
        logger.error("Failed to download blocklist '{}' from {}: {}", name, url, exc)
        return set()


def _read_active_lists() -> list[str]:
    """Read which lists are currently active from the conf file comment."""
    try:
        text = Path(BLOCKLIST_FILE).read_text(errors="replace")
        m = re.search(r"#\s*active_lists:\s*(.+)", text)
        if m:
            return [s.strip() for s in m.group(1).split(",") if s.strip()]
    except OSError:
        pass
    return []


def _read_domain_count() -> int:
    """Count entries in the hosts file."""
    try:
        text = Path(HOSTS_FILE).read_text(errors="replace")
        return sum(1 for line in text.splitlines() if line.strip() and not line.startswith("#"))
    except OSError:
        return 0


def _read_last_updated() -> str | None:
    """Read the last-updated timestamp from the conf file comment."""
    try:
        text = Path(BLOCKLIST_FILE).read_text(errors="replace")
        m = re.search(r"#\s*last_updated:\s*(.+)", text)
        if m:
            return m.group(1).strip()
    except OSError:
        pass
    return None


async def get_status() -> dict:
    """Return current ad blocker status."""
    enabled = Path(BLOCKLIST_FILE).exists()
    return {
        "enabled": enabled,
        "domain_count": _read_domain_count() if enabled else 0,
        "last_updated": _read_last_updated() if enabled else None,
        "active_lists": _read_active_lists() if enabled else [],
    }


async def get_available_lists() -> list[dict]:
    """Return the list of available blocklist sources."""
    return [
        {"name": name, "url": info["url"], "description": info["description"]}
        for name, info in BLOCKLIST_SOURCES.items()
    ]


async def enable(lists: list[str]) -> dict:
    """Download selected blocklists, write hosts file, configure dnsmasq."""
    if not lists:
        raise ValueError("At least one blocklist must be selected")

    # Resolve selected list URLs
    selected: dict[str, str] = {}
    for name in lists:
        if name not in BLOCKLIST_SOURCES:
            raise ValueError(f"Unknown blocklist: {name}")
        selected[name] = BLOCKLIST_SOURCES[name]["url"]

    # Download all lists concurrently
    tasks = [_download_list(name, url) for name, url in selected.items()]
    results = await asyncio.gather(*tasks)

    all_domains: set[str] = set()
    for domain_set in results:
        all_domains.update(domain_set)

    domain_count = len(all_domains)
    logger.info("Total unique domains after dedup: {}", domain_count)

    # Write hosts file
    now_str = datetime.now(timezone.utc).isoformat()
    hosts_lines = [
        f"# SUDO-Pi Ad Blocker — generated {now_str}",
        f"# {domain_count} domains blocked",
        "",
    ]
    for domain in sorted(all_domains):
        hosts_lines.append(f"0.0.0.0 {domain}")

    hosts_content = "\n".join(hosts_lines) + "\n"

    proc_hosts = await asyncio.create_subprocess_exec(
        "sudo", "tee", HOSTS_FILE,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc_hosts.communicate(input=hosts_content.encode())
    if proc_hosts.returncode != 0:
        raise RuntimeError(f"Failed to write hosts file: {err.decode(errors='replace')}")

    # Write dnsmasq conf
    active_list_str = ", ".join(lists)
    conf_content = (
        f"# SUDO-Pi Ad Blocker configuration\n"
        f"# last_updated: {now_str}\n"
        f"# active_lists: {active_list_str}\n"
        f"addn-hosts={HOSTS_FILE}\n"
    )

    proc_conf = await asyncio.create_subprocess_exec(
        "sudo", "tee", BLOCKLIST_FILE,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err2 = await proc_conf.communicate(input=conf_content.encode())
    if proc_conf.returncode != 0:
        raise RuntimeError(f"Failed to write dnsmasq conf: {err2.decode(errors='replace')}")

    # Restart dnsmasq
    code, _, err3 = await _run(["sudo", "systemctl", "restart", "dnsmasq"], timeout=15.0)
    if code != 0:
        logger.warning("dnsmasq restart returned non-zero: {}", err3)

    logger.info("Ad blocker enabled with {} domains from {} lists", domain_count, len(lists))
    return {"domain_count": domain_count, "lists": lists}


async def disable() -> None:
    """Remove blocklist configuration and restart dnsmasq."""
    code, _, err = await _run(["sudo", "rm", "-f", BLOCKLIST_FILE], timeout=5.0)
    if code != 0:
        logger.warning("Could not remove blocklist conf: {}", err)

    code2, _, err2 = await _run(["sudo", "systemctl", "restart", "dnsmasq"], timeout=15.0)
    if code2 != 0:
        logger.warning("dnsmasq restart returned non-zero: {}", err2)

    logger.info("Ad blocker disabled")


async def update() -> dict:
    """Re-download all currently active lists and rebuild the blocklist."""
    active = _read_active_lists()
    if not active:
        raise RuntimeError("Ad blocker is not enabled or no lists are active")
    return await enable(active)
