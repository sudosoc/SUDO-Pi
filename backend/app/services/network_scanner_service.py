from __future__ import annotations

import asyncio
import re

from loguru import logger

# =============================================================================
# Network Scanner Service
#
# Discovers devices on the AP subnet (192.168.4.0/24) using three sources:
#   1. dnsmasq DHCP leases  (hostname + current lease)
#   2. ARP neighbour table  (fast, from kernel cache)
#   3. arp-scan / nmap      (active probe — only when the caller requests it)
#
# MAC → manufacturer is resolved from an embedded prefix table (OUI first
# 3 octets) covering the most common vendors seen in home/lab environments.
# =============================================================================

_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")

AP_INTERFACE = "wlan0"
AP_SUBNET = "192.168.4.0/24"

# Partial OUI table — prefix (XX:XX:XX) → vendor
_OUI: dict[str, str] = {
    # Apple
    "a4:c3:f0": "Apple", "f4:f9:51": "Apple", "00:17:f2": "Apple",
    "00:25:00": "Apple", "3c:22:fb": "Apple", "8c:85:90": "Apple",
    "f0:18:98": "Apple", "60:f8:1d": "Apple", "b8:5d:0a": "Apple",
    "ac:bc:32": "Apple", "d4:61:9d": "Apple", "00:1b:63": "Apple",
    "34:36:3b": "Apple", "70:11:24": "Apple", "a8:51:ab": "Apple",
    # Samsung
    "b0:c5:59": "Samsung", "8c:79:f0": "Samsung", "cc:07:ab": "Samsung",
    "e4:40:e2": "Samsung", "20:13:e0": "Samsung", "18:eb:70": "Samsung",
    "78:40:e4": "Samsung", "d0:87:e2": "Samsung", "50:a0:19": "Samsung",
    "38:01:97": "Samsung", "fc:a6:cd": "Samsung", "b4:3a:28": "Samsung",
    # Google
    "f4:f5:d8": "Google", "54:60:09": "Google", "a4:77:33": "Google",
    "3c:5a:b4": "Google", "48:d6:d5": "Google", "f0:ef:86": "Google",
    "94:95:a0": "Google", "00:1a:11": "Google", "d8:6c:63": "Google",
    # Amazon
    "fc:65:de": "Amazon", "74:c2:46": "Amazon", "f0:27:2d": "Amazon",
    "68:37:e9": "Amazon", "b4:7c:9c": "Amazon", "40:b4:cd": "Amazon",
    "0c:47:c9": "Amazon", "18:74:2e": "Amazon", "8c:49:9d": "Amazon",
    # Raspberry Pi
    "b8:27:eb": "Raspberry Pi", "dc:a6:32": "Raspberry Pi",
    "e4:5f:01": "Raspberry Pi", "28:cd:c1": "Raspberry Pi",
    "2c:cf:67": "Raspberry Pi",
    # Intel
    "00:1b:21": "Intel", "8c:70:5a": "Intel", "a0:c5:89": "Intel",
    "10:02:b5": "Intel", "5c:f8:a1": "Intel", "94:65:9c": "Intel",
    "d4:3d:7e": "Intel", "3c:a9:f4": "Intel", "00:21:6a": "Intel",
    # Qualcomm / Atheros
    "00:18:6e": "Qualcomm", "20:89:86": "Qualcomm",
    # Espressif (ESP8266/ESP32 — IoT)
    "18:fe:34": "Espressif", "24:0a:c4": "Espressif",
    "30:ae:a4": "Espressif", "3c:71:bf": "Espressif",
    "48:3f:da": "Espressif", "50:02:91": "Espressif",
    "54:43:b2": "Espressif", "7c:9e:bd": "Espressif",
    "80:7d:3a": "Espressif", "84:f3:eb": "Espressif",
    "a0:20:a6": "Espressif", "ac:d0:74": "Espressif",
    "b4:e6:2d": "Espressif", "bc:dd:c2": "Espressif",
    "c8:2b:96": "Espressif", "d8:bf:c0": "Espressif",
    # TP-Link
    "c4:e9:84": "TP-Link", "50:c7:bf": "TP-Link", "a0:f3:c1": "TP-Link",
    "98:de:d0": "TP-Link", "b0:be:76": "TP-Link", "18:a6:f7": "TP-Link",
    "f4:ec:38": "TP-Link", "e8:65:49": "TP-Link", "00:27:19": "TP-Link",
    # Huawei
    "00:18:82": "Huawei", "20:f3:a3": "Huawei", "a8:6b:ad": "Huawei",
    "c8:7e:75": "Huawei", "e8:cd:2d": "Huawei",
    # Xiaomi
    "00:9e:c8": "Xiaomi", "28:6c:07": "Xiaomi", "58:44:98": "Xiaomi",
    "64:09:80": "Xiaomi", "74:23:44": "Xiaomi", "78:02:f8": "Xiaomi",
    "ac:f7:f3": "Xiaomi", "c4:6a:b7": "Xiaomi", "f8:a4:5f": "Xiaomi",
    # LG
    "e8:03:9a": "LG", "a8:9c:ed": "LG", "cc:2d:83": "LG",
    "b4:0b:44": "LG", "c0:97:27": "LG",
    # Sony
    "10:4f:a8": "Sony", "00:1a:80": "Sony", "70:2b:af": "Sony",
    "e0:75:0a": "Sony", "84:2e:27": "Sony",
    # Netgear
    "00:14:6c": "Netgear", "2c:b0:5d": "Netgear", "a0:21:b7": "Netgear",
    "c4:04:15": "Netgear", "20:4e:7f": "Netgear",
    # Cisco
    "00:00:0c": "Cisco", "00:1b:54": "Cisco", "00:1d:45": "Cisco",
    "e8:40:f2": "Cisco", "f8:7b:20": "Cisco", "70:69:5a": "Cisco",
    # ASUSTek
    "00:1a:92": "ASUS", "10:7b:44": "ASUS", "2c:4d:54": "ASUS",
    "50:46:5d": "ASUS", "bc:ae:c5": "ASUS", "e0:3f:49": "ASUS",
    # Microsoft / Xbox
    "00:17:fa": "Microsoft", "28:18:78": "Microsoft", "7c:ed:8d": "Microsoft",
    "38:2c:4a": "Microsoft", "60:45:bd": "Microsoft",
    # Nintendo
    "00:17:ab": "Nintendo", "00:19:1d": "Nintendo", "98:b6:e9": "Nintendo",
    "e0:0c:7f": "Nintendo", "40:d2:8a": "Nintendo",
    # Canonical / Ubuntu (VMs)
    "00:16:3e": "Xen", "52:54:00": "QEMU/KVM", "00:0c:29": "VMware",
}


