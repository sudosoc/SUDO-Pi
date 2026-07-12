from __future__ import annotations

import re
import tempfile
from datetime import datetime
from pathlib import Path

from loguru import logger

CERT_PATH = Path("/etc/sudo-pi/certs/server.crt")
KEY_PATH = Path("/etc/sudo-pi/certs/server.key")
NGINX_RELOAD_CMD = ["sudo", "nginx", "-s", "reload"]


from app.core.subprocess import run_cmd

async def _run(cmd: list[str], timeout: float = 30.0) -> tuple[int, str]:
    code, out, _ = await run_cmd(cmd, timeout=timeout, merge_stderr=True)
    return code, out.strip()


def _parse_date(date_str: str) -> datetime | None:
    """Parse openssl date strings like 'Jan  1 00:00:00 2025 GMT'."""
    for fmt in ("%b %d %H:%M:%S %Y %Z", "%b  %d %H:%M:%S %Y %Z"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


async def get_cert_info() -> dict:
    """Read current TLS certificate metadata."""
    if not CERT_PATH.exists():
        return {
            "exists": False,
            "subject": None,
            "issuer": None,
            "not_before": None,
            "not_after": None,
            "days_remaining": None,
            "sans": [],
            "serial": None,
            "fingerprint_sha256": None,
        }

    rc, out = await _run([
        "openssl", "x509",
        "-in", str(CERT_PATH),
        "-noout",
        "-subject", "-issuer",
        "-dates", "-serial",
        "-fingerprint", "-sha256",
        "-ext", "subjectAltName",
    ])

    info: dict = {"exists": True, "sans": []}

    if rc != 0:
        info["error"] = out
        return info

    for line in out.splitlines():
        if line.startswith("subject="):
            info["subject"] = line.split("=", 1)[1].strip()
        elif line.startswith("issuer="):
            info["issuer"] = line.split("=", 1)[1].strip()
        elif line.startswith("notBefore="):
            raw = line.split("=", 1)[1].strip()
            dt = _parse_date(raw)
            info["not_before"] = dt.isoformat() if dt else raw
        elif line.startswith("notAfter="):
            raw = line.split("=", 1)[1].strip()
            dt = _parse_date(raw)
            info["not_after"] = dt.isoformat() if dt else raw
            if dt:
                delta = dt - datetime.utcnow()
                info["days_remaining"] = delta.days
        elif line.startswith("serial="):
            info["serial"] = line.split("=", 1)[1].strip()
        elif "Fingerprint=" in line or "fingerprint" in line.lower():
            # e.g. "SHA256 Fingerprint=AA:BB:CC:..."
            parts = line.split("=", 1)
            if len(parts) == 2:
                info["fingerprint_sha256"] = parts[1].strip()
        elif "DNS:" in line or "IP:" in line:
            sans = re.findall(r"(?:DNS|IP):[^\s,]+", line)
            info["sans"].extend(s.strip() for s in sans)

    return info


async def generate_self_signed(
    days: int = 365,
    cn: str = "sudo-pi.local",
    san_hosts: list[str] | None = None,
) -> dict:
    """Generate a new self-signed certificate and reload nginx."""
    hosts = san_hosts or ["sudo-pi.local", "sudo.local", "localhost", "192.168.4.1"]
    san_str = ",".join(f"DNS:{h}" if not h[0].isdigit() else f"IP:{h}" for h in hosts)

    CERT_PATH.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_cert = Path(tmpdir) / "cert.pem"
        tmp_key = Path(tmpdir) / "key.pem"
        ext_file = Path(tmpdir) / "ext.cnf"

        ext_file.write_text(
            "[req]\n"
            "distinguished_name = req_distinguished_name\n"
            "x509_extensions = v3_req\n"
            "prompt = no\n"
            "[req_distinguished_name]\n"
            f"CN = {cn}\n"
            "O = SUDO-Pi Dashboard\n"
            "[v3_req]\n"
            "keyUsage = digitalSignature, keyEncipherment\n"
            "extendedKeyUsage = serverAuth\n"
            "basicConstraints = CA:FALSE\n"
            f"subjectAltName = {san_str}\n"
        )

        rc, out = await _run([
            "openssl", "req",
            "-x509", "-newkey", "rsa:2048",
            "-keyout", str(tmp_key),
            "-out", str(tmp_cert),
            "-days", str(days),
            "-nodes",
            "-config", str(ext_file),
        ], timeout=60.0)

        if rc != 0:
            raise RuntimeError(f"openssl failed: {out}")

        # Atomically replace the live cert + key
        rc2, _ = await _run(["sudo", "cp", str(tmp_cert), str(CERT_PATH)])
        rc3, _ = await _run(["sudo", "cp", str(tmp_key), str(KEY_PATH)])
        await _run(["sudo", "chmod", "600", str(KEY_PATH)])
        await _run(["sudo", "chmod", "644", str(CERT_PATH)])

        if rc2 != 0 or rc3 != 0:
            raise RuntimeError("Failed to copy certificate files (check sudo permissions)")

    # Test config before reloading
    rc_test, _ = await _run(["sudo", "nginx", "-t"])
    if rc_test == 0:
        await _run(NGINX_RELOAD_CMD)

    logger.info("Self-signed TLS cert generated for CN={} ({} days)", cn, days)
    return await get_cert_info()


async def upload_cert(cert_pem: str, key_pem: str) -> dict:
    """Replace the TLS certificate with admin-supplied PEM data."""
    # Validate both before touching the live files
    with tempfile.NamedTemporaryFile(suffix=".pem", delete=False) as tmp_cert:
        tmp_cert.write(cert_pem.encode())
        tmp_cert_path = tmp_cert.name

    with tempfile.NamedTemporaryFile(suffix=".key", delete=False) as tmp_key:
        tmp_key.write(key_pem.encode())
        tmp_key_path = tmp_key.name

    try:
        # Verify cert is parseable
        rc, out = await _run(["openssl", "x509", "-in", tmp_cert_path, "-noout"])
        if rc != 0:
            raise ValueError(f"Invalid certificate PEM: {out}")

        # Verify key matches the cert
        rc, cert_mod = await _run(["openssl", "x509", "-noout", "-modulus", "-in", tmp_cert_path])
        rc2, key_mod = await _run(["openssl", "rsa", "-noout", "-modulus", "-in", tmp_key_path])
        if rc != 0 or rc2 != 0 or cert_mod != key_mod:
            raise ValueError("Certificate and private key do not match")

        CERT_PATH.parent.mkdir(parents=True, exist_ok=True)
        await _run(["sudo", "cp", tmp_cert_path, str(CERT_PATH)])
        await _run(["sudo", "cp", tmp_key_path, str(KEY_PATH)])
        await _run(["sudo", "chmod", "600", str(KEY_PATH)])
        await _run(["sudo", "chmod", "644", str(CERT_PATH)])
    finally:
        Path(tmp_cert_path).unlink(missing_ok=True)
        Path(tmp_key_path).unlink(missing_ok=True)

    rc_test, test_out = await _run(["sudo", "nginx", "-t"])
    if rc_test != 0:
        raise RuntimeError(f"nginx config test failed after cert upload: {test_out}")
    await _run(NGINX_RELOAD_CMD)

    logger.info("TLS certificate uploaded and nginx reloaded")
    return await get_cert_info()


async def check_certbot() -> dict:
    """Check whether certbot is available and return version."""
    rc, out = await _run(["certbot", "--version"])
    if rc == 0:
        return {"available": True, "version": out.strip()}
    return {"available": False, "version": None}


async def request_letsencrypt(domain: str, email: str) -> dict:
    """Run certbot to obtain a Let's Encrypt certificate.

    Uses --nginx plugin and --non-interactive mode.
    nginx must already be serving HTTP on port 80 for the ACME challenge.
    """
    if not re.match(r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", domain):
        raise ValueError(f"Invalid domain: {domain!r}")

    rc, out = await _run([
        "sudo", "certbot", "--nginx",
        "-d", domain,
        "--email", email,
        "--agree-tos",
        "--non-interactive",
        "--redirect",
    ], timeout=120.0)

    if rc != 0:
        raise RuntimeError(f"certbot failed:\n{out}")

    logger.info("Let's Encrypt certificate obtained for {}", domain)
    return {"success": True, "output": out}
