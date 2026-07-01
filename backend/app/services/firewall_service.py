from __future__ import annotations

import asyncio
import re

from loguru import logger


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


async def get_ufw_status() -> dict:
    """Run `sudo ufw status verbose` and `sudo ufw status numbered`, parse both."""
    code_v, out_v, _ = await _run(["sudo", "ufw", "status", "verbose"], timeout=10.0)
    code_n, out_n, _ = await _run(["sudo", "ufw", "status", "numbered"], timeout=10.0)

    enabled = False
    default_incoming = "deny"
    default_outgoing = "allow"
    default_routed = "disabled"

    if code_v == 0:
        for line in out_v.splitlines():
            line_lower = line.lower().strip()
            if line_lower.startswith("status:"):
                enabled = "active" in line_lower
            elif line_lower.startswith("default:"):
                # e.g. "Default: deny (incoming), allow (outgoing), disabled (routed)"
                m_in = re.search(r"(\w+)\s*\(incoming\)", line, re.IGNORECASE)
                m_out = re.search(r"(\w+)\s*\(outgoing\)", line, re.IGNORECASE)
                m_rt = re.search(r"(\w+)\s*\(routed\)", line, re.IGNORECASE)
                if m_in:
                    default_incoming = m_in.group(1).lower()
                if m_out:
                    default_outgoing = m_out.group(1).lower()
                if m_rt:
                    default_routed = m_rt.group(1).lower()

    rules: list[dict] = []
    if code_n == 0:
        for line in out_n.splitlines():
            # Pattern: "[ 1] 22/tcp                     ALLOW IN    Anywhere"
            # or:      "[ 1] Anywhere                   ALLOW FWD   192.168.1.0/24"
            m = re.match(
                r"\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT)(?:\s+(IN|OUT|FWD))?\s+(.+?)(?:\s+#\s*(.+))?$",
                line.strip(),
                re.IGNORECASE,
            )
            if m:
                number = int(m.group(1))
                to_field = m.group(2).strip()
                action = m.group(3).upper()
                direction = (m.group(4) or "IN").upper()
                from_field = m.group(5).strip()
                comment = (m.group(6) or "").strip()

                rules.append({
                    "number": number,
                    "to": to_field,
                    "action": action,
                    "direction": direction,
                    "from_": from_field,
                    "comment": comment,
                })

    return {
        "enabled": enabled,
        "default_incoming": default_incoming,
        "default_outgoing": default_outgoing,
        "default_routed": default_routed,
        "rules": rules,
    }


async def enable_ufw() -> bool:
    code, _, err = await _run(["sudo", "ufw", "--force", "enable"], timeout=15.0)
    if code != 0:
        logger.error("Failed to enable UFW: {}", err)
        return False
    logger.info("UFW enabled")
    return True


async def disable_ufw() -> bool:
    code, _, err = await _run(["sudo", "ufw", "--force", "disable"], timeout=15.0)
    if code != 0:
        logger.error("Failed to disable UFW: {}", err)
        return False
    logger.info("UFW disabled")
    return True


async def add_rule(
    direction: str,
    action: str,
    proto: str,
    port: str,
    from_ip: str,
    comment: str,
) -> bool:
    """
    Build and run a ufw rule command.
    direction: "in" | "out"
    action:    "allow" | "deny" | "reject"
    proto:     "tcp" | "udp" | "any"
    port:      port number/range or empty string for any
    from_ip:   source IP/CIDR or "any"
    comment:   optional comment string
    """
    cmd = ["sudo", "ufw"]

    # Direction maps to ufw keyword
    if direction.lower() == "out":
        cmd.append("route") if False else None  # simple out rule
        cmd += [action.lower(), "out"]
    else:
        cmd.append(action.lower())
        cmd += ["in"]

    # From source
    from_val = from_ip.strip() if from_ip.strip() else "any"
    cmd += ["from", from_val]

    # To destination / port
    if port.strip():
        cmd += ["to", "any", "port", port.strip()]
    else:
        cmd += ["to", "any"]

    # Protocol
    if proto.lower() not in ("any", ""):
        cmd += ["proto", proto.lower()]

    # Comment
    if comment.strip():
        cmd += ["comment", comment.strip()]

    code, out, err = await _run(cmd, timeout=15.0)
    if code != 0:
        logger.error("Failed to add UFW rule ({}): {}", " ".join(cmd), err)
        return False
    logger.info("UFW rule added: {}", " ".join(cmd))
    return True


async def delete_rule(rule_number: int) -> bool:
    code, _, err = await _run(["sudo", "ufw", "--force", "delete", str(rule_number)], timeout=10.0)
    if code != 0:
        logger.error("Failed to delete UFW rule {}: {}", rule_number, err)
        return False
    logger.info("UFW rule {} deleted", rule_number)
    return True


async def set_default(direction: str, policy: str) -> bool:
    """direction: incoming|outgoing|routed, policy: allow|deny|reject"""
    code, _, err = await _run(["sudo", "ufw", "default", policy.lower(), direction.lower()], timeout=10.0)
    if code != 0:
        logger.error("Failed to set UFW default {} {}: {}", policy, direction, err)
        return False
    logger.info("UFW default {} set to {}", direction, policy)
    return True


async def reload_ufw() -> bool:
    code, _, err = await _run(["sudo", "ufw", "reload"], timeout=15.0)
    if code != 0:
        logger.error("Failed to reload UFW: {}", err)
        return False
    logger.info("UFW reloaded")
    return True