def _vendor(mac: str) -> str:
    prefix = mac.lower()[:8]  # "xx:xx:xx"
    return _OUI.get(prefix, "")


async def _run(cmd: list[str], timeout: float = 15.0) -> tuple[int, str]:
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
        return 127, "not found"
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


async def _read_leases() -> dict[str, dict]:
    """Read dnsmasq leases → {mac: {ip, hostname}}"""
    result: dict[str, dict] = {}
    for path in ("/var/lib/misc/dnsmasq.leases", "/var/lib/dnsmasq/dnsmasq.leases"):
        rc, out = await _run(["cat", path], timeout=3.0)
        if rc == 0 and out:
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 4 and _MAC_RE.match(parts[1]):
                    mac = parts[1].lower()
                    hostname = parts[3] if parts[3] != "*" else ""
                    result[mac] = {"ip": parts[2], "hostname": hostname}
            break
    return result


async def _read_arp_table() -> dict[str, dict]:
    """Read kernel ARP / neighbour table → {mac: {ip, state}}"""
    result: dict[str, dict] = {}

    # 'ip neigh show' covers all interfaces
    rc, out = await _run(["ip", "neigh", "show"], timeout=3.0)
    if rc == 0:
        for line in out.splitlines():
            # "192.168.4.23 dev wlan0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
            m = re.match(
                r"^(\d+\.\d+\.\d+\.\d+)\s+dev\s+\S+\s+lladdr\s+([0-9a-f:]{17})\s+(\w+)",
                line.strip(),
            )
            if m and m.group(3) not in ("FAILED", "INCOMPLETE"):
                result[m.group(2).lower()] = {
                    "ip": m.group(1),
                    "state": m.group(3),
                }

    # Legacy 'arp -n' as supplemental source
    rc, out = await _run(["arp", "-n"], timeout=3.0)
    if rc == 0:
        for line in out.splitlines():
            m = re.match(
                r"^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+([0-9a-f:]{17})",
                line.strip(),
                re.I,
            )
            if m:
                mac = m.group(2).lower()
                if mac not in result:
                    result[mac] = {"ip": m.group(1), "state": "arp"}

    return result


