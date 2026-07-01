# SUDO-Pi

A comprehensive headless management dashboard for Raspberry Pi 5. Control your Pi from any browser on your local network — no monitor, keyboard, or SSH required.

## Features

| Category | Capabilities |
|---|---|
| **System Monitor** | Real-time CPU, RAM, disk, temperature, processes, services, journal logs |
| **Terminal** | Full PTY in the browser — multiple tabs, sudo support, xterm.js |
| **File Manager** | Browse, upload, download, edit, rename, move, copy, compress, extract, permissions |
| **Network** | Dual Wi-Fi: built-in as always-on AP, Alpha adapter as internet client |
| **Packages** | apt install/remove/upgrade with search |
| **Docker** | Container and image management |
| **Bluetooth** | Scan, pair, connect, manage devices |
| **GPIO** | Visual 40-pin pinout, read/write, PWM |
| **Users** | RBAC: Admin / Operator / Viewer |
| **Security** | Fail2Ban, firewall rules, session management, audit log |
| **Settings** | Hostname, timezone, password, backup, reboot/shutdown |

## Requirements

- Raspberry Pi 5
- Kali Linux ARM64 (or any Debian-based ARM64 OS)
- Alpha AWUS036AXML USB Wi-Fi adapter (for internet client)
- Internet connection during installation

## Quick Start

```bash
git clone https://github.com/sudosoc/sudo-pi.git
cd sudo-pi
sudo bash scripts/setup.sh
```

Connect to the **SUDO-Pi** Wi-Fi network (password: `sudopi2024`), then open **https://192.168.4.1** in your browser.

Default credentials: `admin` / `admin` — **change the password immediately**.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full breakdown of the stack, directory layout, security model, and design decisions.

## Installation

See [INSTALL.md](INSTALL.md) for detailed step-by-step instructions, upgrade procedure, and troubleshooting.

## API

See [API.md](API.md) for the full REST + WebSocket API reference.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, hardening checklist, and vulnerability disclosure policy.

## License

MIT
