# API Reference

Base URL: `https://192.168.4.1/api/v1`

All endpoints (except `/auth/login`, `/auth/refresh`, `/health`) require a valid `access_token` HTTP-only cookie. Non-GET requests require an `X-CSRF-Token` header matching the `csrf_token` cookie value.

## Authentication

### POST /auth/login
Authenticate and receive session cookies.

**Request**
```json
{ "username": "admin", "password": "admin" }
```

**Response** — sets `access_token`, `refresh_token`, `csrf_token` cookies
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@pi.local",
    "role": "admin",
    "is_active": true,
    "last_login_at": "2026-01-01T12:00:00Z"
  }
}
```

**Errors**: `401` wrong credentials, `423` account locked

---

### POST /auth/logout
Revoke the current refresh token and clear all auth cookies.

---

### POST /auth/refresh
Rotate the refresh token and issue a new access token.

---

### POST /auth/change-password
Change the current user's password. Revokes all existing sessions.

**Request**
```json
{ "current_password": "admin", "new_password": "NewP@ssw0rd" }
```

---

## System

### GET /system/stats
Returns full system statistics snapshot.

**Response**
```json
{
  "cpu": { "percent": 12.5, "count": 4, "load_avg": [0.5, 0.4, 0.3], "freq_mhz": 2400.0 },
  "memory": { "total": 8589934592, "available": 6442450944, "percent": 25.0, "used": 2147483648 },
  "disk": [{ "mountpoint": "/", "total": 32000000000, "used": 8000000000, "free": 24000000000, "percent": 25.0, "fstype": "ext4" }],
  "temperature": { "cpu_celsius": 45.2, "source": "vcgencmd" },
  "network": [{ "interface": "wlan0", "bytes_sent": 1024, "bytes_recv": 2048, "packets_sent": 10, "packets_recv": 20, "is_up": true, "addresses": ["192.168.4.1"] }],
  "uptime_seconds": 86400,
  "boot_time": "2026-01-01T00:00:00Z",
  "hostname": "sudo-pi",
  "processes": [{ "pid": 1, "name": "systemd", "cpu_percent": 0.1, "memory_percent": 0.3, "status": "sleeping", "username": "root" }]
}
```

### GET /system/services
Returns status of whitelisted services.

### POST /system/services/{name}/{action}
Control a service. `action` must be one of: `start`, `stop`, `restart`, `reload`.

**Admin/Operator only.**

### GET /system/logs
Query: `?unit=nginx&lines=100`
Returns journal log entries as JSON array.

### POST /system/hostname
**Admin only.** `{ "hostname": "my-pi" }`

### POST /system/timezone
**Admin only.** `{ "timezone": "America/New_York" }`

### POST /system/reboot
**Admin only.** Initiates a reboot.

### POST /system/shutdown
**Admin only.** Initiates a shutdown.

### GET /system/backup
**Admin only.** Streams a `.tar.gz` backup archive.

---

## Network

### GET /network/ap/status
Returns AP status, SSID, channel, connected clients.

### GET /network/ap/clients
Returns list of connected AP clients with MAC, IP, hostname.

### PUT /network/ap/config
**Admin only.** Update AP configuration.

**Request**
```json
{ "ssid": "MyPi", "password": "SecurePass", "channel": 6, "country_code": "US", "hide_ssid": false, "max_clients": 10 }
```

### GET /network/wifi/status
Returns wlan1 connection status.

### GET /network/wifi/scan
Returns list of available networks. Each entry: `{ ssid, bssid, signal_percent, frequency_ghz, security }`.

### POST /network/wifi/connect
Connect wlan1 to a network. Saves profile to DB.

**Request**
```json
{ "ssid": "HomeWifi", "password": "password", "use_dhcp": true }
```

### POST /network/wifi/disconnect
Disconnect wlan1.

### GET /network/wifi/profiles
Returns saved Wi-Fi profiles.

### DELETE /network/wifi/profiles/{id}
Delete a saved profile.

---

## Files

### GET /files
Query: `?path=/home/pi`
Returns directory listing.

### GET /files/read
Query: `?path=/etc/hostname`
Returns file contents as text.

### POST /files/write
**Admin/Operator only.**
```json
{ "path": "/home/pi/test.txt", "content": "hello" }
```

### DELETE /files
**Admin/Operator only.**
```json
{ "path": "/home/pi/old-file.txt" }
```

### POST /files/rename
```json
{ "path": "/home/pi/old.txt", "new_name": "new.txt" }
```

### POST /files/move
```json
{ "source": "/home/pi/a.txt", "destination": "/tmp/a.txt" }
```

### POST /files/copy
```json
{ "source": "/home/pi/a.txt", "destination": "/home/pi/b.txt" }
```

### POST /files/mkdir
```json
{ "parent": "/home/pi", "name": "new_dir" }
```

### POST /files/compress
```json
{ "paths": ["/home/pi/dir1", "/home/pi/file.txt"], "destination": "/home/pi/archive.tar.gz", "format": "gztar" }
```

### POST /files/extract
```json
{ "path": "/home/pi/archive.tar.gz", "destination": "/home/pi/extracted" }
```

### POST /files/chmod
**Admin only.**
```json
{ "path": "/home/pi/script.sh", "mode": "0755", "recursive": false }
```

### POST /files/upload
Multipart form: `path` (target directory) + `file` fields.

---

## Packages

### GET /packages
Query: `?skip=0&limit=100`
Returns installed packages.

### GET /packages/search
Query: `?q=nginx`

### POST /packages/install
**Admin only.** `{ "name": "nginx" }`

### POST /packages/upgrade
**Admin only.** Runs `apt-get upgrade`.

### DELETE /packages/{name}
**Admin only.** Removes a package.

---

## Docker

### GET /docker/containers
Query: `?all=true` to include stopped containers.

### POST /docker/containers/{id}/start
### POST /docker/containers/{id}/stop
### POST /docker/containers/{id}/restart
### DELETE /docker/containers/{id}

### GET /docker/images
### DELETE /docker/images/{id}

---

## Bluetooth

### GET /bluetooth/devices
Returns paired devices.

### GET /bluetooth/scan
Runs 10-second discovery scan, returns found devices.

### POST /bluetooth/pair
`{ "mac": "AA:BB:CC:DD:EE:FF" }`

### POST /bluetooth/disconnect
`{ "mac": "AA:BB:CC:DD:EE:FF" }`

### DELETE /bluetooth/devices/{mac}

---

## GPIO

### GET /gpio/pins
Returns full 40-pin header state.

### POST /gpio/pins/{gpio}/mode
`{ "mode": "IN" | "OUT" }`

### POST /gpio/pins/{gpio}/set
`{ "value": 0 | 1 }`

### POST /gpio/pins/{gpio}/pwm
`{ "frequency": 1000, "duty_cycle": 50.0 }`

---

## Users

### GET /users
**Admin only.**

### POST /users
**Admin only.**
```json
{ "username": "alice", "email": "alice@pi.local", "password": "P@ssw0rd", "role": "operator" }
```

### GET /users/{id}
**Admin only.**

### PATCH /users/{id}
**Admin only.**

### DELETE /users/{id}
**Admin only.**

---

## Security

### GET /security/fail2ban
Returns Fail2Ban jail status and banned IPs.

### POST /security/fail2ban/{jail}/unban
**Admin only.** `{ "ip": "1.2.3.4" }`

### GET /security/sessions
Returns active refresh token sessions for the current user (admin sees all).

### DELETE /security/sessions/{jti}
**Admin only.** Revoke a specific session.

### DELETE /security/sessions
**Admin only.** Revoke all sessions (forces logout of all users).

### GET /security/audit
Query: `?limit=100&skip=0&username=&action=&status=`

### GET /security/firewall
Returns iptables rules.

---

## WebSockets

### WS /ws/system
Streams system metrics every 3 seconds. Requires JWT (cookie or `?token=` query param).

**Messages from server:**
```json
{ "type": "stats", "data": { ...SystemStats... } }
{ "type": "notification", "data": { "title": "...", "message": "...", "level": "info", "timestamp": "..." } }
```

**Messages to server:**
```json
{ "type": "ping" }
{ "type": "subscribe", "room": "system_metrics" }
```

### WS /terminal/ws/{session_id}
Full PTY session. `session_id` is any UUID v4 chosen by the client.

**Operator/Admin only.**

**Messages to server:**
```json
{ "type": "input", "data": "ls -la\n" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "kill" }
```

**Messages from server:**
```json
{ "type": "output", "data": "total 48\n..." }
{ "type": "exit", "code": 0 }
{ "type": "error", "message": "Session limit reached" }
```

---

## Common Error Responses

| Status | Meaning |
|---|---|
| 400 | Validation error — check `detail` field |
| 401 | Not authenticated or token expired |
| 403 | CSRF mismatch or insufficient role |
| 404 | Resource not found |
| 422 | Unprocessable entity (Pydantic validation) |
| 423 | Account locked |
| 429 | Rate limit exceeded |
| 500 | Internal server error — check backend logs |
