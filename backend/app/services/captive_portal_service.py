from __future__ import annotations

import asyncio
from pathlib import Path

from loguru import logger


PORTAL_CONF = "/etc/nginx/sites-available/sudo-pi-portal"
PORTAL_ENABLED = "/etc/nginx/sites-enabled/sudo-pi-portal"
ALLOWED_FILE = "/etc/sudo-pi-portal-allowed"
AP_IP = "192.168.4.1"
PORTAL_PORT = 8080

_PORTAL_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 1rem;
    }}
    .card {{
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      padding: 2.5rem 2rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,.6);
    }}
    .logo {{
      width: 56px;
      height: 56px;
      background: #7c3aed;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }}
    .logo svg {{ width: 28px; height: 28px; fill: #fff; }}
    h1 {{ font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; }}
    p {{
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }}
    button {{
      display: block;
      width: 100%;
      padding: 0.875rem 1.5rem;
      background: #7c3aed;
      color: #fff;
      border: none;
      border-radius: 0.625rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }}
    button:hover {{ background: #6d28d9; }}
    button:active {{ background: #5b21b6; }}
    .status {{
      margin-top: 1rem;
      font-size: 0.85rem;
      color: #a1a1aa;
      min-height: 1.25rem;
    }}
    .status.error {{ color: #f87171; }}
    .status.success {{ color: #4ade80; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    </div>
    <h1>{title}</h1>
    <p>{message}</p>
    <button id="connect-btn" onclick="connect()">Connect to Internet</button>
    <div class="status" id="status"></div>
  </div>
  <script>
    async function getMac() {{
      try {{
        const r = await fetch('/api/v1/captive-portal/client-mac');
        if (r.ok) {{ const d = await r.json(); return d.mac || ''; }}
      }} catch {{}}
      return '';
    }}
    async function connect() {{
      const btn = document.getElementById('connect-btn');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.textContent = 'Connecting…';
      status.textContent = '';
      status.className = 'status';
      const mac = await getMac();
      try {{
        const r = await fetch('/api/v1/captive-portal/accept', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ mac }})
        }});
        if (r.ok) {{
          status.textContent = 'You are now connected!';
          status.className = 'status success';
          btn.textContent = 'Connected';
          setTimeout(() => {{ window.location.href = 'http://captive.apple.com/'; }}, 1500);
        }} else {{
          const d = await r.json().catch(() => ({{}}));
          status.textContent = d.detail || 'Connection failed. Please try again.';
          status.className = 'status error';
          btn.disabled = false;
          btn.textContent = 'Connect to Internet';
        }}
      }} catch {{
        status.textContent = 'Network error. Please try again.';
        status.className = 'status error';
        btn.disabled = false;
        btn.textContent = 'Connect to Internet';
      }}
    }}
  </script>
</body>
</html>
"""

_NGINX_CONF_TEMPLATE = """\
server {{
    listen {port};
    server_name _;

    location /api/v1/ {{
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }}

    location / {{
        default_type text/html;
        return 200 '{html}';
    }}
}}
"""


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


async def _write_file_as_root(path: str, content: str) -> None:
    """Write content to a file using sudo tee."""
    proc = await asyncio.create_subprocess_exec(
        "sudo", "tee", path,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate(input=content.encode())
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to write {path}: {err.decode(errors='replace')}")


def _read_allowed_file() -> list[str]:
    """Read the allowed MACs file and return a list of MAC addresses."""
    try:
        text = Path(ALLOWED_FILE).read_text(errors="replace")
        return [line.strip().lower() for line in text.splitlines() if line.strip()]
    except OSError:
        return []


async def get_status() -> dict:
    """Return captive portal status."""
    enabled = Path(PORTAL_CONF).exists()
    allowed = _read_allowed_file()

    title = "Welcome to SUDO-Pi"
    message = "Please accept the terms to connect to the internet."

    if enabled:
        try:
            text = Path(PORTAL_CONF).read_text(errors="replace")
            import re
            t = re.search(r"<h1>(.+?)</h1>", text)
            p = re.search(r"<p>(.+?)</p>", text, re.DOTALL)
            if t:
                title = t.group(1)
            if p:
                message = p.group(1).strip()
        except OSError:
            pass

    return {
        "enabled": enabled,
        "allowed_macs": allowed,
        "title": title,
        "message": message,
    }


async def enable(title: str, message: str) -> None:
    """Enable the captive portal by setting up Nginx and iptables redirect."""
    # Build portal HTML
    html = _PORTAL_HTML_TEMPLATE.format(title=title, message=message)
    # Escape single quotes for use inside nginx return directive
    html_escaped = html.replace("'", "\\'").replace("\n", "")

    nginx_conf = _NGINX_CONF_TEMPLATE.format(port=PORTAL_PORT, html=html_escaped)

    await _write_file_as_root(PORTAL_CONF, nginx_conf)

    # Enable nginx site
    await _run(["sudo", "ln", "-sf", PORTAL_CONF, PORTAL_ENABLED], timeout=5.0)

    # Flush existing captive portal redirect rules (idempotent)
    await _run(
        ["sudo", "iptables", "-t", "nat", "-D", "PREROUTING",
         "-i", "wlan0", "-p", "tcp", "--dport", "80",
         "-j", "DNAT", "--to-destination", f"{AP_IP}:{PORTAL_PORT}"],
        timeout=5.0,
    )

    # Add redirect: all HTTP from AP clients → portal, except already-allowed MACs
    code, _, err = await _run(
        ["sudo", "iptables", "-t", "nat", "-A", "PREROUTING",
         "-i", "wlan0", "-p", "tcp", "--dport", "80",
         "-j", "DNAT", "--to-destination", f"{AP_IP}:{PORTAL_PORT}"],
        timeout=5.0,
    )
    if code != 0:
        logger.warning("iptables DNAT rule failed: {}", err)

    # Restore ACCEPT rules for already-allowed MACs
    for mac in _read_allowed_file():
        await _add_iptables_accept(mac)

    code2, _, err2 = await _run(["sudo", "systemctl", "restart", "nginx"], timeout=15.0)
    if code2 != 0:
        logger.warning("nginx restart returned non-zero: {}", err2)

    logger.info("Captive portal enabled: title='{}' port={}", title, PORTAL_PORT)


async def disable() -> None:
    """Disable captive portal by removing iptables rules and nginx config."""
    # Remove iptables DNAT rule
    await _run(
        ["sudo", "iptables", "-t", "nat", "-D", "PREROUTING",
         "-i", "wlan0", "-p", "tcp", "--dport", "80",
         "-j", "DNAT", "--to-destination", f"{AP_IP}:{PORTAL_PORT}"],
        timeout=5.0,
    )

    # Remove MAC ACCEPT rules
    for mac in _read_allowed_file():
        await _run(
            ["sudo", "iptables", "-D", "FORWARD",
             "-m", "mac", "--mac-source", mac, "-j", "ACCEPT"],
            timeout=5.0,
        )

    # Remove nginx config
    await _run(["sudo", "rm", "-f", PORTAL_CONF, PORTAL_ENABLED], timeout=5.0)

    code, _, err = await _run(["sudo", "systemctl", "reload", "nginx"], timeout=15.0)
    if code != 0:
        logger.warning("nginx reload returned non-zero: {}", err)

    logger.info("Captive portal disabled")


async def _add_iptables_accept(mac: str) -> None:
    """Add an iptables ACCEPT rule for a MAC address to bypass the captive portal."""
    await _run(
        ["sudo", "iptables", "-I", "FORWARD", "1",
         "-m", "mac", "--mac-source", mac, "-j", "ACCEPT"],
        timeout=5.0,
    )


async def accept_device(mac: str) -> None:
    """Allow a device past the captive portal by MAC address."""
    mac = mac.lower().strip()
    if not mac:
        raise ValueError("MAC address is required")

    allowed = _read_allowed_file()
    if mac not in allowed:
        allowed.append(mac)
        content = "\n".join(allowed) + "\n"
        await _write_file_as_root(ALLOWED_FILE, content)

    await _add_iptables_accept(mac)
    logger.info("Captive portal: accepted device MAC={}", mac)


async def get_allowed_devices() -> list[str]:
    """Return the list of allowed MAC addresses."""
    return _read_allowed_file()


async def clear_allowed_devices() -> None:
    """Remove all allowed MAC entries and their iptables rules."""
    for mac in _read_allowed_file():
        await _run(
            ["sudo", "iptables", "-D", "FORWARD",
             "-m", "mac", "--mac-source", mac, "-j", "ACCEPT"],
            timeout=5.0,
        )
    await _write_file_as_root(ALLOWED_FILE, "")
    logger.info("Captive portal: cleared all allowed devices")
