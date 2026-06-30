# SUDO-Pi — Architecture Decisions

## Stack Rationale

### Backend: Python 3.12 + FastAPI

**Why FastAPI over Go/Rust:**
- Linux system administration APIs (psutil, subprocess, dbus-python, pybluez, RPi.GPIO) have mature Python bindings with no equivalent in Go/Rust for all required domains simultaneously.
- FastAPI provides async-first design, automatic OpenAPI generation, and Pydantic V2 validation with no boilerplate.
- Async SQLAlchemy + aiosqlite gives non-blocking DB access.
- The performance ceiling of FastAPI + uvicorn is more than sufficient for a single-device admin panel serving <100 concurrent users.

### Frontend: React 18 + TypeScript + Vite

- Vite provides sub-second HMR and optimized production builds.
- TypeScript enforces correctness at the API boundary layer.
- React 18 concurrent features (Suspense, transitions) improve perceived performance.

### UI: Tailwind CSS + shadcn/ui

- shadcn/ui provides accessible, unstyled-by-default components that are copied into the project (not a dependency), allowing full customization.
- Tailwind CSS utility classes eliminate CSS specificity conflicts.
- Dark theme via CSS variables with Tailwind's `dark:` variant.

### State Management: Zustand + TanStack Query

- Zustand for global UI state (auth, theme, notifications) — minimal boilerplate, no context provider tree.
- TanStack Query for server state (caching, refetching, optimistic updates).
- WebSocket state managed separately via custom hooks.

### Real-time: WebSockets (native FastAPI)

- FastAPI's native WebSocket support is sufficient; no Socket.IO overhead needed.
- Connection manager with room-based broadcasting for system metrics, logs, notifications.
- PTY terminal uses a dedicated WebSocket session per tab.

### Database: SQLite (async) → PostgreSQL upgrade path

- aiosqlite via SQLAlchemy async provides non-blocking I/O.
- Alembic handles schema migrations.
- Upgrade to PostgreSQL requires only changing the DATABASE_URL env var and removing aiosqlite dependency.

### Authentication: JWT + HTTP-only Cookies + CSRF

- Access token: 15-minute TTL, stored in HTTP-only `Secure` cookie.
- Refresh token: 7-day TTL, stored in HTTP-only `Secure` cookie, rotated on each use.
- CSRF: Double-submit cookie pattern — server sets a `csrf_token` non-HTTP-only cookie; client echoes it in `X-CSRF-Token` header.
- Refresh token revocation list stored in DB to support secure logout.

### Reverse Proxy: Nginx

- TLS termination at Nginx layer.
- WebSocket upgrade headers handled by Nginx.
- Static frontend assets served directly by Nginx (no Node.js in production).
- Backend proxied to `127.0.0.1:8000`.

### Network Architecture

```
wlan0 (built-in)  →  hostapd (AP mode)  →  192.168.4.1/24
                   →  dnsmasq (DHCP)     →  192.168.4.100-200
                   →  Nginx (HTTPS:443)  →  pi.local / 192.168.4.1

wlan1 (Alpha)     →  NetworkManager      →  internet client
                   →  NAT/masquerade     →  optional: share internet to AP clients
```

### Process Manager: systemd

- `sudo-pi-backend.service`: uvicorn with auto-restart.
- `sudo-pi-frontend.service`: only used during development; production serves static files via Nginx.
- `sudo-pi-hostapd.service`: hostapd for wlan0 AP.
- All services enabled at boot with `After=network.target`.

## Directory Structure

```
Pi-Center/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, DB, security, logging, dependencies
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── repositories/   # Data access layer (Repository Pattern)
│   │   ├── services/       # Business logic layer
│   │   ├── api/v1/         # FastAPI route handlers
│   │   └── websockets/     # WS connection manager + handlers
│   ├── requirements.txt
│   └── alembic/
├── frontend/
│   ├── src/
│   │   ├── api/            # Typed API client functions
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Page-level components
│   │   ├── stores/         # Zustand global state
│   │   ├── types/          # TypeScript type definitions
│   │   └── lib/            # Utilities (cn, formatters)
│   └── public/
├── configs/
│   ├── nginx/
│   ├── hostapd/
│   ├── dnsmasq/
│   ├── systemd/
│   └── networkmanager/
├── scripts/
│   └── setup.sh
└── docs/
```

## Security Architecture

1. **TLS**: Self-signed cert for LAN use (setup.sh generates via openssl); Let's Encrypt optional if domain exists.
2. **JWT**: RS256 algorithm with 2048-bit RSA key pair stored outside webroot.
3. **RBAC**: Roles — `admin` (full access), `operator` (read + limited write), `viewer` (read-only).
4. **Rate Limiting**: slowapi — 5 login attempts/minute per IP, 100 requests/minute general.
5. **Audit Logs**: Every state-changing API call is logged with user, IP, action, resource, timestamp.
6. **Command Sanitization**: All subprocess calls use list arguments (never shell=True with user input).
7. **Secure Headers**: X-Frame-Options, X-Content-Type-Options, HSTS, CSP via Nginx.
8. **Fail2Ban**: Configured to ban IPs after 5 failed login attempts in 10 minutes.
9. **CSRF**: Double-submit cookie for all POST/PUT/DELETE/PATCH endpoints.
10. **Input Validation**: Pydantic models validate all inputs at API boundary.

## Upgrade Paths

| Component | Current | Upgrade To |
|-----------|---------|-----------|
| Database | SQLite | PostgreSQL |
| Auth | Local DB | LDAP / PAM |
| Proxy | Nginx | Caddy (auto TLS) |
| Metrics | psutil | Prometheus + Grafana |
| Logs | SQLite | Elasticsearch |
