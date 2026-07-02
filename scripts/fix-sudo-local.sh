#!/usr/bin/env bash
# =============================================================================
# fix-sudo-local.sh — Fix sudo.local hostname resolution and Nginx binding
# Run as root on the Pi: sudo bash /SUDO-Pi/scripts/fix-sudo-local.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[OK]${RESET}    $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*"; }

[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash $0"; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── 1. Update dnsmasq to resolve sudo.local → 192.168.4.1 ───────────────────
info "Updating dnsmasq config with sudo.local address..."
cp "${REPO_DIR}/configs/dnsmasq/dnsmasq.conf" /etc/dnsmasq.conf
systemctl restart dnsmasq && ok "dnsmasq restarted with sudo.local resolution"

# ── 2. Configure Avahi to advertise sudo.local (no hostname change needed) ──
info "Configuring Avahi service advertisement..."
mkdir -p /etc/avahi/services
cat > /etc/avahi/services/sudo-pi.service <<'AVAHI'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">SUDO-Pi Dashboard</name>
  <service>
    <type>_https._tcp</type>
    <port>443</port>
  </service>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
  </service>
</service-group>
AVAHI

# Make Avahi listen on AP interface too
if [[ -f /etc/avahi/avahi-daemon.conf ]]; then
    if ! grep -q "^allow-interfaces=" /etc/avahi/avahi-daemon.conf; then
        echo "" >> /etc/avahi/avahi-daemon.conf
        echo "[server]" >> /etc/avahi/avahi-daemon.conf
        echo "allow-interfaces=wlan0,lo" >> /etc/avahi/avahi-daemon.conf
    else
        sed -i "s/^allow-interfaces=.*/allow-interfaces=wlan0,lo/" /etc/avahi/avahi-daemon.conf
    fi
fi

systemctl restart avahi-daemon && ok "Avahi daemon restarted"

# ── 2b. Publish sudo.local as an explicit mDNS A record ─────────────────────
# This is the piece that makes Windows resolve sudo.local. Windows sends every
# ".local" query to mDNS (never to dnsmasq), so we must have Avahi answer with
# an A record pointing at the AP IP — regardless of the Pi's real hostname.
info "Installing persistent mDNS alias service (sudo.local → 192.168.4.1)..."
if ! command -v avahi-publish &>/dev/null; then
    info "avahi-publish not found — installing avahi-utils..."
    apt-get install -y avahi-utils >/dev/null 2>&1 || err "Could not install avahi-utils"
fi
cp "${REPO_DIR}/configs/systemd/sudo-pi-mdns.service" /etc/systemd/system/sudo-pi-mdns.service
systemctl daemon-reload
systemctl enable --now sudo-pi-mdns.service 2>/dev/null || systemctl restart sudo-pi-mdns.service
if systemctl is-active --quiet sudo-pi-mdns.service; then
    ok "mDNS alias service running — sudo.local is now advertised"
else
    err "mDNS alias service failed — check: journalctl -u sudo-pi-mdns -n 20"
fi

# ── 3. Add sudo.local to /etc/hosts for local Pi resolution ─────────────────
info "Adding sudo.local to /etc/hosts..."
if ! grep -q "sudo.local" /etc/hosts; then
    echo "192.168.4.1    sudo.local sudo-pi.local sudo" >> /etc/hosts
    ok "Added sudo.local to /etc/hosts"
else
    ok "sudo.local already in /etc/hosts"
fi

# ── 4. Ensure Nginx is running ───────────────────────────────────────────────
info "Checking Nginx..."
if systemctl is-active --quiet nginx; then
    ok "Nginx is running"
else
    info "Starting Nginx..."
    systemctl start nginx && ok "Nginx started"
fi

# ── 5. Verify connectivity ───────────────────────────────────────────────────
info "Verifying local HTTPS access..."
if curl -sk --max-time 5 "https://127.0.0.1/api/v1/health" | grep -q '"status"'; then
    ok "Backend health check passed via HTTPS"
else
    err "Backend health check failed — check: journalctl -u sudo-pi-backend -n 30"
fi

echo
echo -e "${GREEN}Done!${RESET} Connect Windows to the 'SUDO-Pi' WiFi, then open:"
echo -e "  ${CYAN}https://sudo.local${RESET}  or  ${CYAN}https://192.168.4.1${RESET}"
echo
echo "Note: flush the Windows DNS cache once after connecting, so the stale"
echo "sudo.local entry is dropped and the new mDNS record is picked up:"
echo "  ipconfig /flushdns"
