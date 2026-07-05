#!/usr/bin/env bash
# =============================================================================
# SUDO-Pi — uninstaller
#
#   sudo bash uninstall.sh            # remove SUDO-Pi, restore the system
#   sudo bash uninstall.sh --purge    # also delete the database + config data
#   sudo bash uninstall.sh --yes      # skip the confirmation prompt
#
# Stops and removes every SUDO-Pi service, config, user, and file, then
# restores the OS networking to its prior state. The git checkout you cloned
# is left in place (delete it yourself if you want it gone).
# =============================================================================
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()   { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
step() { echo -e "${CYAN}—›${RESET} $*"; }

INSTALL_DIR="/opt/sudo-pi"
AP_INTERFACE="wlan0"
AP_NETWORK="192.168.4.0/24"

PURGE=false
ASSUME_YES=false
for arg in "$@"; do
    case "$arg" in
        --purge) PURGE=true ;;
        --yes|-y) ASSUME_YES=true ;;
    esac
done

[[ $EUID -eq 0 ]] || { echo -e "${RED}[ERROR]${RESET} Run as root: sudo bash uninstall.sh"; exit 1; }

echo -e "${BOLD}${RED}"
echo "  This will completely remove SUDO-Pi from this system:"
echo -e "${RESET}"
echo "    • stop + disable + delete all SUDO-Pi services"
echo "    • remove nginx site, systemd units, NetworkManager hooks"
echo "    • undo iptables NAT, device limits, and captive-portal rules"
echo "    • restore dnsmasq / hostapd / hostname to their originals"
echo "    • delete the sudo-pi service user and ${INSTALL_DIR}"
$PURGE && echo -e "    • ${RED}--purge: also delete the database and /etc/sudo-pi${RESET}"
echo
if ! $ASSUME_YES; then
    read -r -p "Type 'remove' to continue: " confirm
    [[ "${confirm}" == "remove" ]] || { warn "Aborted."; exit 0; }
fi

# ── 1. Stop + disable + remove services ──────────────────────────────────────
step "Stopping and removing services..."
for svc in sudo-pi-backend sudo-pi-mdns sudo-pi-internet-sharing sudo-pi-update; do
    systemctl stop "${svc}" 2>/dev/null || true
    systemctl disable "${svc}" 2>/dev/null || true
    rm -f "/etc/systemd/system/${svc}.service"
done
systemctl daemon-reload 2>/dev/null || true
ok "Services removed"

# ── 2. Remote desktop (VNC + websockify) if it was ever started ──────────────
step "Tearing down remote desktop..."
sudo -u sudo-pi env HOME="${INSTALL_DIR}" vncserver -kill :1 2>/dev/null || true
fuser -k 5901/tcp 2>/dev/null || true
fuser -k 6080/tcp 2>/dev/null || true
pkill -f 'websockify.*6080' 2>/dev/null || true
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true
ok "Remote desktop stopped"

# ── 3. nginx ─────────────────────────────────────────────────────────────────
step "Removing nginx site..."
rm -f /etc/nginx/sites-enabled/sudo-pi /etc/nginx/sites-enabled/sudo-pi.conf
rm -f /etc/nginx/sites-available/sudo-pi /etc/nginx/sites-available/sudo-pi.conf
if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null || true
fi
ok "nginx site removed"

