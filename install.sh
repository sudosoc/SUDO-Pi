#!/usr/bin/env bash
# =============================================================================
# SUDO-Pi — one-command installer
#
#   git clone <repo> && cd <repo> && sudo bash install.sh
#
# Fully automated and idempotent. Detects its own location, installs every
# system tool the dashboard needs, builds the app, wires all services, and
# leaves a working install reachable at https://sudo.local (and the AP IP).
#
# Runtime model (kept consistent with update.sh / uninstall.sh):
#   - Git checkout stays where you cloned it        → $REPO_DIR
#   - Backend runs from a runtime copy              → /opt/sudo-pi/backend
#   - Python venv                                   → /opt/sudo-pi/venv
#   - Frontend is served straight from the checkout → $REPO_DIR/frontend/dist
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
die()     { error "$*"; exit 1; }

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${SCRIPT_DIR}"
INSTALL_DIR="/opt/sudo-pi"
SERVICE_USER="sudo-pi"
VENV_DIR="${INSTALL_DIR}/venv"
BACKEND_DIR="${INSTALL_DIR}/backend"
FRONTEND_DIST="${REPO_DIR}/frontend/dist"
CERT_DIR="/etc/sudo-pi/certs"
LOG_DIR="/var/log/sudo-pi"
NGINX_CONF="/etc/nginx/sites-available/sudo-pi.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/sudo-pi.conf"

AP_INTERFACE="wlan0"
AP_IP="192.168.4.1"
AP_NETWORK="192.168.4.0/24"

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash install.sh"
[[ -d "${REPO_DIR}/backend" && -d "${REPO_DIR}/frontend" ]] \
    || die "Run this from inside the cloned repo (backend/ and frontend/ not found)."

banner() {
    echo -e "${BOLD}${CYAN}"
    echo "  ███████╗██╗   ██╗██████╗  ██████╗       ██████╗ ██╗"
    echo "  ██╔════╝██║   ██║██╔══██╗██╔═══██╗      ██╔══██╗██║"
    echo "  ███████╗██║   ██║██║  ██║██║   ██║█████╗██████╔╝██║"
    echo "  ╚════██║██║   ██║██║  ██║██║   ██║╚════╝██╔═══╝ ██║"
    echo "  ███████║╚██████╔╝██████╔╝╚██████╔╝      ██║     ██║"
    echo "  ╚══════╝ ╚═════╝ ╚═════╝  ╚═════╝       ╚═╝     ╚═╝"
    echo -e "${RESET}  ${BOLD}Raspberry Pi Management Dashboard — Installer${RESET}\n"
}

# ── 1. System packages ───────────────────────────────────────────────────────
install_packages() {
    info "Updating apt and installing system packages (this can take a while)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y

    apt-get install -y --no-install-recommends \
        python3 python3-venv python3-dev python3-pip \
        build-essential libssl-dev libffi-dev \
        nginx openssl rsync curl git ca-certificates \
        hostapd dnsmasq iproute2 iptables \
        network-manager avahi-daemon avahi-utils \
        rfkill wireless-tools iw \
        bluez python3-dbus \
        acl psmisc procps net-tools \
        fail2ban \
        tigervnc-standalone-server tigervnc-common websockify \
        || die "Package installation failed"

    success "System packages installed"
}

# ── 2. Node.js 20 ────────────────────────────────────────────────────────────
install_nodejs() {
    local major
    major=$(node --version 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)
    if [[ "${major}" -ge 20 ]]; then
        success "Node.js $(node --version) already present"
        return
    fi
    info "Installing Node.js 20.x..."
    curl -fsSL "https://deb.nodesource.com/setup_20.x" | bash -
    apt-get install -y nodejs
    success "Node.js $(node --version) installed"
}

# ── 3. Service user (passwordless sudo — needed for OS management) ────────────
create_service_user() {
    if id "${SERVICE_USER}" &>/dev/null; then
        success "Service user '${SERVICE_USER}' exists"
    else
        info "Creating service user '${SERVICE_USER}'..."
        useradd --system --no-create-home --shell /usr/sbin/nologin \
            --groups "sudo,netdev,bluetooth" "${SERVICE_USER}" 2>/dev/null || \
        useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
    fi
    echo 'sudo-pi ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/sudo-pi
    chmod 440 /etc/sudoers.d/sudo-pi
    success "Service user ready"
}