async def _scan_arp_scan() -> list[dict]:
    """Active scan using arp-scan (preferred) — returns raw rows."""
    rc, out = await _run(
        ["sudo", "arp-scan", "--interface", AP_INTERFACE, AP_SUBNET],
        timeout=30.0,
    )
    if rc != 0:
        return []
    rows = []
    for line in out.splitlines():
        m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})\s*(.*)?$", line.strip(), re.I)
        if m:
            rows.append({"ip": m.group(1), "mac": m.group(2).lower(), "desc": m.group(3).strip()})
    return rows


async def _scan_nmap() -> list[dict]:
    """Active scan using nmap -sn (fallback if arp-scan is missing)."""
    rc, out = await _run(
        ["nmap", "-sn", "-n", AP_SUBNET, "--open"],
        timeout=60.0,
    )
    if rc != 0:
        return []
    rows = []
    current_ip = ""
    for line in out.splitlines():
        ip_m = re.search(r"Nmap scan report for (\d+\.\d+\.\d+\.\d+)", line)
        if ip_m:
            current_ip = ip_m.group(1)
        mac_m = re.search(r"MAC Address: ([0-9A-Fa-f:]{17})", line)
        if mac_m and current_ip:
            rows.append({"ip": current_ip, "mac": mac_m.group(1).lower(), "desc": ""})
            current_ip = ""
    return rows


async def scan(active: bool = False) -> list[dict]:
    """Return list of devices found on the AP network.

    active=False: instant read from ARP table + DHCP leases (< 100 ms)
    active=True:  additionally fires arp-scan or nmap to probe uncached hosts
    """
    leases, arp = await asyncio.gather(_read_leases(), _read_arp_table())

    merged: dict[str, dict] = {}

    # Seed from leases (most complete hostname info)
    for mac, info in leases.items():
        merged[mac] = {
            "mac": mac,
            "ip": info["ip"],
            "hostname": info["hostname"],
            "vendor": _vendor(mac),
            "source": "dhcp",
            "state": "lease",
        }

    # Overlay with ARP (live state)
    for mac, info in arp.items():
        if mac in merged:
            merged[mac]["state"] = info["state"]
        else:
            merged[mac] = {
                "mac": mac,
                "ip": info["ip"],
                "hostname": "",
                "vendor": _vendor(mac),
                "source": "arp",
                "state": info["state"],
            }

    if active:
        # Prefer arp-scan, fall back to nmap
        active_rows: list[dict] = []
        rc_check, _ = await _run(["which", "arp-scan"], timeout=2.0)
        if rc_check == 0:
            active_rows = await _scan_arp_scan()
        else:
            rc_check, _ = await _run(["which", "nmap"], timeout=2.0)
            if rc_check == 0:
                active_rows = await _scan_nmap()

        for row in active_rows:
            mac = row["mac"]
            if mac in merged:
                merged[mac]["state"] = "reachable"
            else:
                merged[mac] = {
                    "mac": mac,
                    "ip": row["ip"],
                    "hostname": "",
                    "vendor": _vendor(mac),
                    "source": "scan",
                    "state": "reachable",
                }

    # Resolve hostname from hostname command for IPs that have none
    results = sorted(merged.values(), key=lambda x: x["ip"])
    logger.info("Network scan found {} devices (active={})", len(results), active)
    return results
