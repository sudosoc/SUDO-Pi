from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from loguru import logger


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


def _parse_size_to_bytes(size_str: str) -> int:
    """Convert lsblk size string like '7.5G' to bytes."""
    if not size_str:
        return 0
    size_str = size_str.strip()
    units = {"B": 1, "K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4, "P": 1024**5}
    for suffix, factor in units.items():
        if size_str.upper().endswith(suffix):
            try:
                return int(float(size_str[:-1]) * factor)
            except ValueError:
                return 0
    try:
        return int(size_str)
    except ValueError:
        return 0


async def _get_percent_used(mountpoint: str) -> float | None:
    """Get disk usage percent for a mounted device."""
    if not mountpoint:
        return None
    code, out, _ = await _run(["df", "-B1", "--output=pcent", mountpoint], timeout=5.0)
    if code != 0:
        return None
    lines = out.strip().splitlines()
    if len(lines) < 2:
        return None
    try:
        return float(lines[1].strip().rstrip("%"))
    except (ValueError, IndexError):
        return None


def _build_device_entry(blk: dict) -> dict:
    """Build a normalized device entry from lsblk JSON block."""
    return {
        "name": blk.get("name", ""),
        "path": f"/dev/{blk.get('name', '')}",
        "size": blk.get("size", ""),
        "size_bytes": int(blk.get("size") or 0),
        "type": blk.get("type", ""),
        "mountpoint": blk.get("mountpoint") or "",
        "fstype": blk.get("fstype") or "",
        "label": blk.get("label") or "",
        "model": blk.get("model") or "",
        "vendor": (blk.get("vendor") or "").strip(),
        "is_removable": blk.get("rm") in (True, "1", 1, "true"),
        "is_hotplug": blk.get("hotplug") in (True, "1", 1, "true"),
        "is_readonly": blk.get("ro") in (True, "1", 1, "true"),
        "state": blk.get("state") or "",
        "percent_used": None,
        "children": [],
    }


async def get_block_devices() -> list[dict]:
    """Run lsblk -J and return list of disk devices with their partitions."""
    code, out, err = await _run(
        [
            "lsblk", "-J", "-b",
            "-o", "NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,LABEL,MODEL,VENDOR,HOTPLUG,RM,RO,STATE",
        ],
        timeout=10.0,
    )
    if code != 0:
        logger.warning("lsblk failed: {}", err)
        return []

    try:
        data = json.loads(out)
    except (json.JSONDecodeError, KeyError) as exc:
        logger.error("Failed to parse lsblk JSON: {}", exc)
        return []

    devices: list[dict] = []

    for blk in data.get("blockdevices", []):
        blk_type = blk.get("type", "")
        if blk_type == "loop":
            continue
        if blk_type not in ("disk",):
            continue

        disk = _build_device_entry(blk)
        disk["type"] = "disk"

        # Build partition children
        children: list[dict] = []
        for child in blk.get("children") or []:
            part = _build_device_entry(child)
            # Recurse for LVM / md children
            for sub in child.get("children") or []:
                sub_entry = _build_device_entry(sub)
                if sub_entry["mountpoint"]:
                    sub_entry["percent_used"] = await _get_percent_used(sub_entry["mountpoint"])
                part["children"].append(sub_entry)

            if part["mountpoint"]:
                part["percent_used"] = await _get_percent_used(part["mountpoint"])
            children.append(part)

        # If the disk itself is mounted (e.g. USB stick with no partition table)
        if disk["mountpoint"]:
            disk["percent_used"] = await _get_percent_used(disk["mountpoint"])

        disk["children"] = children
        devices.append(disk)

    return devices


async def get_usb_devices() -> list[dict]:
    """Run lsusb and return list of USB devices."""
    code, out, err = await _run(["lsusb"], timeout=10.0)
    if code != 0:
        logger.warning("lsusb failed: {}", err)
        return []

    devices: list[dict] = []
    # Format: Bus 001 Device 002: ID 8087:0024 Intel Corp. Integrated Rate Matching Hub
    pattern = re.compile(
        r"Bus (\d+) Device (\d+): ID ([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\s*(.*)"
    )
    for line in out.strip().splitlines():
        m = pattern.match(line.strip())
        if m:
            devices.append(
                {
                    "bus": m.group(1),
                    "device": m.group(2),
                    "vendor_id": m.group(3),
                    "product_id": m.group(4),
                    "description": m.group(5).strip(),
                }
            )
    return devices


async def mount_device(
    device: str, mountpoint: str, fstype: str | None = None
) -> tuple[bool, str]:
    """Mount a device at the given mountpoint."""
    if not device.startswith("/dev/"):
        return False, "Device path must start with /dev/"
    if not mountpoint.startswith("/"):
        return False, "Mountpoint must be an absolute path"

    # Create mountpoint
    mk_code, _, mk_err = await _run(["sudo", "mkdir", "-p", mountpoint], timeout=5.0)
    if mk_code != 0:
        return False, f"Failed to create mountpoint: {mk_err}"

    cmd = ["sudo", "mount"]
    if fstype:
        cmd += ["-t", fstype]
    cmd += [device, mountpoint]

    code, out, err = await _run(cmd, timeout=15.0)
    if code != 0:
        logger.error("mount failed for {} -> {}: {}", device, mountpoint, err)
        return False, err.strip() or "mount failed"

    logger.info("Mounted {} at {}", device, mountpoint)
    return True, ""


async def unmount_device(mountpoint_or_device: str) -> tuple[bool, str]:
    """Unmount a device or mountpoint."""
    code, out, err = await _run(
        ["sudo", "umount", mountpoint_or_device], timeout=15.0
    )
    if code != 0:
        logger.error("umount failed for {}: {}", mountpoint_or_device, err)
        return False, err.strip() or "umount failed"

    logger.info("Unmounted {}", mountpoint_or_device)
    return True, ""


async def format_device(
    device: str, fstype: str, label: str = ""
) -> tuple[bool, str]:
    """Format a device with the given filesystem type. DESTRUCTIVE."""
    allowed_fstypes = {"ext4", "vfat", "exfat", "ntfs", "btrfs"}
    if fstype not in allowed_fstypes:
        return False, f"Unsupported fstype '{fstype}'. Allowed: {', '.join(sorted(allowed_fstypes))}"

    if not device.startswith("/dev/"):
        return False, "Device path must start with /dev/"

    # Build mkfs command
    cmd: list[str]
    if fstype == "vfat":
        cmd = ["sudo", "mkfs.vfat"]
        if label:
            cmd += ["-n", label[:11]]  # FAT label max 11 chars
    elif fstype == "exfat":
        cmd = ["sudo", "mkfs.exfat"]
        if label:
            cmd += ["-n", label[:15]]
    elif fstype == "ntfs":
        cmd = ["sudo", "mkfs.ntfs", "--fast"]
        if label:
            cmd += ["-L", label]
    elif fstype == "btrfs":
        cmd = ["sudo", "mkfs.btrfs", "--force"]
        if label:
            cmd += ["-L", label]
    else:  # ext4
        cmd = ["sudo", "mkfs.ext4", "-F"]
        if label:
            cmd += ["-L", label]

    cmd.append(device)

    logger.warning("Formatting device {} with fstype={}", device, fstype)
    code, out, err = await _run(cmd, timeout=120.0)
    output = (out + err).strip()

    if code != 0:
        logger.error("mkfs failed for {}: {}", device, err)
        return False, err.strip() or "format failed"

    logger.info("Formatted {} as {}", device, fstype)
    return True, output


async def get_disk_usage() -> list[dict]:
    """Return disk usage for real filesystems via df, including filesystem type."""
    code, out, err = await _run(
        ["df", "-B1", "--output=source,fstype,size,used,avail,pcent,target"],
        timeout=10.0,
    )
    if code != 0:
        logger.warning("df failed: {}", err)
        return []

    results: list[dict] = []
    lines = out.strip().splitlines()

    for line in lines[1:]:  # skip header
        parts = line.split()
        if len(parts) < 7:
            continue
        device, fstype_val, size, used, avail, pcent, target = (
            parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]
        )

        # Skip virtual/pseudo filesystems
        if not device.startswith("/dev/"):
            continue

        try:
            size_bytes = int(size)
            used_bytes = int(used)
            avail_bytes = int(avail)
            percent = float(pcent.rstrip("%"))
        except ValueError:
            continue

        results.append(
            {
                "device":      device,
                "fstype":      fstype_val,
                "size_bytes":  size_bytes,
                "used_bytes":  used_bytes,
                "avail_bytes": avail_bytes,
                "percent":     percent,
                "mountpoint":  target,
            }
        )

    return results


