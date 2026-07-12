from __future__ import annotations

from dataclasses import dataclass

from loguru import logger


@dataclass
class PackageInfo:
    name: str
    version: str
    description: str
    installed: bool = True


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 120.0) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout)


async def list_installed(skip: int = 0, limit: int = 200) -> dict:
    code, out, _ = await _run(
        ["dpkg-query", "-W", "--showformat=${Package}\t${Version}\t${binary:Summary}\n"]
    )
    items: list[PackageInfo] = []
    if code == 0:
        for line in out.splitlines():
            parts = line.split("\t", 2)
            if len(parts) == 3:
                items.append(PackageInfo(name=parts[0], version=parts[1], description=parts[2]))
    total = len(items)
    return {"items": [vars(p) for p in items[skip : skip + limit]], "total": total}


async def search_packages(query: str) -> list[dict]:
    if not query or len(query) > 100:
        return []
    code, out, _ = await _run(["apt-cache", "search", "--names-only", query])
    installed_names: set[str] = set()
    ic, iout, _ = await _run(["dpkg-query", "-f", "${Package}\n", "-W"])
    if ic == 0:
        installed_names = set(iout.splitlines())

    results: list[dict] = []
    for line in out.splitlines()[:50]:
        parts = line.split(" - ", 1)
        name = parts[0].strip()
        description = parts[1].strip() if len(parts) > 1 else ""
        vc, vout, _ = await _run(["apt-cache", "show", "--no-all-versions", name])
        version = ""
        if vc == 0:
            for vline in vout.splitlines():
                if vline.startswith("Version:"):
                    version = vline.split(":", 1)[1].strip()
                    break
        results.append({
            "name": name,
            "description": description,
            "version": version,
            "installed": name in installed_names,
        })
    return results


async def install_package(name: str) -> dict:
    if not _is_safe_package_name(name):
        raise ValueError(f"Invalid package name: {name!r}")
    logger.info(f"Installing package: {name}")
    code, out, err = await _run(
        ["sudo", "apt-get", "install", "-y", "--no-install-recommends", name],
        timeout=300.0,
    )
    if code != 0:
        raise RuntimeError(f"apt-get install failed: {err.strip()}")
    return {"name": name, "status": "installed"}


async def remove_package(name: str) -> dict:
    if not _is_safe_package_name(name):
        raise ValueError(f"Invalid package name: {name!r}")
    logger.info(f"Removing package: {name}")
    code, out, err = await _run(
        ["sudo", "apt-get", "remove", "-y", name],
        timeout=120.0,
    )
    if code != 0:
        raise RuntimeError(f"apt-get remove failed: {err.strip()}")
    return {"name": name, "status": "removed"}


async def upgrade_all() -> dict:
    logger.info("Running apt-get upgrade")
    uc, _, ue = await _run(["sudo", "apt-get", "update"], timeout=120.0)
    if uc != 0:
        raise RuntimeError(f"apt-get update failed: {ue.strip()}")
    code, out, err = await _run(["sudo", "apt-get", "upgrade", "-y"], timeout=600.0)
    if code != 0:
        raise RuntimeError(f"apt-get upgrade failed: {err.strip()}")
    return {"status": "upgraded"}


def _is_safe_package_name(name: str) -> bool:
    import re
    return bool(re.match(r"^[a-z0-9][a-z0-9+\-\.]{0,127}$", name))