# ── 4. Undo network rules (NAT, device policies, captive portal) ─────────────
step "Flushing SUDO-Pi network rules..."
# MASQUERADE for the AP subnet on any interface
while read -r line; do
    [[ "$line" == *"$AP_NETWORK"* && "$line" == *"MASQUERADE"* ]] || continue
    # shellcheck disable=SC2086
    iptables -t nat -D POSTROUTING ${line#-A POSTROUTING } 2>/dev/null || true
done < <(iptables -t nat -S POSTROUTING 2>/dev/null)
# Our custom chains (device policy + captive portal + traffic accounting)
for chain in SUDO_PI_POLICY SUDO_PI_ACCT_IN SUDO_PI_ACCT_OUT SUDO_PI_CAPTIVE; do
    iptables -D FORWARD -j "${chain}" 2>/dev/null || true
    iptables -t nat -D PREROUTING -j "${chain}" 2>/dev/null || true
    iptables -F "${chain}" 2>/dev/null || true
    iptables -X "${chain}" 2>/dev/null || true
done
# Traffic-shaping qdiscs on the AP interface
tc qdisc del dev "${AP_INTERFACE}" root 2>/dev/null || true
tc qdisc del dev "${AP_INTERFACE}" ingress 2>/dev/null || true
ok "Network rules flushed"

# ── 5. Restore dnsmasq / hostapd / networkd ──────────────────────────────────
step "Restoring network daemons..."
if [[ -f /etc/dnsmasq.conf.orig ]]; then
    mv -f /etc/dnsmasq.conf.orig /etc/dnsmasq.conf
elif [[ -f /etc/dnsmasq.conf.bak ]]; then
    mv -f /etc/dnsmasq.conf.bak /etc/dnsmasq.conf
else
    rm -f /etc/dnsmasq.conf
fi
rm -f /etc/dnsmasq.d/sudo-pi-*.conf
systemctl restart dnsmasq 2>/dev/null || true

systemctl stop hostapd 2>/dev/null || true
systemctl disable hostapd 2>/dev/null || true
rm -f /etc/hostapd/hostapd.conf

rm -f /etc/NetworkManager/conf.d/99-sudo-pi-unmanaged.conf
rm -f /etc/NetworkManager/dispatcher.d/99-sudo-pi-sharing
rm -f "/etc/systemd/network/10-${AP_INTERFACE}-static.network"
ip addr flush dev "${AP_INTERFACE}" 2>/dev/null || true
systemctl reload NetworkManager 2>/dev/null || true
ok "Network daemons restored"

# ── 6. Avahi / mDNS + hostname ───────────────────────────────────────────────
step "Reverting mDNS + hostname..."
rm -f /etc/avahi/services/sudo-pi.service
sed -i "s/^allow-interfaces=${AP_INTERFACE},lo/#allow-interfaces=/" /etc/avahi/avahi-daemon.conf 2>/dev/null || true
systemctl restart avahi-daemon 2>/dev/null || true
if [[ "$(hostnamectl --static 2>/dev/null)" == "sudo" ]]; then
    hostnamectl set-hostname raspberrypi 2>/dev/null || true
    sed -i 's/127\.0\.1\.1.*sudo.*/127.0.1.1\traspberrypi/' /etc/hosts 2>/dev/null || true
fi
ok "mDNS + hostname reverted"

# ── 7. fail2ban ──────────────────────────────────────────────────────────────
rm -f /etc/fail2ban/jail.d/sudo-pi.conf /etc/fail2ban/filter.d/sudo-pi-auth.conf
systemctl restart fail2ban 2>/dev/null || true

# ── 8. Files, cron, service user ─────────────────────────────────────────────
step "Removing files and the service user..."
rm -rf "${INSTALL_DIR}"
rm -f /etc/sudoers.d/sudo-pi
rm -f /run/sudo-pi-*.status /run/sudo-pi-*.pid
# Any cron entries the dashboard installed for this user
crontab -u sudo-pi -r 2>/dev/null || true
id sudo-pi &>/dev/null && userdel sudo-pi 2>/dev/null || true

if $PURGE; then
    step "--purge: deleting persistent data..."
    rm -rf /etc/sudo-pi /var/log/sudo-pi
    ok "Data purged"
else
    warn "Kept /var/log/sudo-pi and /etc/sudo-pi (use --purge to remove)"
fi
ok "Files removed"

# ── 9. Re-enable IPv4 forwarding default (leave kernel flag; harmless) ───────
sed -i '/^net.ipv4.ip_forward=1$/d' /etc/sysctl.conf 2>/dev/null || true

echo
echo -e "${BOLD}${GREEN}SUDO-Pi has been removed.${RESET}"
echo -e "  The git checkout was left in place — delete it manually if you want:"
echo -e "    ${CYAN}rm -rf \"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)\"${RESET}"
echo -e "  A reboot is recommended to fully reset networking:  ${CYAN}sudo reboot${RESET}"
echo
