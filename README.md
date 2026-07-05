<div align="center">

# SUDO-Pi

### The complete headless control center for Raspberry Pi

Manage every aspect of your Raspberry Pi from any browser on your local network — no monitor, keyboard, HDMI, or SSH required. From live system metrics and a full graphical remote desktop to per-device bandwidth control and one-click app deployment, SUDO-Pi turns a headless Pi into a self-contained, self-hosted server appliance.

[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%205-C51A4A?logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com/)
[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20TS-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-production%20ready-success.svg)]()

</div>

---

## Overview

SUDO-Pi runs the Pi's built-in Wi-Fi as an always-on access point and serves a secure, HTTPS dashboard to any device that joins it. It is designed for the field: it works **entirely offline** — the moment your phone or laptop connects to the `SUDO-Pi` network, you have full control, whether or not the Pi has upstream internet.

The dashboard is a single-page application backed by an async FastAPI service. Everything is driven through a hardened REST + WebSocket API with role-based access control, CSRF protection, an audit trail, and Fail2Ban integration.

```
   Your phone / laptop  ──Wi-Fi──▶  SUDO-Pi Access Point (192.168.4.1)
                                        │
                                        ▼
                          nginx (TLS) ──▶ FastAPI ──▶ Raspberry Pi OS
                                        │
                            React dashboard (this project)
```

---

## Feature highlights

<table>
<tr><td valign="top" width="50%">

**Monitoring & Diagnostics**
- Live CPU / RAM / disk / temperature gauges (WebSocket, 3 s)
- System health score, anomaly detection, activity feed
- Process manager, systemd services, journal log viewer
- Historical metrics with pure-SVG charts
- Uptime tracking, alert rules, self-diagnostics

**Network**
- Dual Wi-Fi: built-in AP + upstream client
- **Automatic internet sharing** — NATs through whichever
  interface has internet (ethernet / USB Wi-Fi / tether)
- Per-device traffic monitor, ad-blocker, port scanner
- Captive portal, VPN (WireGuard / OpenVPN), firewall
- Local DNS records, DHCP static leases, speed test

**Device Control (Parental Controls)**
- Per-device download / upload speed limits (tc)
- Full internet block by MAC
- Daily internet curfews (e.g. 22:00–06:00)

</td><td valign="top" width="50%">

**Apps & Containers**
- Docker container + image management, live log streaming
- Docker Compose stack editor
- One-click App Store (Nextcloud, Jellyfin, Pi-hole, …)
- Services hub — launch installed web apps in one place

**Remote Access**
- **Remote Desktop** — full GUI in the browser over the LAN
  (TigerVNC + noVNC + websockify), zero internet required
- Browser terminal (full PTY, xterm.js) + quick-command drawer
- File manager: upload, edit, compress, permissions

**Hardware & System**
- GPIO pinout with read/write + PWM
- Bluetooth, storage/USB, HDMI display control
- Package manager, cron jobs, SSH key management
- Scheduled OS updates with rollback
- Encrypted backups + rclone cloud sync

**Administration**
- RBAC: Admin / Operator / Viewer
- Linux (Pi OS) user management with file ACLs
- Security center: Fail2Ban, firewall, audit log
- Light / dark / system theme, 6 accent colors, density
- Command palette (⌘K), one-click software updates

</td></tr>
</table>

---

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, TanStack Query, Zustand, xterm.js, noVNC |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy (async), Pydantic, Uvicorn, Loguru |
| **Database** | SQLite (async, aiosqlite) with Alembic migrations |
| **Web server** | nginx (TLS termination, reverse proxy, WebSocket) |
| **Network** | hostapd, dnsmasq, iptables, tc, Avahi (mDNS) |
| **Security** | JWT (httpOnly cookies), CSRF tokens, Fail2Ban, RBAC, audit logging |

---

## Requirements

