from __future__ import annotations

import re

from loguru import logger


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 15.0) -> tuple[int, str, str]:
    return await run_cmd(cmd, timeout=timeout)


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


async def get_port_forwards() -> list[dict]:
    """List iptables NAT PREROUTING DNAT rules (port forwards)."""
    code, out, _ = await _run(
        ["sudo", "iptables", "-t", "nat", "-L", "PREROUTING", "-n", "--line-numbers", "-v"],
        timeout=10.0,
    )
    if code != 0:
        return []

    rules: list[dict] = []
    for line in out.splitlines():
        line = line.strip()
        # Only DNAT target lines
        if "DNAT" not in line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            num = int(parts[0])
        except ValueError:
            continue

        proto = ""
        src_port = ""
        dest_host = ""
        dest_port = ""
        comment = ""

        # Extract proto (e.g. tcp, udp)
        for i, p in enumerate(parts):
            if p in ("tcp", "udp"):
                proto = p
                break

        # dpt:PORT
        import re as _re
        dpt_m = _re.search(r"dpt:(\d+)", line)
        if dpt_m:
            src_port = dpt_m.group(1)

        # to:HOST:PORT
        to_m = _re.search(r"to:([^:]+):(\d+)", line)
        if to_m:
            dest_host = to_m.group(1)
            dest_port = to_m.group(2)

        # /* comment */
        cmt_m = _re.search(r"/\*\s*(.+?)\s*\*/", line)
        if cmt_m:
            comment = cmt_m.group(1)

        rules.append({
            "num": num,
            "proto": proto,
            "src_port": src_port,
            "dest_host": dest_host,
            "dest_port": dest_port,
            "comment": comment,
        })

    return rules


async def add_port_forward(
    proto: str, src_port: int, dest_host: str, dest_port: int, comment: str = ""
) -> bool:
    """Add an iptables DNAT rule for port forwarding."""
    import re as _re

    if proto not in ("tcp", "udp"):
        return False
    if not (1 <= src_port <= 65535 and 1 <= dest_port <= 65535):
        return False
    if not _re.match(r"^[\d.]{7,15}$", dest_host):
        return False

    cmd = [
        "sudo", "iptables",
        "-t", "nat",
        "-A", "PREROUTING",
        "-p", proto,
        "--dport", str(src_port),
        "-j", "DNAT",
        "--to-destination", f"{dest_host}:{dest_port}",
    ]
    if comment.strip():
        cmd += ["-m", "comment", "--comment", comment.strip()[:64]]

    code, _, err = await _run(cmd, timeout=10.0)
    if code != 0:
        logger.error("Failed to add port forward: {}", err)
        return False

    # Also add MASQUERADE to allow forwarded traffic back
    masq_cmd = [
        "sudo", "iptables",
        "-t", "nat",
        "-A", "POSTROUTING",
        "-j", "MASQUERADE",
    ]
    await _run(masq_cmd, timeout=10.0)

    logger.info("Port forward added: {} {} -> {}:{}", proto, src_port, dest_host, dest_port)
    return True


async def delete_port_forward(line_num: int) -> bool:
    """Delete an iptables PREROUTING rule by line number."""
    code, _, err = await _run(
        ["sudo", "iptables", "-t", "nat", "-D", "PREROUTING", str(line_num)],
        timeout=10.0,
    )
    if code != 0:
        logger.error("Failed to delete port forward #{}: {}", line_num, err)
        return False
    logger.info("Port forward #{} deleted", line_num)
    return True


async def reload_ufw() -> bool:
    code, _, err = await _run(["sudo", "ufw", "reload"], timeout=15.0)
    if code != 0:
        logger.error("Failed to reload UFW: {}", err)
        return False
    logger.info("UFW reloaded")
    return True