async def get_io_stats() -> list[dict]:
    """Read /proc/diskstats — cumulative I/O counters since boot per block device."""
    try:
        with open("/proc/diskstats") as f:
            raw = f.readlines()
    except Exception as exc:
        logger.warning("Could not read /proc/diskstats: {}", exc)
        return []

    results: list[dict] = []
    for line in raw:
        parts = line.split()
        if len(parts) < 14:
            continue
        device = parts[2]
        # Skip partitions (end with digit), loop, ram, zram
        if re.match(r"(loop|ram|zram)", device) or device[-1].isdigit():
            continue
        try:
            results.append({
                "device":          device,
                "reads_completed": int(parts[3]),
                "reads_bytes":     int(parts[5]) * 512,
                "writes_completed": int(parts[7]),
                "writes_bytes":    int(parts[9]) * 512,
                "io_in_progress":  int(parts[11]),
                "io_time_ms":      int(parts[12]),
            })
        except (ValueError, IndexError):
            continue

    return results


async def eject_device(device: str) -> tuple[bool, str]:
    """Eject a removable device."""
    if not device.startswith("/dev/"):
        return False, "Device path must start with /dev/"

    code, out, err = await _run(["sudo", "eject", device], timeout=10.0)
    if code != 0:
        logger.error("eject failed for {}: {}", device, err)
        return False, err.strip() or "eject failed"

    logger.info("Ejected {}", device)
    return True, ""