# ── 4. Directories + runtime backend copy ────────────────────────────────────
setup_dirs_and_backend() {
    info "Creating directories and syncing backend → ${BACKEND_DIR}..."
    mkdir -p "${INSTALL_DIR}" "${BACKEND_DIR}" "${CERT_DIR}" "${LOG_DIR}" \
             "${INSTALL_DIR}/.vnc" "${INSTALL_DIR}/compose-stacks"
    rsync -a --delete \
        --exclude '.env' --exclude '__pycache__' --exclude '*.pyc' --exclude '*.db' \
        "${REPO_DIR}/backend/app/" "${BACKEND_DIR}/app/"
    cp "${REPO_DIR}/backend/requirements.txt" "${BACKEND_DIR}/requirements.txt"
    [[ -f "${REPO_DIR}/backend/alembic.ini" ]] && cp "${REPO_DIR}/backend/alembic.ini" "${BACKEND_DIR}/" || true
    [[ -d "${REPO_DIR}/backend/alembic" ]] && rsync -a "${REPO_DIR}/backend/alembic/" "${BACKEND_DIR}/alembic/" || true
    success "Backend synced"
}

# ── 5. Python venv ───────────────────────────────────────────────────────────
setup_python() {
    if [[ ! -d "${VENV_DIR}" ]]; then
        info "Creating Python virtualenv..."
        python3 -m venv "${VENV_DIR}"
    fi
    info "Installing Python dependencies..."
    "${VENV_DIR}/bin/pip" install --quiet --upgrade pip
    "${VENV_DIR}/bin/pip" install --quiet -r "${BACKEND_DIR}/requirements.txt"
    success "Python dependencies installed"
}

# ── 6. Frontend build (served from the repo checkout) ────────────────────────
build_frontend() {
    info "Installing frontend dependencies + building..."
    cd "${REPO_DIR}/frontend"
    npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
    npm run build
    success "Frontend built → ${FRONTEND_DIST}"
}

# ── 7. .env (only if missing) ────────────────────────────────────────────────
generate_env() {
    local env_file="${BACKEND_DIR}/.env"
    if [[ -f "${env_file}" ]]; then
        success ".env already present — keeping it"
        return
    fi
    info "Generating backend .env..."
    cat > "${env_file}" <<ENV
SECRET_KEY=$(openssl rand -hex 32)
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=sqlite+aiosqlite:////opt/sudo-pi/backend/sudo_pi.db
AP_INTERFACE=${AP_INTERFACE}
AP_IP=${AP_IP}
AP_SSID=SUDO-Pi
AP_PASSWORD=sudopi2024
HOSTAPD_CONF_PATH=/etc/hostapd/hostapd.conf
DNSMASQ_CONF_PATH=/etc/dnsmasq.conf
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
LOG_DIR=${LOG_DIR}
SYSTEM_METRICS_INTERVAL=3
ENV
    chmod 600 "${env_file}"
    success ".env generated (default login admin/admin — change it after first login)"
}

# ── 8. TLS certificate ───────────────────────────────────────────────────────
generate_cert() {
    if [[ -f "${CERT_DIR}/server.crt" && -f "${CERT_DIR}/server.key" ]]; then
        success "TLS certificate already present"
        return
    fi
    info "Generating self-signed TLS certificate..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:4096 \
        -keyout "${CERT_DIR}/server.key" -out "${CERT_DIR}/server.crt" \
        -subj "/C=US/ST=Local/L=Local/O=SUDO-Pi/CN=sudo.local" \
        -addext "subjectAltName=DNS:sudo.local,DNS:sudo-pi.local,DNS:localhost,IP:${AP_IP}" 2>/dev/null
    chmod 600 "${CERT_DIR}/server.key"; chmod 644 "${CERT_DIR}/server.crt"
    success "TLS certificate generated"
}

