<div align="center">

# SUDO-Pi

### The complete headless control center for Raspberry Pi

Manage every aspect of your Raspberry Pi from any browser on your local network —  
no monitor, keyboard, HDMI, or SSH required.

[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%205-C51A4A?logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com/)
[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20TS-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-production%20ready-success.svg)]()

</div>

---

## What is SUDO-Pi?

SUDO-Pi turns a headless Raspberry Pi into a self-contained server appliance. It runs the Pi's built-in Wi-Fi as an always-on access point and serves a secure HTTPS dashboard to any device that joins the network.

It works **entirely offline** — the moment your phone or laptop connects to `SUDO-Pi`, you have full control, whether or not the Pi has upstream internet.

```
   Your phone / laptop  ──Wi-Fi──▶  SUDO-Pi Access Point (192.168.4.1)
                                         │
                                         ▼
                           nginx (TLS) ──▶ FastAPI ──▶ Raspberry Pi OS
                                         │
                             React dashboard (this project)
```

---

## Quick start

```bash
git clone https://github.com/sudosoc/SUDO-Pi.git
cd SUDO-Pi
sudo bash install.sh
```

The installer is fully automated and idempotent. When it finishes:

1. Connect to the **`SUDO-Pi`** Wi-Fi (default password: `sudopi2024`).
2. Open **https://sudo.local** or **https://192.168.4.1**.
3. Log in with `admin` / `admin` — **change the password immediately**.

> The certificate is self-signed for LAN use. Your browser will show a one-time security warning — click "proceed" and it will not appear again.

---

## Feature highlights

### Monitoring

| Feature | Details |
|---|---|
| Live system metrics | CPU, RAM, disk, temperature — WebSocket push every 2 s |
| System health score | 0–100 composite score with anomaly detection |
| Process manager | Kill, renice processes; filter by name/CPU/RAM |
| Journal log viewer | System logs + boot logs with unit filter and live search |
| Historical charts | SVG sparklines and full metric graphs with selectable time range |
| Alerts | Custom rules (CPU > 80 %, disk > 90 %, service down, …) |
| Automations | Trigger shell commands or service restarts from alert conditions |
| Timeline | Chronological feed of every system event |
| Diagnostics | Self-check: API health, filesystem, DNS, network reachability |
| Uptime tracking | Per-service uptime history across reboots |

### Network

| Feature | Details |
|---|---|
| Dual Wi-Fi | Built-in AP + upstream client (ethernet / USB Wi-Fi / tether) |
| Internet sharing | Automatic NAT masquerade — switches sources without manual config |
| Device manager | All AP clients + ARP table; click any row to open the device inspector |
| Device inspector | Ping, port scan, SSH, Wake-on-LAN, watchlist star — all from the drawer |
| Per-device policies | Speed limits (tc), full internet block, daily curfews — by MAC |
| Device watchlist | Star devices; get a notification when they go offline or come back |
| Ad blocker | Pi-hole–style DNS blocklist management (dnsmasq) |
| DNS & DHCP | Custom DNS records, static leases, upstream servers |
| Port forwards | NAT port-forward rules via iptables |
| Traffic monitor | Per-interface and per-device real-time bandwidth graphs |
| Network scanner | arp-scan / nmap sweep of any subnet with OS detection |
| Network topology | Live visual map of all connected devices |
| VPN | WireGuard server management + client config generation |
| Captive portal | Redirect new clients to a splash page before allowing internet |
| Reverse proxy | Nginx proxy-pass rules with domain mapping |
| Speed test | Run Speedtest-CLI or iperf3 from the dashboard |
| Wake-on-LAN | Send WOL magic packets to any device by MAC |

### Apps & Containers

| Feature | Details |
|---|---|
| Docker hub | Container list with live stats, start/stop/restart/remove, log stream |
| Docker Compose | Stack editor and manager — edit YAML, deploy, watch logs |
| App Store | **58 one-click apps** across 11 categories (see below) |
| Services hub | Quick-launch panel for all installed web apps |

**App Store categories:** Storage · Media · Network · Development · AI · Productivity · Communication · Monitoring · IoT · Security · Games

Selected highlights: Nextcloud, Jellyfin, Plex, Navidrome, Pi-hole, AdGuard Home, Nginx Proxy Manager, WireGuard Easy, Gitea, VS Code Server, Prometheus, Ollama, Open WebUI, LocalAI, BookStack, Vikunja, Ntfy, Matrix Synapse, Netdata, Scrutiny, Home Assistant, Zigbee2MQTT, Minecraft, Valheim, and 34 more.

### Hardware

