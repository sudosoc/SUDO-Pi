#!/usr/bin/env bash
# =============================================================================
# internet-sharing.sh — Give AP clients internet by NAT'ing through whatever
# interface actually has upstream internet (eth0 / wlan1 / usb0 / ...).
#
# Idempotent and self-healing: safe to run on boot, on a timer, or on demand.
# Detects the upstream interface from the default route (never the AP iface),
# enables IP forwarding, and rebuilds the MASQUERADE + FORWARD rules — clearing
# any stale rules that pointed at a now-wrong interface.
#
# Usage:
#   sudo bash internet-sharing.sh            # apply
#   sudo bash internet-sharing.sh --status   # print status as JSON-ish text
# =============================================================================
set -uo pipefail

AP_INTERFACE="wlan0"
AP_NETWORK="192.168.4.0/24"

log() { echo "[internet-sharing] $*"; }

# ── Detect the upstream interface (lowest-metric default route ≠ AP) ─────────
detect_upstream() {
    ip route show default 2>/dev/null \
        | awk '{for (i=1;i<=NF;i++) if ($i=="dev") print $(i+1), $0}' \
        | grep -v "^${AP_INTERFACE} " \
        | while read -r dev rest; do
              metric=$(echo "$rest" | grep -oP 'metric \K[0-9]+' || echo 0)
              echo "${metric:-0} ${dev}"
          done \
        | sort -n | head -1 | awk '{print $2}'
}

UPSTREAM="$(detect_upstream)"

if [[ "${1:-}" == "--status" ]]; then
    fwd=$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo 0)
    echo "upstream=${UPSTREAM:-none}"
    echo "ip_forward=${fwd}"
    if [[ -n "${UPSTREAM}" ]]; then
        if iptables -t nat -C POSTROUTING -s "${AP_NETWORK}" -o "${UPSTREAM}" -j MASQUERADE 2>/dev/null; then
            echo "masquerade=yes"
        else
            echo "masquerade=no"
        fi
    else
        echo "masquerade=no"
    fi
    exit 0
fi

if [[ -z "${UPSTREAM}" ]]; then
    log "No upstream internet interface found (no default route besides ${AP_INTERFACE})."
    log "Connect the Pi to the internet via ethernet or a second Wi-Fi adapter, then re-run."
    exit 1
fi

log "Upstream internet interface: ${UPSTREAM}"

# ── 1. Enable IPv4 forwarding (runtime + persistent) ─────────────────────────
sysctl -w net.ipv4.ip_forward=1 >/dev/null
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf 2>/dev/null \
    || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

# ── 2. Clear ALL stale MASQUERADE rules for our subnet (any interface) ───────
while read -r line; do
    [[ "$line" == *"$AP_NETWORK"* && "$line" == *"MASQUERADE"* ]] || continue
    # Turn the "-A POSTROUTING ..." listing into a matching "-D"
    del_args="${line/-A POSTROUTING/}"
    # shellcheck disable=SC2086
    iptables -t nat -D POSTROUTING $del_args 2>/dev/null || true
done < <(iptables -t nat -S POSTROUTING 2>/dev/null)

# ── 3. Fresh MASQUERADE for the detected upstream ────────────────────────────
iptables -t nat -A POSTROUTING -s "${AP_NETWORK}" -o "${UPSTREAM}" -j MASQUERADE

# ── 4. FORWARD rules AP ↔ upstream (delete-then-insert for idempotency) ──────
iptables -D FORWARD -i "${AP_INTERFACE}" -o "${UPSTREAM}" -j ACCEPT 2>/dev/null || true
iptables -I FORWARD 1 -i "${AP_INTERFACE}" -o "${UPSTREAM}" -j ACCEPT

iptables -D FORWARD -i "${UPSTREAM}" -o "${AP_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
iptables -I FORWARD 2 -i "${UPSTREAM}" -o "${AP_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT

# ── 5. Allow AP clients to reach the Pi's own services (nginx, dnsmasq) ──────
# Without explicit INPUT ACCEPT rules the kernel default is ACCEPT, but if
# fail2ban or another tool has tightened the INPUT chain these rules guarantee
# access from AP clients to the dashboard (80/443) and DNS (53).
for port in 80 443; do
    iptables -D INPUT -i "${AP_INTERFACE}" -p tcp --dport "${port}" -j ACCEPT 2>/dev/null || true
    iptables -I INPUT 1 -i "${AP_INTERFACE}" -p tcp --dport "${port}" -j ACCEPT
done
iptables -D INPUT -i "${AP_INTERFACE}" -p udp --dport 53 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -i "${AP_INTERFACE}" -p udp --dport 53 -j ACCEPT
iptables -D INPUT -i "${AP_INTERFACE}" -p tcp --dport 53 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -i "${AP_INTERFACE}" -p tcp --dport 53 -j ACCEPT

# ── 6. Persist rules across reboots (best effort) ────────────────────────────
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null \
    || iptables-save > /etc/iptables.rules 2>/dev/null || true

log "Internet sharing active: ${AP_NETWORK} → ${UPSTREAM}"