# ── 9. nginx (root templated to the repo's dist) ─────────────────────────────
configure_nginx() {
    info "Configuring nginx (serving ${FRONTEND_DIST})..."
    sed "s#^\( *root \).*#\1${FRONTEND_DIST};#" \
        "${REPO_DIR}/configs/nginx/sudo-pi.conf" > "${NGINX_CONF}"
    rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/sudo-pi
    ln -sf "${NGINX_CONF}" "${NGINX_ENABLED}"
    nginx -t || die "nginx config test failed"
    systemctl enable nginx >/dev/null 2>&1 || true
    success "nginx configured"
}

# ── 10. Network stack: hostapd, dnsmasq, AP IP, mDNS, forwarding ─────────────
configure_network() {
    info "Configuring the access-point network stack..."

    # NetworkManager must not touch the AP interface
    mkdir -p /etc/NetworkManager/conf.d
    printf '[keyfile]\nunmanaged-devices=interface-name:%s\n' "${AP_INTERFACE}" \
        > /etc/NetworkManager/conf.d/99-sudo-pi-unmanaged.conf

    # hostapd
    cp "${REPO_DIR}/configs/hostapd/hostapd.conf" /etc/hostapd/hostapd.conf
    [[ -f /etc/default/hostapd ]] && \
        sed -i 's|#\?DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
    systemctl unmask hostapd 2>/dev/null || true
    systemctl enable hostapd >/dev/null 2>&1 || true

    # dnsmasq — back up original, install ours, and GUARANTEE conf-dir is loaded
    # (ad-blocker, DNS records and static leases all live in /etc/dnsmasq.d)
    [[ -f /etc/dnsmasq.conf && ! -f /etc/dnsmasq.conf.orig ]] && \
        cp /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
    cp "${REPO_DIR}/configs/dnsmasq/dnsmasq.conf" /etc/dnsmasq.conf
    mkdir -p /etc/dnsmasq.d
    grep -q '^conf-dir=/etc/dnsmasq.d' /etc/dnsmasq.conf 2>/dev/null || \
        echo 'conf-dir=/etc/dnsmasq.d/,*.conf' >> /etc/dnsmasq.conf
    systemctl enable dnsmasq >/dev/null 2>&1 || true

    # Static IP on the AP interface (now + persistent via networkd if used)
    if systemctl is-enabled systemd-networkd &>/dev/null; then
        printf '[Match]\nName=%s\n\n[Network]\nAddress=%s/24\n' "${AP_INTERFACE}" "${AP_IP}" \
            > "/etc/systemd/network/10-${AP_INTERFACE}-static.network"
    fi
    ip addr flush dev "${AP_INTERFACE}" 2>/dev/null || true
    ip addr add "${AP_IP}/24" dev "${AP_INTERFACE}" 2>/dev/null || true
    ip link set "${AP_INTERFACE}" up 2>/dev/null || true

    # IPv4 forwarding (persistent)
    sysctl -w net.ipv4.ip_forward=1 >/dev/null
    grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

    # mDNS: advertise sudo.local on the AP
    if [[ -f /etc/avahi/avahi-daemon.conf ]]; then
        sed -i "s/^#*allow-interfaces=.*/allow-interfaces=${AP_INTERFACE},lo/" /etc/avahi/avahi-daemon.conf
    fi
    systemctl enable avahi-daemon >/dev/null 2>&1 || true

    success "Network stack configured"
}

