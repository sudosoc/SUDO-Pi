from __future__ import annotations

import asyncio
import glob as _glob
import os
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


def _xenv() -> dict[str, str]:
    """Build env with DISPLAY and XAUTHORITY for the current X session."""
    env = {**os.environ, "DISPLAY": ":0"}
    if os.environ.get("XAUTHORITY"):
        return env
    for pattern in (
        "/run/user/*/Xauthority",
        "/home/*/.Xauthority",
        "/tmp/.xauth*",
        "/root/.Xauthority",
    ):
        matches = _glob.glob(pattern)
        if matches:
            env["XAUTHORITY"] = matches[0]
            return env
    return env


async def get_display_status() -> dict:
    """Get current display info using tvservice, vcgencmd, and xrandr."""
    result: dict = {
        "hdmi_connected": False,
        "display_on": False,
        "resolution": None,
        "refresh_rate": None,
        "mode": None,
        "displays": [],
        "xrandr_available": False,
    }

    # Check tvservice
    code, out, err = await _run(["tvservice", "-s"], timeout=5.0)
    if code == 0:
        result["mode"] = out.strip()
        result["hdmi_connected"] = "HDMI" in out and "TV is off" not in out
        m = re.search(r"(\d{3,4})x(\d{3,4})", out)
        if m:
            result["resolution"] = f"{m.group(1)}x{m.group(2)}"
        rf = re.search(r"@\s*(\d+(?:\.\d+)?)\s*Hz", out)
        if rf:
            try:
                result["refresh_rate"] = float(rf.group(1))
            except ValueError:
                pass

    # vcgencmd display_power
    code2, out2, _ = await _run(["vcgencmd", "display_power"], timeout=5.0)
    if code2 == 0:
        result["display_on"] = "display_power=1" in out2

    # Try xrandr
    env = _xenv()
    proc = await asyncio.create_subprocess_exec(
        "xrandr", "--query",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        xout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        xrandr_output = xout.decode(errors="replace")
        if "connected" in xrandr_output:
            result["xrandr_available"] = True
            for line in xrandr_output.splitlines():
                m2 = re.match(r"^(\S+)\s+(connected|disconnected)(.*)", line)
                if m2:
                    display_name = m2.group(1)
                    is_connected = m2.group(2) == "connected"
                    rest = m2.group(3)
                    is_primary = "primary" in rest
                    current_res = None
                    current_rate = None
                    res_m = re.search(r"(\d+x\d+)\+\d+\+\d+", rest)
                    if res_m:
                        current_res = res_m.group(1)
                        if not result["resolution"] and is_connected:
                            result["resolution"] = current_res
                    result["displays"].append({
                        "name": display_name,
                        "connected": is_connected,
                        "resolution": current_res,
                        "refresh_rate": current_rate,
                        "is_primary": is_primary,
                    })
    except asyncio.TimeoutError:
        if proc.returncode is None:
            proc.kill()
    except Exception as exc:
        logger.debug("xrandr query failed: {}", exc)

    return result


async def get_available_resolutions() -> list[str]:
    """List available resolutions via tvservice or xrandr."""
    resolutions: set[str] = set()

    for mode_type in ("DMT", "CEA"):
        code, out, _ = await _run(["tvservice", "-m", mode_type], timeout=5.0)
        if code == 0:
            for line in out.splitlines():
                m = re.search(r"(\d{3,4}x\d{3,4})", line)
                if m:
                    resolutions.add(m.group(1))

    env = _xenv()
    proc = await asyncio.create_subprocess_exec(
        "xrandr", "--query",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        xout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        xrandr_output = xout.decode(errors="replace")
        for line in xrandr_output.splitlines():
            if line and line[0] in (" ", "\t"):
                m = re.match(r"\s+(\d{3,4}x\d{3,4})", line)
                if m:
                    resolutions.add(m.group(1))
    except asyncio.TimeoutError:
        if proc.returncode is None:
            proc.kill()
    except Exception:
        pass

    return sorted(
        resolutions,
        key=lambda r: (int(r.split("x")[0]), int(r.split("x")[1])),
        reverse=True,
    )


async def set_display_power(on: bool) -> bool:
    """Turn display on or off via vcgencmd."""
    val = "1" if on else "0"
    code, _, err = await _run(["vcgencmd", "display_power", val], timeout=10.0)
    if code != 0:
        logger.error("Failed to set display power to {}: {}", val, err)
    return code == 0


async def set_resolution_xrandr(
    display_name: str, resolution: str, refresh_rate: str = ""
) -> tuple[bool, str]:
    """Set resolution via xrandr."""
    env = _xenv()
    cmd = ["xrandr", "--output", display_name, "--mode", resolution]
    if refresh_rate:
        cmd += ["--rate", refresh_rate]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        success = proc.returncode == 0
        if not success:
            logger.error("xrandr set resolution failed: {}", err.decode(errors="replace"))
        return success, err.decode(errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        return False, "timeout"


async def rotate_display(display_name: str, rotation: str) -> tuple[bool, str]:
    """Rotate display via xrandr."""
    if rotation not in ("normal", "inverted", "left", "right"):
        return False, "Invalid rotation. Must be one of: normal, inverted, left, right"

    env = _xenv()
    proc = await asyncio.create_subprocess_exec(
        "xrandr", "--output", display_name, "--rotate", rotation,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        _, err = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        success = proc.returncode == 0
        if not success:
            logger.error("xrandr rotate failed: {}", err.decode(errors="replace"))
        return success, err.decode(errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        return False, "timeout"


async def get_gpu_memory() -> int | None:
    """Get GPU memory allocation in MB via vcgencmd."""
    code, out, _ = await _run(["vcgencmd", "get_mem", "gpu"], timeout=5.0)
    if code == 0:
        m = re.search(r"gpu=(\d+)M", out)
        if m:
            return int(m.group(1))
    return None


async def set_gpu_memory(mb: int) -> bool:
    """Write gpu_mem={mb} to /boot/firmware/config.txt using sudo tee."""
    allowed = {16, 32, 64, 128, 256, 512}
    if mb not in allowed:
        logger.error("Invalid GPU memory value: {}. Allowed: {}", mb, allowed)
        return False

    config_path = "/boot/firmware/config.txt"
    if not Path(config_path).exists():
        config_path = "/boot/config.txt"

    try:
        # Read current content (no root needed for read)
        try:
            content = Path(config_path).read_text()
        except PermissionError:
            code, content, _ = await _run(["sudo", "cat", config_path], timeout=5.0)
            if code != 0:
                logger.error("Cannot read {}", config_path)
                return False

        if "gpu_mem=" in content:
            new_content = re.sub(r"gpu_mem=\d+", f"gpu_mem={mb}", content)
        else:
            new_content = content.rstrip("\n") + f"\ngpu_mem={mb}\n"

        # Write via sudo tee (backend runs as non-root)
        proc = await asyncio.create_subprocess_exec(
            "sudo", "tee", config_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(
            proc.communicate(new_content.encode()), timeout=10.0
        )
        if proc.returncode != 0:
            logger.error("sudo tee failed writing {}: {}", config_path, stderr.decode(errors="replace"))
            return False

        logger.info("Set GPU memory to {}MB in {}", mb, config_path)
        return True
    except Exception as exc:
        logger.error("Failed to set GPU memory: {}", exc)
        return False
