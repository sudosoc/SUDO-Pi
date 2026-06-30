# Security

## Threat Model

SUDO-Pi is a local-network management interface. It is designed for use on a private Wi-Fi AP (192.168.4.0/24) and is never intended to be exposed directly to the internet.

**In-scope threats:**
- Unauthorized access from other devices connected to the AP
- Session hijacking via cookie theft
- CSRF attacks from malicious web pages
- Brute-force login attacks
- Command injection through terminal or file manager
- Path traversal in the file manager
- Privilege escalation from Viewer to Operator/Admin

**Out-of-scope threats:**
- Physical access to the device (out of scope for a software dashboard)
- Internet-facing exposure (do not NAT port 443 externally)

## Security Controls

### Authentication
- **JWT in HTTP-only cookies** — access token cannot be read by JavaScript
- **Short-lived access tokens** — 15-minute TTL limits exposure window
- **Refresh token rotation** — old JTI is revoked on each rotation; replay is detected
- **Account lockout** — 5 failed login attempts → 15-minute lockout
- **bcrypt password hashing** — cost factor 12 (≈ 250 ms/hash on Pi 5)

### Authorization
- **RBAC** — Admin, Operator, Viewer roles
  - Admin: full access including user management and security dashboard
  - Operator: all features except user management and security dashboard; can open terminal
  - Viewer: read-only — no terminal, no file writes, no system actions
- Route-level guards on both backend (FastAPI dependencies) and frontend (React Router)

### Transport
- **HTTPS only** — nginx redirects all HTTP to HTTPS
- **TLS 1.2 / 1.3** — weak ciphers and older protocol versions disabled
- **HSTS** — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

### Session Management
- **CSRF double-submit** — server sets `csrf_token` non-httponly cookie; client echoes in `X-CSRF-Token` header; mismatch → 403
- **Refresh token revocation** — stored in DB with JTI; logout revokes immediately
- **Active session listing** — admins can revoke individual sessions from the Security dashboard

### Input Validation
- **All subprocess calls use list arguments** — never `shell=True` with user input
- **Service name whitelist** — `control_service()` checks against a fixed set of allowed service names
- **File path blocking** — `/proc`, `/sys`, `/dev`, `/etc/shadow`, `/etc/gshadow` are denied in FileService
- **Pydantic models** — all API inputs validated and typed before reaching service layer

### Rate Limiting
- Login endpoint: 5 requests/minute per IP (slowapi)
- General API: 200 requests/minute per IP

### Security Headers (nginx)
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### Intrusion Detection
- **Fail2Ban** — monitors `/var/log/sudo-pi/audit.log` for failed logins; bans source IP after 5 failures in 10 minutes for 15 minutes
- **Audit log** — every authentication event, file operation, system action, and API call is written to the structured audit log with timestamp, username, IP, action, resource, and status

### Network Isolation
- `wlan0` (AP) is controlled by hostapd + dnsmasq, not NetworkManager — it cannot accidentally connect to an external network as a client
- `wlan1` (internet) is never used as an AP
- AP clients are on a separate subnet (192.168.4.0/24); they reach the internet only via NAT through wlan1

## Hardening Checklist

- [ ] Change default admin password (Settings → Account → Change Password)
- [ ] Change default AP SSID and password (Network → Management Network)
- [ ] Set the country code for hostapd to your country (Network → Management Network → Advanced)
- [ ] Review the Fail2Ban ban time settings (Security → Fail2Ban)
- [ ] Rotate TLS certificate with a CA-signed cert if deploying broadly
- [ ] Audit user accounts and remove any unnecessary accounts (Users)
- [ ] Review active sessions periodically (Security → Sessions)
- [ ] Set up automated backups (Settings → System → Download Backup)

## Vulnerability Disclosure

If you discover a security vulnerability in SUDO-Pi, please report it by opening a GitHub issue marked **[SECURITY]**. Do not publicly disclose vulnerability details until a fix has been released.

## Known Limitations

- The self-signed TLS certificate will trigger browser warnings. Users must click through to proceed. For a production deployment, replace it with a certificate from Let's Encrypt or your own CA.
- The terminal grants shell access to anyone with the Operator or Admin role. Treat these roles as equivalent to SSH access.
- Audit logs are stored locally. If the device is compromised, logs may be tampered with. For high-security environments, forward logs to an external syslog server.