| Feature | Details |
|---|---|
| Storage | Partition table, disk usage, SMART health for all drives |
| GPIO | Interactive 40-pin pinout — read input, write output, set PWM |
| Bluetooth | Scan, pair, connect, disconnect BLE/classic devices |
| Display | HDMI hotplug, resolution, rotation, brightness control |
| UPS Monitor | APC/NUT UPS status, battery %, runtime estimate |
| Remote Desktop | Full Pi GUI in the browser — TigerVNC + noVNC + websockify |

### Tools

| Feature | Details |
|---|---|
| Web Terminal | Full PTY terminal in the browser (xterm.js + WebSocket) |
| File Manager | Browse, upload, download, rename, delete, set permissions |
| Package Manager | APT install / remove / upgrade with changelog preview |
| Cron Jobs | Visual cron editor with last-run status and output log |
| SSH Manager | View, add, and remove authorized SSH keys per user |
| System Snapshots | Create, restore, and compare system configuration snapshots |
| Script Runner | Store and execute shell scripts on demand or on a schedule |

### Security

| Feature | Details |
|---|---|
| Security hub | Overview, audit log, firewall rules in one hub |
| TLS certificates | Certificate status, expiry, and renewal control |
| Firewall | iptables rule management with live rule set view |
| Audit log | Every user action logged with timestamp, IP, and result |
| Fail2Ban | SSH and HTTP auth brute-force protection |
| Intrusion detection | Automatic alert on repeated auth failures and port scans |

### Administration

| Feature | Details |
|---|---|
| Users | App users (RBAC: Admin / Operator / Viewer) + Pi OS users |
| Maintenance | OS updates, encrypted backups, rclone cloud sync, system settings |
| Theme | Light / dark / system, 6 accent colors, compact / comfortable density |

### Power-user features

| Feature | Shortcut |
|---|---|
| Vim command bar | `:` — `go`, `reboot`, `shutdown`, `restart <svc>`, `stop`, `start`, … |
| Command palette | `⌘K` / `Ctrl+K` — instant fuzzy search across all pages and actions |
| Split view | `Ctrl+\` — side-by-side two-panel layout, each with independent pages |
| Focus mode | `F` — collapse sidebar + header for distraction-free monitoring |
| Zen mode | `Z` — full-screen, header only, true focus |
| Nav history | `Alt+←` / `Alt+→` — browser-style back/forward between pages |
| Quick notes | `N` — sticky note per page, persisted in localStorage |
| Right-click menu | Context-aware actions: ping IP, scan port, kill process, stop container, copy log line, … |
| Tab badges | Live count badges on Docker / Alerts / Services tabs |
| Live stats popup | Click the WebSocket dot to see latency, CPU, memory, and uptime |
| CPU heatmap | Sidebar sparkline heatmap of all cores over 60 seconds |
| Device watchlist | Star devices in the inspector — desktop notification when they change state |
| Sidebar pins | Pin any page to the sidebar top |

---

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, TanStack Query v5, Zustand, React Router v6 |
| **UI** | Radix UI primitives, Lucide icons, xterm.js, noVNC, custom design system |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Pydantic v2, Uvicorn, Loguru |
| **Database** | SQLite (aiosqlite) with Alembic migrations and auto-create fallback |
| **Web server** | nginx — TLS termination, WebSocket proxy, SPA fallback, gzip |
| **Network stack** | hostapd, dnsmasq, iptables, tc, Avahi (mDNS), NetworkManager |
| **Security** | JWT (httpOnly cookies), CSRF tokens, rate limiting (slowapi), Fail2Ban, RBAC, audit log |

---

## Requirements

- Raspberry Pi 5 **or** Pi 4 / Pi 3B+ (ARM64 / ARMv7, Debian-based OS)
- Raspberry Pi OS Bookworm (recommended) or any Debian 12 derivative
- Built-in Wi-Fi for the access point
- Optional: a second interface (ethernet or USB Wi-Fi adapter) for internet sharing
- **Internet connection during installation only** — the dashboard itself is fully offline

---

## Navigation model

The dashboard uses a three-tier layout:

```
Sidebar          →  TabBar           →  Hub internal tabs
(section groups)    (pages in group)    (sub-tabs within a hub page)

e.g. Monitor    →  System           →  Overview | Metrics | Processes | Logs
     Network    →  Network          →  Overview | Devices | Traffic | Scanner
     Apps       →  Docker           →  Containers | Compose
     Admin      →  Security         →  Overview | Audit Log | Firewall
