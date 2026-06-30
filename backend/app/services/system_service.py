from __future__ import annotations

import asyncio
import os
import platform
import re
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
from loguru import logger

from app.schemas.system import (
    CpuStats,
    DiskPartition,
    MemoryStats,
    NetworkInterfaceStats,
    ProcessInfo,
    ServiceInfo,
    SystemStats,
    TemperatureReading,
    TemperatureStats,
)

_SERVICES_WHITELIST = {
    "nginx", "sshd", "ssh", "hostapd", "dnsmasq", "NetworkManager",
    "bluetooth", "docker", "sudo-pi-backend", "systemd-resolved",
    "avahi-daemon", "fail2ban", "ufw", "cron",
}


def _get_cpu_stats() -> CpuStats:
    freq = psutil.cpu_freq(percpu=False)
    freq_mhz = freq.current if freq else 0.0
    freq_max = freq.max if freq else 0.0
    load = psutil.getloadavg()
    return CpuStats(
        percent=psutil.cpu_percent(interval=None),
        per_core=psutil.cpu_percent(interval=None, percpu=True),
        frequency_mhz=round(freq_mhz, 1),
        frequency_max_mhz=round(freq_max, 1),
        load_avg_1=round(load[0], 2),
        load_avg_5=round(load[1], 2),
        load_avg_15=round(load[2], 2),
        core_count=psutil.cpu_count(logical=False) or 1,
        thread_count=psutil.cpu_count(logical=True) or 1,
    )


def _get_memory_stats() -> MemoryStats:
    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return MemoryStats(
        total_bytes=vm.total,
        available_bytes=vm.available,
        used_bytes=vm.used,
        percent=vm.percent,
        swap_total_bytes=swap.total,
        swap_used_bytes=swap.used,
        swap_percent=swap.percent,
    )


def _get_disk_stats() -> list[DiskPartition]:
    partitions = []
    io_counters = {}
    try:
        io = psutil.disk_io_counters(perdisk=True)
        if io:
            io_counters = io
    except Exception:
        pass

    for part in psutil.disk_partitions(all=False):
        if part.fstype in ("squashfs", "tmpfs", "devtmpfs", ""):
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except PermissionError:
            continue

        dev_name = Path(part.device).name
        io_stat = io_counters.get(dev_name)

        partitions.append(
            DiskPartition(
                mountpoint=part.mountpoint,
                device=part.device,
                fstype=part.fstype,
                total_bytes=usage.total,
                used_bytes=usage.used,
                free_bytes=usage.free,
                percent=round(usage.percent, 1),
                read_bytes=io_stat.read_bytes if io_stat else 0,
                write_bytes=io_stat.write_bytes if io_stat else 0,
            )
        )
    return partitions


