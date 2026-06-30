# Changelog

All notable changes to SUDO-Pi are documented here.

## [1.0.0] — 2026-07-01

### Added

#### Core Infrastructure
- Python 3.12 + FastAPI backend with async SQLAlchemy + aiosqlite (WAL mode)
- JWT authentication in HTTP-only cookies (access 15 min + refresh 7 days with rotation)
- CSRF double-submit cookie protection for all non-GET requests
- RBAC: Admin, Operator, Viewer roles with per-endpoint enforcement
- Account lockout after 5 failed login attempts (15-minute cooldown)
- Rate limiting: 5/min login, 200/min general (slowapi)
- Structured audit log (loguru) consumed by Fail2Ban
- Repository pattern with typed generic BaseRepository[T]
- Room-based WebSocket manager with subscribe/broadcast primitives
- Refresh token revocation (JTI stored in DB, rotated on each use)

#### System Monitor
- Real-time CPU, memory, disk, temperature metrics via psutil
- Temperature via vcgencmd (Pi-native), psutil sensors, thermal sysfs — fallback chain
- Process table (top 25 by CPU)
- Service status and control for whitelisted systemd services
- Journal log viewer (journalctl --output=json)
- Hostname and timezone configuration (hostnamectl / timedatectl)

#### Terminal
- Browser-based PTY via ptyprocess + WebSocket + xterm.js
- Multiple tabs with independent sessions
- Resize (cols/rows) forwarded to PTY via TIOCSWINSZ
- Session limit: 8 per user
- Operator/Admin only

#### File Manager
- Directory listing with file metadata
- Upload (multipart), download (direct file response)
- Create, rename, move, copy, delete (files and directories)
- Inline text editor
- Compress (tar.gz, zip) and extract
- chmod with optional recursive
- Path security: blocks /proc, /sys, /dev, /etc/shadow

#### Network Manager
- **wlan0 (AP)**: hostapd + dnsmasq management, SSID/password/channel config, connected clients via DHCP leases + iw station dump fallback
- **wlan1 (internet)**: nmcli-based scan, connect, disconnect, saved profiles, priorities, signal strength
- Signal to percentage conversion (dBm → 0–100%)

#### Package Manager
- List installed packages (dpkg-query)
- Search apt-cache
- Install, remove, upgrade-all
- Admin-only for write operations

#### Docker Manager
- List containers (all states) and images
- Start, stop, restart containers
- Delete containers and images
- Auto-refresh every 10 seconds

#### Bluetooth Manager
- List paired devices with connection status and RSSI
- 10-second discovery scan
- Pair, connect, disconnect, remove

#### GPIO Manager
- Full 40-pin header visualization
- Set mode (INPUT/OUTPUT), read input value, write output value
- PWM control (frequency + duty cycle)
- 2-second auto-refresh for input pins

#### Security Dashboard
- Fail2Ban jail status, banned IP list with one-click unban
- Active refresh token sessions with per-session revoke and revoke-all
- iptables firewall rules viewer
- Audit log table (filterable, paginated)

#### Users
- Full CRUD for user accounts
- Role assignment (Admin only)
- Last login time and IP tracking
- Enable/disable accounts

#### Settings
- Hostname and timezone configuration
- Password change with current-password verification
- System backup download (tar.gz)
- Reboot and shutdown

#### Frontend
- React 18 + TypeScript + Vite 6
- Tailwind CSS v3 dark theme with CSS custom properties (HSL)
- shadcn/ui component pattern
- Zustand global state (auth, system metrics, notifications)
- TanStack Query with 30s stale time and auto-retry (not on 401/403/404)
- Axios with automatic JWT refresh on 401 (queue + retry pattern)
- Apache ECharts — gauge charts, sparklines, time-series
- xterm.js with FitAddon + WebLinksAddon
- Reconnecting WebSocket with exponential backoff and heartbeat
- Lazy-loaded routes (code splitting per page)
- Role-based route guards (AdminRoute, ProtectedRoute)

#### Infrastructure
- Nginx HTTPS reverse proxy with WebSocket upgrade and SPA fallback
- hostapd + dnsmasq for AP mode on wlan0
- NetworkManager configured to leave wlan0 unmanaged
- IP forwarding + iptables NAT for AP client internet access
- systemd service units with security hardening (ProtectSystem, NoNewPrivileges, etc.)
- Fail2Ban configuration for login brute-force protection
- Automated idempotent installer (`scripts/setup.sh`) with rollback on failure
- Self-signed TLS certificate generation (4096-bit RSA, 10-year)