```

All legacy single-page URLs (e.g. `/metrics`, `/devices`, `/dns`) redirect automatically to the correct hub tab, so existing bookmarks never break.

---

## Default configuration

| Setting | Default | Where to change |
|---|---|---|
| Dashboard URL | `https://sudo.local` · `https://192.168.4.1` | — |
| Wi-Fi SSID | `SUDO-Pi` | Network → Overview |
| Wi-Fi password | `sudopi2024` | Network → Overview |
| Admin login | `admin` / `admin` | Admin → Users |
| AP subnet | `192.168.4.0/24` | `backend/.env` |

All runtime secrets live in `/opt/sudo-pi/backend/.env` (generated on install, never committed to git).

---

## Updating

**From the dashboard:** Admin → Maintenance → Updates → Check for updates.  
Pulls the latest release, rebuilds the frontend, runs migrations, and restarts services with a live progress log.

**From the terminal:**

```bash
cd SUDO-Pi
sudo bash update.sh
```

---

## Uninstalling

```bash
sudo bash uninstall.sh           # remove SUDO-Pi, restore the system
sudo bash uninstall.sh --purge   # also delete the database and /etc/sudo-pi
sudo bash uninstall.sh --yes     # skip the confirmation prompt
```

Stops all services, unwinds all network rules (NAT, traffic shaping, captive portal, iptables chains), restores original network daemons, and removes the service user. The git checkout is left untouched.

---

## Project structure

```
SUDO-Pi/
├── install.sh                  # one-command automated installer
├── update.sh                   # updater (wired to the dashboard)
├── uninstall.sh                # full removal + system restore
│
├── backend/
│   ├── app/
│   │   ├── api/v1/             # 50+ REST + WebSocket routers
│   │   ├── services/           # business logic (system, network, docker, …)
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request / response schemas
│   │   ├── core/               # config, security, auth, database
│   │   └── main.py             # FastAPI app entrypoint
│   ├── migrations/             # Alembic migration scripts
│   ├── tests/                  # pytest test suite
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   └── src/
│       ├── pages/              # hub pages + individual page components
│       │   ├── monitor/        # System hub, Timeline, Alerts, Automations, Diagnostics
│       │   ├── network/        # Network hub, Config, Remote Access, Topology, …
│       │   ├── containers/     # Docker hub, App Store, Services
│       │   ├── hardware/       # Storage hub, GPIO, Bluetooth, Display, UPS, Remote Desktop
│       │   ├── tools/          # Terminal, Files, Packages, Cron, SSH, Snapshots
│       │   └── admin/          # Security hub, Users hub, Maintenance, TLS, Account
│       ├── components/
│       │   ├── layout/         # MainLayout, Sidebar, TabBar, Header, SplitPane, ContextMenu, …
│       │   ├── dashboard/      # Dashboard widgets
│       │   └── ui/             # Shared UI primitives (Button, Card, Dialog, …)
│       ├── stores/             # Zustand stores (auth, split, watchlist, notifications, …)
│       ├── api/                # Typed API client
│       ├── hooks/              # Custom React hooks
│       └── lib/                # navGroups, utils, themes
│
├── configs/
│   ├── nginx/sudo-pi.conf      # nginx TLS + WebSocket + SPA config
│   ├── hostapd/hostapd.conf    # Wi-Fi access point
│   ├── dnsmasq/dnsmasq.conf    # DHCP + DNS
│   ├── systemd/                # systemd service units
│   └── networkmanager/         # NetworkManager hooks
│
└── scripts/
    └── internet-sharing.sh     # iptables NAT helper
```

---

## Documentation

| Document | Contents |
|---|---|
| [INSTALL.md](INSTALL.md) | Detailed installation, manual steps, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, design decisions, data flow |
| [API.md](API.md) | Full REST + WebSocket API reference |
| [SECURITY.md](SECURITY.md) | Threat model, hardening checklist, disclosure policy |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Security

SUDO-Pi is built defense-first:

- TLS everywhere (nginx self-signed cert, HSTS)
- JWT tokens in httpOnly + Secure cookies (never accessible from JS)
- CSRF tokens on every mutating request
- Role-based access control (Admin / Operator / Viewer)
- Step-up re-authentication for sensitive OS actions
- Rate limiting on auth and API endpoints (slowapi)
- Fail2Ban on the nginx auth log
- Complete audit log (who did what, from which IP, when)
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy

Found a vulnerability? Report it privately to **ceo@sudosoc.com** — do not open a public issue.

---

## Author

**Seif — SUDOSOC**

- Portfolio: [seif.sudosoc.com](https://seif.sudosoc.com)
- Email: [ceo@sudosoc.com](mailto:ceo@sudosoc.com)
- GitHub: [@sudosoc](https://github.com/sudosoc)

---

## License

Released under the [MIT License](LICENSE). © SUDOSOC.