def _get_temperature_stats() -> TemperatureStats:
    cpu_temp: float | None = None
    gpu_temp: float | None = None
    sensors: list[TemperatureReading] = []

    try:
        vcgencmd_path = "/usr/bin/vcgencmd"
        if Path(vcgencmd_path).exists():
            result = subprocess.run(
                [vcgencmd_path, "measure_temp"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            match = re.search(r"temp=(\d+\.?\d*)°?C", result.stdout)
            if match:
                cpu_temp = float(match.group(1))
    except Exception:
        pass

    try:
        temps = psutil.sensors_temperatures()
        for name, entries in temps.items():
            for entry in entries:
                t = TemperatureReading(
                    label=f"{name}/{entry.label}" if entry.label else name,
                    current=entry.current,
                    high=entry.high,
                    critical=entry.critical,
                )
                sensors.append(t)
                if cpu_temp is None and "cpu" in name.lower():
                    cpu_temp = entry.current
                if gpu_temp is None and "gpu" in name.lower():
                    gpu_temp = entry.current
    except Exception:
        pass

    if cpu_temp is None:
        try:
            thermal_path = Path("/sys/class/thermal/thermal_zone0/temp")
            if thermal_path.exists():
                cpu_temp = int(thermal_path.read_text().strip()) / 1000.0
        except Exception:
            pass

    return TemperatureStats(cpu=cpu_temp, gpu=gpu_temp, sensors=sensors)


def _get_network_interface_stats() -> list[NetworkInterfaceStats]:
    net_io = psutil.net_io_counters(pernic=True)
    net_if_stats = psutil.net_if_stats()
    net_if_addrs = psutil.net_if_addrs()
    result = []

    for iface_name, io in net_io.items():
        if iface_name == "lo":
            continue
        stats = net_if_stats.get(iface_name)
        addrs = net_if_addrs.get(iface_name, [])
        addr_list = [a.address for a in addrs if a.family.name in ("AF_INET", "AF_INET6") and not a.address.startswith("fe80")]

        result.append(
            NetworkInterfaceStats(
                name=iface_name,
                bytes_sent=io.bytes_sent,
                bytes_recv=io.bytes_recv,
                packets_sent=io.packets_sent,
                packets_recv=io.packets_recv,
                speed_mbps=stats.speed if stats else 0,
                is_up=stats.isup if stats else False,
                addresses=addr_list,
            )
        )
    return result


def _get_top_processes(n: int = 25) -> list[ProcessInfo]:
    processes = []
    for proc in psutil.process_iter(["pid", "name", "status", "cpu_percent", "memory_percent", "memory_info", "username", "cmdline", "num_threads", "create_time"]):
        try:
            info = proc.info
            cmd = " ".join(info.get("cmdline") or [info.get("name", "")])[:200]
            processes.append(
                ProcessInfo(
                    pid=info["pid"],
                    name=info.get("name", ""),
                    status=info.get("status", ""),
                    cpu_percent=round(info.get("cpu_percent") or 0.0, 1),
                    memory_percent=round(info.get("memory_percent") or 0.0, 2),
                    memory_rss_bytes=(info.get("memory_info") or psutil.pmem(0, 0)).rss,
                    user=info.get("username") or "",
                    command=cmd,
                    num_threads=info.get("num_threads") or 1,
                    created_time=info.get("create_time") or 0.0,
                )
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    processes.sort(key=lambda p: p.cpu_percent, reverse=True)
    return processes[:n]


async def _get_service_status(name: str) -> ServiceInfo | None:
    try:
        result = await asyncio.create_subprocess_exec(
            "systemctl", "show", name,
            "--property=ActiveState,LoadState,SubState,MainPID,Description",
            "--no-pager",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(result.communicate(), timeout=5.0)
        props: dict[str, str] = {}
        for line in stdout.decode().splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                props[k.strip()] = v.strip()

        if not props:
            return None

        active = props.get("ActiveState", "inactive")
        load = props.get("LoadState", "not-found")

        return ServiceInfo(
            name=name,
            display_name=name,
            status="running" if active == "active" else "stopped",
            active_state=active,
            load_state=load,
            sub_state=props.get("SubState", ""),
            description=props.get("Description", name),
            pid=int(props["MainPID"]) if props.get("MainPID", "0") != "0" else None,
        )
    except Exception as exc:
        logger.debug("Could not get service status for {}: {}", name, exc)
        return None


async def get_services_status() -> list[ServiceInfo]:
    tasks = [_get_service_status(svc) for svc in _SERVICES_WHITELIST]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]


async def control_service(name: str, action: str) -> bool:
    if name not in _SERVICES_WHITELIST:
        raise ValueError(f"Service {name!r} is not allowed")
    if action not in ("start", "stop", "restart", "reload"):
        raise ValueError(f"Action {action!r} is not valid")
    try:
        result = await asyncio.create_subprocess_exec(
            "sudo", "systemctl", action, name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(result.communicate(), timeout=30.0)
        if result.returncode != 0:
            logger.error("Failed to {} {}: {}", action, name, stderr.decode())
            return False
        return True
    except Exception as exc:
        logger.error("Service control error: {}", exc)
        return False


async def get_full_system_stats() -> SystemStats:
    cpu = _get_cpu_stats()
    memory = _get_memory_stats()
    disks = _get_disk_stats()
    temperature = _get_temperature_stats()
    network_ifaces = _get_network_interface_stats()
    boot_time = psutil.boot_time()
    uptime = time.time() - boot_time

    return SystemStats(
        cpu=cpu,
        memory=memory,
        disks=disks,
        temperature=temperature,
        network_interfaces=network_ifaces,
        uptime_seconds=round(uptime, 1),
        boot_time=boot_time,
        hostname=socket.gethostname(),
        kernel=platform.release(),
        os=f"{platform.system()} {platform.version()}".strip(),
        architecture=platform.machine(),
    )


async def get_journal_logs(unit: str | None = None, lines: int = 200) -> list[dict]:
    cmd = ["journalctl", "--no-pager", "-n", str(lines), "--output=json"]
    if unit:
        cmd += ["-u", unit]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        import json
        entries = []
        for line in stdout.decode(errors="replace").splitlines():
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return entries
    except Exception as exc:
        logger.error("Failed to read journal: {}", exc)
        return []


async def set_hostname(hostname: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "hostnamectl", "set-hostname", hostname,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=10.0)
        return proc.returncode == 0
    except Exception:
        return False


async def set_timezone(tz: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "timedatectl", "set-timezone", tz,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=10.0)
        return proc.returncode == 0
    except Exception:
        return False


async def kill_process(pid: int) -> None:
    import signal as _signal
    try:
        proc = psutil.Process(pid)
        proc.send_signal(_signal.SIGTERM)
        logger.info("Sent SIGTERM to PID {}", pid)
    except psutil.NoSuchProcess as exc:
        raise ProcessLookupError(f"Process {pid} not found") from exc
    except psutil.AccessDenied as exc:
        raise PermissionError(f"Permission denied to kill PID {pid}") from exc


async def reboot_system() -> None:
    await asyncio.create_subprocess_exec("sudo", "reboot")


async def shutdown_system() -> None:
    await asyncio.create_subprocess_exec("sudo", "shutdown", "now")