# ── 11. systemd units (backend + mDNS alias + internet-sharing) ──────────────
install_services() {
    info "Installing systemd units..."
    cp "${REPO_DIR}/configs/systemd/sudo-pi-backend.service"          /etc/systemd/system/
    cp "${REPO_DIR}/configs/systemd/sudo-pi-mdns.service"             /etc/systemd/system/ 2>/dev/null || true
    cp "${REPO_DIR}/configs/systemd/sudo-pi-internet-sharing.service" /etc/systemd/system/ 2>/dev/null || true

    # Internet-sharing auto-apply on link changes
    if [[ -f "${REPO_DIR}/configs/networkmanager/99-sudo-pi-sharing" ]]; then
        mkdir -p /etc/NetworkManager/dispatcher.d
        cp "${REPO_DIR}/configs/networkmanager/99-sudo-pi-sharing" /etc/NetworkManager/dispatcher.d/
        chmod 755 /etc/NetworkManager/dispatcher.d/99-sudo-pi-sharing
    fi
    chmod +x "${REPO_DIR}/scripts/"*.sh 2>/dev/null || true

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" "${LOG_DIR}" "${CERT_DIR}"

    systemctl daemon-reload
    systemctl enable sudo-pi-backend >/dev/null 2>&1 || true
    systemctl enable sudo-pi-mdns.service >/dev/null 2>&1 || true
    systemctl enable sudo-pi-internet-sharing.service >/dev/null 2>&1 || true
    success "systemd units installed"
}

# ── 12. Database ─────────────────────────────────────────────────────────────
init_database() {
    info "Initialising the database..."
    if [[ -f "${BACKEND_DIR}/alembic.ini" ]]; then
        (cd "${BACKEND_DIR}" && sudo -u "${SERVICE_USER}" "${VENV_DIR}/bin/alembic" upgrade head) \
            || warn "alembic migration skipped/failed — tables auto-create on startup"
    else
        info "No alembic config — tables auto-create on first startup"
    fi
    success "Database ready"
}

# ── 13. fail2ban ─────────────────────────────────────────────────────────────
configure_fail2ban() {
    cat > /etc/fail2ban/jail.d/sudo-pi.conf <<'F2B'
[nginx-http-auth]
enabled = true
[nginx-botsearch]
enabled = true
F2B
    systemctl enable fail2ban >/dev/null 2>&1 || true
    success "fail2ban configured"
}

# ── 14. Start everything ─────────────────────────────────────────────────────
start_services() {
    info "Starting services..."
    ip link set "${AP_INTERFACE}" up 2>/dev/null || true
    for svc in avahi-daemon hostapd dnsmasq sudo-pi-backend nginx fail2ban \
               sudo-pi-mdns sudo-pi-internet-sharing; do
        systemctl restart "${svc}" 2>/dev/null && success "${svc} started" || warn "${svc} not started (may be optional)"
    done
    bash "${REPO_DIR}/scripts/internet-sharing.sh" 2>/dev/null || \
        warn "Internet sharing will auto-apply once the Pi has an upstream connection"
}

# ── 15. Verify + summary ─────────────────────────────────────────────────────
verify_and_summary() {
    info "Verifying backend health..."
    local ok=false
    for _ in $(seq 1 15); do
        if curl -sk --max-time 3 "https://127.0.0.1/api/v1/health" | grep -q '"status"'; then
            ok=true; break
        fi
        sleep 1
    done
    $ok && success "Backend health check passed" || warn "Backend health check timed out (check: journalctl -u sudo-pi-backend -n 40)"

    echo
    echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${GREEN}║            SUDO-Pi installation complete!            ║${RESET}"
    echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
    echo
    echo -e "  ${BOLD}Dashboard:${RESET}   https://sudo.local   ${CYAN}(or https://${AP_IP})${RESET}"
    echo -e "  ${BOLD}Wi-Fi SSID:${RESET}  SUDO-Pi"
    echo -e "  ${BOLD}Login:${RESET}       admin / admin   ${YELLOW}(change this immediately)${RESET}"
    echo
    echo -e "  ${CYAN}Update later:${RESET}    sudo bash ${REPO_DIR}/update.sh"
    echo -e "  ${CYAN}Uninstall:${RESET}       sudo bash ${REPO_DIR}/uninstall.sh"
    echo
}

main() {
    banner
    install_packages
    install_nodejs
    create_service_user
    setup_dirs_and_backend
    setup_python
    build_frontend
    generate_env
    generate_cert
    configure_nginx
    configure_network
    install_services
    init_database
    configure_fail2ban
    start_services
    verify_and_summary
}

main "$@"
