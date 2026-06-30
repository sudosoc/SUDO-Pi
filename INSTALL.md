# Installation Guide

## Prerequisites

| Requirement | Details |
|---|---|
| Hardware | Raspberry Pi 5 (4 GB+ RAM recommended) |
| OS | Kali Linux ARM64 or Raspberry Pi OS (Bookworm) 64-bit |
| Storage | ≥ 8 GB microSD or SSD |
| Wi-Fi adapters | Built-in (wlan0) for AP, Alpha AWUS036AXML (wlan1) for internet |
| Internet | Required during installation for package downloads |

## Automated Installation

```bash
# Clone the repository
git clone https://github.com/youruser/sudo-pi.git
cd sudo-pi

# Run the installer as root
sudo bash scripts/setup.sh
```

The script is idempotent — running it again will update existing installations without duplicating configuration.

## What the Installer Does

1. Verifies architecture and network interfaces
2. Installs system packages (nginx, hostapd, dnsmasq, fail2ban, Node.js 20, Python 3)
3. Creates the `sudo-pi` service user with limited sudo permissions
4. Copies application files to `/opt/sudo-pi`
5. Creates Python virtual environment and installs pip dependencies
6. Builds the React frontend (production bundle)
7. Generates a random `SECRET_KEY` and writes `/opt/sudo-pi/backend/.env`
8. Generates a self-signed TLS certificate (10-year validity)
9. Configures NetworkManager to leave `wlan0` unmanaged
10. Writes `hostapd.conf` and `dnsmasq.conf`
11. Sets static IP `192.168.4.1/24` on `wlan0`
12. Enables IP forwarding and NAT (AP clients share `wlan1` internet)
13. Configures nginx with HTTPS, WebSocket proxy, and SPA fallback
14. Installs and enables the `sudo-pi-backend` systemd service
15. Configures Fail2Ban jails
16. Initialises the SQLite database and creates the default admin account
17. Starts all services and runs a health check

## Post-Installation

1. **Connect to the SUDO-Pi Wi-Fi network**
   - SSID: `SUDO-Pi`
   - Password: `sudopi2024`

2. **Open the dashboard**
   - URL: `https://192.168.4.1`
   - Your browser will warn about the self-signed certificate — click "Advanced → Proceed"

3. **Log in** with `admin` / `admin`

4. **Change the default password immediately** via Settings → Account → Change Password

5. **Configure internet** via Network → Internet Network (wlan1) to scan and connect to your Wi-Fi

## Manual Installation (Advanced)

If you prefer to install each component manually, refer to the steps in `scripts/setup.sh`. Every function in the script is a self-contained, independently runnable step.

## Upgrading

```bash
cd sudo-pi
git pull

# Re-run the installer — it skips steps that are already complete
sudo bash scripts/setup.sh
```

## Uninstalling

```bash
# Stop and disable services
sudo systemctl stop sudo-pi-backend nginx hostapd dnsmasq
sudo systemctl disable sudo-pi-backend

# Remove application files
sudo rm -rf /opt/sudo-pi /etc/sudo-pi

# Remove nginx config
sudo rm -f /etc/nginx/sites-available/sudo-pi /etc/nginx/sites-enabled/sudo-pi

# Remove systemd unit
sudo rm -f /etc/systemd/system/sudo-pi-backend.service
sudo systemctl daemon-reload

# Remove service user
sudo userdel sudo-pi
sudo rm -f /etc/sudoers.d/sudo-pi

# Restore original hostapd/dnsmasq configs from backups if needed
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `https://192.168.4.1` unreachable | nginx not running | `sudo systemctl restart nginx` |
| AP not broadcasting | hostapd failed to start | `sudo journalctl -u hostapd -n 50` |
| No DHCP leases | dnsmasq not running | `sudo journalctl -u dnsmasq -n 50` |
| Login fails | Backend not running | `sudo journalctl -u sudo-pi-backend -n 50` |
| wlan1 not found | Alpha adapter not plugged in | Plug in the USB adapter and reboot |
| Certificate warning | Self-signed cert | Expected — click "Proceed" or add to trusted store |
| Permission denied in terminal | Viewer role cannot open terminal | Log in as admin or operator |

## Service Management

```bash
# View backend logs
journalctl -u sudo-pi-backend -f

# Restart backend after config change
sudo systemctl restart sudo-pi-backend

# Check all SUDO-Pi service statuses
systemctl status sudo-pi-backend nginx hostapd dnsmasq fail2ban
```

## Directory Layout

```
/opt/sudo-pi/
├── backend/          # FastAPI application
│   ├── .env          # Environment configuration (600 permissions)
│   └── sudo_pi.db    # SQLite database
├── frontend/
│   └── dist/         # Built React SPA (served by nginx)
└── venv/             # Python virtual environment

/etc/sudo-pi/
└── certs/
    ├── server.crt
    └── server.key

/var/log/sudo-pi/
└── audit.log         # Security audit log (read by Fail2Ban)
```
