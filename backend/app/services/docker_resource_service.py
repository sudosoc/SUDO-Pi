from __future__ import annotations

import asyncio
import json

from loguru import logger


async def _run(cmd: list[str]) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")


async def get_container_resources(container_id: str) -> dict:
    rc, stdout, stderr = await _run([
        "docker", "inspect",
        "--format", "{{json .HostConfig}}",
        container_id,
    ])
    if rc != 0:
        raise ValueError(f"Container {container_id!r} not found: {stderr.strip()}")

    try:
        host_config = json.loads(stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to parse docker inspect output: {exc}") from exc

    cpu_quota = host_config.get("CpuQuota", 0)
    cpu_period = host_config.get("CpuPeriod", 0) or 100_000
    memory_bytes = host_config.get("Memory", 0)
    memory_swap_bytes = host_config.get("MemorySwap", 0)

    # Convert quota/period to number of cores (0 means unlimited)
    cpu_cores = round(cpu_quota / cpu_period, 4) if cpu_quota and cpu_quota > 0 else 0.0

    return {
        "cpu_cores": cpu_cores,
        "cpu_quota": cpu_quota,
        "cpu_period": cpu_period,
        "memory_limit_bytes": memory_bytes,
        "memory_limit_mb": round(memory_bytes / (1024 * 1024), 1) if memory_bytes else 0,
        "memory_swap_bytes": memory_swap_bytes,
    }


async def set_container_resources(container_id: str, cpu_cores: float, memory_mb: int) -> dict:
    cmd = ["docker", "update"]

    if cpu_cores > 0:
        cmd += ["--cpus", str(cpu_cores)]
    else:
        cmd += ["--cpus", "0"]

    if memory_mb > 0:
        cmd += ["--memory", f"{memory_mb}m", "--memory-swap", f"{memory_mb * 2}m"]
    else:
        cmd += ["--memory", "0", "--memory-swap", "0"]

    cmd.append(container_id)

    logger.info(
        "Updating resources for container {!r}: cpu_cores={}, memory_mb={}",
        container_id, cpu_cores, memory_mb,
    )
    rc, stdout, stderr = await _run(cmd)
    if rc != 0:
        raise RuntimeError(f"docker update failed: {(stdout + stderr).strip()}")

    return await get_container_resources(container_id)
