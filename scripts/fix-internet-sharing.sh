#!/usr/bin/env bash
# =============================================================================
# fix-internet-sharing.sh — Give AP clients internet access
#
# Detects whichever interface actually has upstream internet (ethernet, a USB
# Wi-Fi dongle, a tethered phone…) and routes/NATs the AP subnet out through it.
# Fixes the case where clients connect to the SUDO-Pi Wi-Fi, reach the
# dashboard, but have no internet.
#
# Run as root on the Pi:  sudo bash /SUDO-Pi/scripts/fix-internet-sharing.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[0;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[OK]${RESET}    $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*"; }

[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash $0"; exit 1; }

AP_INTERFACE="wlan0"
AP_NETWORK="192.168.4.0/24"

# ── 1. Detect the upstream (internet-providing) interface ────────────────────
info "Detecting upstream internet interface..."
UPSTREAM="$(ip route show default | grep -oP 'dev \K\S+' | grep -v "^${AP_INTERFACE}$" | head -n1 || true)"

if [[ -z "${UPSTREAM}" ]]; then
    err "No upstream internet interface found."
    echo "  The Pi itself has no internet. Connect it to the internet first:"
    echo "    • Plug in an ethernet cable, OR"
    echo "    • Connect a second Wi-Fi adapter to an internet network, OR"
    echo "    • Tether a phone over USB"
    echo "  Then run this script again."
    exit 1
fi
ok "Upstream interface: ${UPSTREAM}"

# ── 2. Verify the upstream actually reaches the internet ─────────────────────
info "Testing internet reachability via ${UPSTREAM}..."
if ping -c 1 -W 3 -I "${UPSTREAM}" 1.1.1.1 &>/dev/null; then
    ok "Internet reachable via ${UPSTREAM}"
else
    warn "Could not reach 1.1.1.1 via ${UPSTREAM} — sharing will be set up anyway,"
    warn "but the Pi's own internet connection may be down."
fi

# ── 3. Enable IPv4 forwarding (runtime + persistent) ─────────────────────────
info "Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 >/dev/null
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
ok "IP forwarding enabled"

# ── 4. Clear stale MASQUERADE rules for our subnet (any interface) ───────────
info "Clearing old NAT rules for ${AP_NETWORK}..."
while read -r line; do
    [[ -z "${line}" ]] && continue
    # shellcheck disable=SC2086
    iptables -t nat -D POSTROUTING ${line#-A POSTROUTING } 2>/dev/null || true
done < <(iptables -t nat -S POSTROUTING | grep "${AP_NETWORK}" | grep "MASQUERADE" || true)

# ── 5. Apply fresh NAT + forwarding rules ────────────────────────────────────
info "Applying NAT: ${AP_NETWORK} → ${UPSTREAM}..."
iptables -t nat -A POSTROUTING -s "${AP_NETWORK}" -o "${UPSTREAM}" -j MASQUERADE

iptables -D FORWARD -i "${AP_INTERFACE}" -o "${UPSTREAM}" -j ACCEPT 2>/dev/null || true
iptables -I FORWARD 1 -i "${AP_INTERFACE}" -o "${UPSTREAM}" -j ACCEPT
iptables -D FORWARD -i "${UPSTREAM}" -o "${AP_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
iptables -I FORWARD 1 -i "${UPSTREAM}" -o "${AP_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT
ok "NAT + forwarding rules applied"

# ── 6. Make sure dnsmasq hands out a working DNS server to clients ───────────
# (clients need DNS to resolve names even once routing works)
if [[ -f /etc/dnsmasq.conf ]] && ! grep -q '^server=' /etc/dnsmasq.conf; then
    info "Adding upstream DNS servers to dnsmasq..."
    {
        echo ""
        echo "# Upstream DNS for AP clients (added by fix-internet-sharing.sh)"
        echo "server=1.1.1.1"
        echo "server=8.8.8.8"
    } >> /etc/dnsmasq.conf
    systemctl restart dnsmasq 2>/dev/null || true
    ok "dnsmasq updated with upstream DNS"
fi

# ── 7. Persist iptables across reboots ───────────────────────────────────────
info "Persisting firewall rules..."
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null || iptables-save > /etc/iptables.rules 2>/dev/null || true
ok "Rules persisted"

echo
echo -e "${GREEN}Done!${RESET} AP clients now route internet through ${CYAN}${UPSTREAM}${RESET}."
echo "On your connected device, you may need to disconnect and reconnect to the SUDO-Pi Wi-Fi."