- Raspberry Pi 5 (or any Debian-based ARM64 board)
- Raspberry Pi OS / Kali Linux ARM64 (Debian-based)
- Built-in Wi-Fi (used as the access point)
- Optional: a second interface (ethernet or USB Wi-Fi) to share internet with clients
- Internet connection **during installation only**

---

## Quick start

```bash
git clone https://github.com/sudosoc/SUDO-Pi.git
cd SUDO-Pi
sudo bash install.sh
```

The installer is fully automated and idempotent — it installs every dependency, builds the app, configures the access point, TLS, and all services, then starts everything.

When it finishes:

1. Connect to the **`SUDO-Pi`** Wi-Fi network (default password: `sudopi2024`).
2. Open **https://sudo.local** or **https://192.168.4.1**.
3. Log in with `admin` / `admin` and **change the password immediately**.

> The certificate is self-signed for LAN use, so your browser will show a one-time security warning — this is expected.

---

## Updating

**From the dashboard** (recommended): go to **Settings → Software Update → Check for updates**. It pulls the latest release, rebuilds, migrates the database, and restarts services while showing a live progress log.

**From the terminal:**

```bash
cd SUDO-Pi
sudo bash update.sh
```

---

## Uninstalling

```bash
sudo bash uninstall.sh          # remove SUDO-Pi and restore the system
sudo bash uninstall.sh --purge  # also delete the database and config data
```

This stops and removes every service, unwinds all network rules (NAT, traffic shaping, captive portal), restores the original network daemons and hostname, and removes the service user. Your git checkout is left untouched.

---

## Default configuration

| Setting | Default | Change in |
|---|---|---|
| Dashboard URL | `https://sudo.local` · `https://192.168.4.1` | — |
| Wi-Fi SSID | `SUDO-Pi` | Network page |
| Wi-Fi password | `sudopi2024` | Network page |
| Admin login | `admin` / `admin` | Settings / Users |
| AP subnet | `192.168.4.0/24` | `backend/.env` |

All runtime secrets live in `backend/.env` (generated on install, never committed).

---

## Project structure

```
SUDO-Pi/
├── install.sh            # one-command installer
├── update.sh             # updater (also wired to the dashboard)
├── uninstall.sh          # full removal + system restore
├── backend/              # FastAPI application
│   └── app/
│       ├── api/v1/        # REST + WebSocket routers
│       ├── services/      # business logic (system, network, docker, …)
│       ├── models/        # SQLAlchemy models
│       ├── core/          # config, security, auth, database
│       └── main.py        # app entrypoint
├── frontend/             # React + TypeScript SPA
│   └── src/
│       ├── pages/         # one component per dashboard section
│       ├── components/    # UI primitives + layout
│       └── api/           # typed API client
├── configs/              # nginx, hostapd, dnsmasq, systemd units
└── scripts/              # internet-sharing helper
```

---

## Documentation

| Document | Contents |
|---|---|
| [INSTALL.md](INSTALL.md) | Detailed installation, manual steps, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, directory layout, design decisions |
| [API.md](API.md) | Full REST + WebSocket API reference |
| [SECURITY.md](SECURITY.md) | Threat model, hardening checklist, disclosure policy |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Security

SUDO-Pi is built defense-first: TLS everywhere, JWT in httpOnly cookies, CSRF tokens on every mutating request, role-based access control, step-up re-authentication for sensitive OS actions, Fail2Ban on the auth endpoint, and a complete audit log. See [SECURITY.md](SECURITY.md) for the full threat model and hardening checklist.

Found a vulnerability? Please report it privately to **ceo@sudosoc.com** rather than opening a public issue.

---

## Author

**Seif — SUDOSOC**

- Portfolio: [seif.sudosoc.com](https://seif.sudosoc.com)
- Email: [ceo@sudosoc.com](mailto:ceo@sudosoc.com)

---

## License

Released under the [MIT License](LICENSE). © SUDOSOC.
