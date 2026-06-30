#!/usr/bin/env bash
# =============================================================================
# SUDO-Pi Setup Script
# Fully automated, idempotent installer for Raspberry Pi 5 / Kali Linux ARM64
# Run as root: sudo bash setup.sh
# =============================================================================
set -euo pipefail

# ─── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
die()     { error "$*"; exit 1; }

# ─── Constants ───────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/sudo-pi"
SERVICE_USER="sudo-pi"
VENV_DIR="${INSTALL_DIR}/venv"
BACKEND_DIR="${INSTALL_DIR}/backend"
FRONTEND_DIR="${INSTALL_DIR}/frontend"
CERT_DIR="/etc/sudo-pi/certs"
LOG_DIR="/var/log/sudo-pi"
NGINX_CONF="/etc/nginx/sites-available/sudo-pi"
NGINX_ENABLED="/etc/nginx/sites-enabled/sudo-pi"
NM_CONF_DIR="/etc/NetworkManager/conf.d"
HOSTAPD_CONF="/etc/hostapd/hostapd.conf"
DNSMASQ_CONF="/etc/dnsmasq.conf"

AP_INTERFACE="wlan0"
INET_INTERFACE="wlan1"
AP_IP="192.168.4.1"
AP_NETWORK="192.168.4.0/24"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ─── Rollback tracking ───────────────────────────────────────────────────────
ROLLBACK_STEPS=()
rollback() {
    error "Installation failed. Rolling back..."
    for step in "${ROLLBACK_STEPS[@]}"; do
        eval "$step" 2>/dev/null || true
    done
}
trap rollback ERR

# ─── Root check ──────────────────────────────────────────────────────────────
check_root() {
    [[ $EUID -eq 0 ]] || die "This script must be run as root. Try: sudo bash $0"
}

# ─── Architecture check ──────────────────────────────────────────────────────
check_arch() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        aarch64|arm64) success "Architecture: ${arch}" ;;
        *) warn "Unexpected architecture: ${arch}. Continuing anyway." ;;
    esac
}

# ─── Check required network interfaces ───────────────────────────────────────
check_interfaces() {
    info "Checking network interfaces..."
    if ! ip link show "${AP_INTERFACE}" &>/dev/null; then
        die "Interface ${AP_INTERFACE} not found. Is the built-in Wi-Fi available?"
    fi
    success "Found ${AP_INTERFACE} (management AP)"

    if ! ip link show "${INET_INTERFACE}" &>/dev/null; then
        warn "${INET_INTERFACE} not found. Plug in the Alpha adapter before using the Wi-Fi client features."
    else
        success "Found ${INET_INTERFACE} (internet client)"
    fi
}

# ─── System update and package installation ──────────────────────────────────
install_system_packages() {
    info "Updating package index..."
    apt-get update -qq

    info "Installing system dependencies..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        python3 python3-dev python3-pip python3-venv python3-full \
        nginx \
        hostapd \
        dnsmasq \
        network-manager \
        avahi-daemon \
        avahi-utils \
        nss-mdns \
        libnss-mdns \
        curl \
        git \
        openssl \
        fail2ban \
        rfkill \
        wireless-tools \
        iw \
        bluez \
        python3-dbus \
        libssl-dev \
        libffi-dev \
        build-essential \
        nodejs \
        npm

    success "System packages installed"
}

# ─── Node.js LTS via nvm-style installer ─────────────────────────────────────
install_nodejs() {
    local required_major=20
    local current_major
    current_major=$(node --version 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)

    if [[ "$current_major" -ge "$required_major" ]]; then
        success "Node.js $(node --version) already installed"
        return
    fi

    info "Installing Node.js ${required_major}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${required_major}.x" | bash -
    apt-get install -y nodejs
    success "Node.js $(node --version) installed"
}

# ─── Create service user ──────────────────────────────────────────────────────
create_service_user() {
    if id "${SERVICE_USER}" &>/dev/null; then
        success "Service user '${SERVICE_USER}' already exists"
        return
    fi

    info "Creating service user '${SERVICE_USER}'..."
    useradd --system --no-create-home --shell /usr/sbin/nologin \
        --groups "sudo,netdev,bluetooth" "${SERVICE_USER}" || \
    useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"

    # Allow passwordless sudo for specific management commands
    cat > "/etc/sudoers.d/sudo-pi" <<'SUDOERS'
sudo-pi ALL=(ALL) NOPASSWD: \
    /usr/bin/hostnamectl set-hostname *, \
    /usr/bin/timedatectl set-timezone *, \
    /bin/systemctl start hostapd, \
    /bin/systemctl stop hostapd, \
    /bin/systemctl restart hostapd, \
    /bin/systemctl reload hostapd, \
    /bin/systemctl start dnsmasq, \
    /bin/systemctl stop dnsmasq, \
    /bin/systemctl restart dnsmasq, \
    /bin/systemctl start *, \
    /bin/systemctl stop *, \
    /bin/systemctl restart *, \
    /sbin/reboot, \
    /sbin/shutdown
SUDOERS
    chmod 440 "/etc/sudoers.d/sudo-pi"
    ROLLBACK_STEPS+=("userdel ${SERVICE_USER}" "rm -f /etc/sudoers.d/sudo-pi")
    success "Service user created"
}

# ─── Directory structure ──────────────────────────────────────────────────────
create_directories() {
    info "Creating directory structure..."
    mkdir -p "${INSTALL_DIR}" "${CERT_DIR}" "${LOG_DIR}" "${NM_CONF_DIR}"
    chown "${SERVICE_USER}:${SERVICE_USER}" "${LOG_DIR}" 2>/dev/null || true
    success "Directories created"
}

# ─── Copy application files ───────────────────────────────────────────────────
copy_application() {
    info "Copying application files to ${INSTALL_DIR}..."
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='__pycache__' \
        --exclude='*.pyc' --exclude='.env' \
        "${REPO_DIR}/backend/" "${BACKEND_DIR}/"
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' \
        "${REPO_DIR}/frontend/" "${FRONTEND_DIR}/"

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"
    success "Application files copied"
}

# ─── Python virtual environment and dependencies ─────────────────────────────
setup_python_venv() {
    if [[ -d "${VENV_DIR}" ]]; then
        info "Python venv already exists, updating dependencies..."
    else
        info "Creating Python virtual environment..."
        python3 -m venv "${VENV_DIR}"
        ROLLBACK_STEPS+=("rm -rf ${VENV_DIR}")
    fi

    info "Installing Python dependencies..."
    "${VENV_DIR}/bin/pip" install --quiet --upgrade pip
    "${VENV_DIR}/bin/pip" install --quiet -r "${BACKEND_DIR}/requirements.txt"

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${VENV_DIR}"
    success "Python dependencies installed"
}

# ─── Frontend build ───────────────────────────────────────────────────────────
build_frontend() {
    info "Installing frontend npm dependencies..."
    cd "${FRONTEND_DIR}"
    npm ci --silent

    info "Building frontend..."
    npm run build -- --mode production

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${FRONTEND_DIR}/dist"
    success "Frontend built"
}

# ─── Generate .env if missing ─────────────────────────────────────────────────
generate_env() {
    local env_file="${BACKEND_DIR}/.env"
    if [[ -f "${env_file}" ]]; then
        success ".env already exists, skipping"
        return
    fi

    info "Generating .env file..."
    local secret_key
    secret_key=$(openssl rand -hex 32)

    cat > "${env_file}" <<ENV
SECRET_KEY=${secret_key}
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=sqlite+aiosqlite:///./sudo_pi.db
AP_INTERFACE=wlan0
INET_INTERFACE=wlan1
AP_IP=192.168.4.1
AP_SSID=SUDO-Pi
AP_PASSWORD=sudopi2024
HOSTAPD_CONF_PATH=/etc/hostapd/hostapd.conf
DNSMASQ_CONF_PATH=/etc/dnsmasq.conf
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
LOG_DIR=/var/log/sudo-pi
SYSTEM_METRICS_INTERVAL=3
ENV

    chmod 600 "${env_file}"
    chown "${SERVICE_USER}:${SERVICE_USER}" "${env_file}"
    ROLLBACK_STEPS+=("rm -f ${env_file}")
    success ".env generated (change ADMIN_PASSWORD on first login!)"
}

# ─── Self-signed TLS certificate ─────────────────────────────────────────────
generate_certificates() {
    local crt="${CERT_DIR}/server.crt"
    local key="${CERT_DIR}/server.key"

    if [[ -f "${crt}" && -f "${key}" ]]; then
        success "TLS certificates already exist"
        return
    fi

    info "Generating self-signed TLS certificate..."
    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:4096 \
        -keyout "${key}" \
        -out "${crt}" \
        -subj "/C=US/ST=Local/L=Local/O=SUDO-Pi/CN=sudopi.local" \
        -addext "subjectAltName=DNS:sudopi.local,DNS:sudo-pi.local,DNS:localhost,IP:192.168.4.1"

    chmod 600 "${key}"
    chmod 644 "${crt}"
    ROLLBACK_STEPS+=("rm -f ${crt} ${key}")
    success "TLS certificate generated (10-year validity)"
}

# ─── Configure hostname + mDNS (sudopi.local) ────────────────────────────────
configure_mdns() {
    info "Setting hostname to 'sudopi' and configuring mDNS..."

    # Set hostname
    hostnamectl set-hostname sudopi
    echo "sudopi" > /etc/hostname

    # Update /etc/hosts — replace old hostname entry, add sudopi if missing
    sed -i "s/127\.0\.1\.1.*/127.0.1.1\tsudopi/" /etc/hosts
    if ! grep -q "127.0.1.1.*sudopi" /etc/hosts; then
        echo "127.0.1.1    sudopi sudopi.local" >> /etc/hosts
    fi

    # Configure nsswitch.conf to resolve .local via mDNS
    # Insert mdns4_minimal before dns (and before resolve if present)
    if ! grep -q "mdns4_minimal" /etc/nsswitch.conf; then
        sed -i 's/^\(hosts:.*\)\(files\)\(.*\)\(dns\)/\1\2\3mdns4_minimal [NOTFOUND=return] \4/' \
            /etc/nsswitch.conf 2>/dev/null || true
        # Fallback: if above didn't work, just append mdns4_minimal
        if ! grep -q "mdns4_minimal" /etc/nsswitch.conf; then
            sed -i 's/^hosts:.*/hosts:          files mdns4_minimal [NOTFOUND=return] dns/' \
                /etc/nsswitch.conf
        fi
    fi

    # Avahi service advertisement — exposes sudopi.local on the network
    mkdir -p /etc/avahi/services
    cat > /etc/avahi/services/sudo-pi.service <<'AVAHI'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">SUDO-Pi Dashboard (%h)</name>
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

    # Configure avahi to only advertise on AP interface
    if [[ -f /etc/avahi/avahi-daemon.conf ]]; then
        sed -i "s/^#*allow-interfaces=.*/allow-interfaces=${AP_INTERFACE},lo/" \
            /etc/avahi/avahi-daemon.conf
        sed -i "s/^#*deny-interfaces=.*/deny-interfaces=${INET_INTERFACE}/" \
            /etc/avahi/avahi-daemon.conf
    fi

    systemctl enable avahi-daemon
    systemctl restart avahi-daemon 2>/dev/null || true

    success "mDNS configured — accessible at https://sudopi.local"
}

# ─── Configure NetworkManager to ignore wlan0 ────────────────────────────────
configure_networkmanager() {
    local conf="${NM_CONF_DIR}/99-sudo-pi-unmanaged.conf"
    info "Configuring NetworkManager to ignore ${AP_INTERFACE}..."
    cat > "${conf}" <<NM
[keyfile]
unmanaged-devices=interface-name:${AP_INTERFACE}
NM
    success "NetworkManager will not manage ${AP_INTERFACE}"

    systemctl is-active NetworkManager &>/dev/null && systemctl reload NetworkManager || true
}

# ─── Configure hostapd ────────────────────────────────────────────────────────
configure_hostapd() {
    info "Configuring hostapd..."
    cp "${REPO_DIR}/configs/hostapd/hostapd.conf" "${HOSTAPD_CONF}"

    # Tell hostapd daemon which config to use
    if [[ -f /etc/default/hostapd ]]; then
        sed -i 's|#DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
    fi

    # Unmask and enable
    systemctl unmask hostapd 2>/dev/null || true
    systemctl enable hostapd
    success "hostapd configured"
}

# ─── Configure dnsmasq ────────────────────────────────────────────────────────
configure_dnsmasq() {
    info "Configuring dnsmasq..."

    # Back up original if present and not already backed up
    [[ -f "${DNSMASQ_CONF}" && ! -f "${DNSMASQ_CONF}.bak" ]] && \
        cp "${DNSMASQ_CONF}" "${DNSMASQ_CONF}.bak"

    cp "${REPO_DIR}/configs/dnsmasq/dnsmasq.conf" "${DNSMASQ_CONF}"
    systemctl enable dnsmasq
    success "dnsmasq configured"
}

# ─── Configure static IP on wlan0 via systemd-networkd or ip command ─────────
configure_ap_static_ip() {
    info "Setting static IP ${AP_IP} on ${AP_INTERFACE}..."

    # Use a networkd .network file if systemd-networkd is active, else fall back to ip
    if systemctl is-enabled systemd-networkd &>/dev/null; then
        cat > "/etc/systemd/network/10-${AP_INTERFACE}-static.network" <<NET
[Match]
Name=${AP_INTERFACE}

[Network]
Address=${AP_IP}/24
NET
        systemctl restart systemd-networkd || true
    fi

    # Ensure the IP is set right now regardless
    ip addr flush dev "${AP_INTERFACE}" 2>/dev/null || true
    ip addr add "${AP_IP}/24" dev "${AP_INTERFACE}" 2>/dev/null || true
    ip link set "${AP_INTERFACE}" up 2>/dev/null || true

    success "Static IP configured on ${AP_INTERFACE}"
}

# ─── Enable IP forwarding ─────────────────────────────────────────────────────
enable_ip_forwarding() {
    info "Enabling IP forwarding..."
    sysctl -w net.ipv4.ip_forward=1 > /dev/null

    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi
    success "IP forwarding enabled"
}

# ─── Configure NAT (AP clients share wlan1 internet) ─────────────────────────
configure_nat() {
    info "Configuring iptables NAT for AP clients..."

    # Flush existing MASQUERADE rules for this subnet to avoid duplicates
    iptables -t nat -D POSTROUTING -s "${AP_NETWORK}" -o "${INET_INTERFACE}" -j MASQUERADE 2>/dev/null || true
    iptables -t nat -A POSTROUTING -s "${AP_NETWORK}" -o "${INET_INTERFACE}" -j MASQUERADE

    iptables -D FORWARD -i "${AP_INTERFACE}" -o "${INET_INTERFACE}" -j ACCEPT 2>/dev/null || true
    iptables -A FORWARD -i "${AP_INTERFACE}" -o "${INET_INTERFACE}" -j ACCEPT
    iptables -D FORWARD -i "${INET_INTERFACE}" -o "${AP_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
    iptables -A FORWARD -i "${INET_INTERFACE}" -o "${AP_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT

    # Persist across reboots
    if command -v iptables-save &>/dev/null; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || \
        iptables-save > /etc/iptables.rules 2>/dev/null || true
    fi

    success "NAT rules applied"
}

# ─── Configure nginx ──────────────────────────────────────────────────────────
configure_nginx() {
    info "Configuring nginx..."
    cp "${REPO_DIR}/configs/nginx/sudo-pi.conf" "${NGINX_CONF}"

    # Remove default site if it exists
    rm -f /etc/nginx/sites-enabled/default

    # Enable our site
    ln -sf "${NGINX_CONF}" "${NGINX_ENABLED}"

    nginx -t || die "nginx config test failed"
    systemctl enable nginx
    ROLLBACK_STEPS+=("rm -f ${NGINX_CONF} ${NGINX_ENABLED}")
    success "nginx configured"
}

# ─── Install systemd service units ───────────────────────────────────────────
install_systemd_services() {
    info "Installing systemd service units..."

    local backend_service="/etc/systemd/system/sudo-pi-backend.service"
    cp "${REPO_DIR}/configs/systemd/sudo-pi-backend.service" "${backend_service}"

    systemctl daemon-reload
    systemctl enable sudo-pi-backend
    ROLLBACK_STEPS+=("systemctl disable sudo-pi-backend" "rm -f ${backend_service}")
    success "Systemd services installed"
}

# ─── Configure Fail2Ban ───────────────────────────────────────────────────────
configure_fail2ban() {
    info "Configuring Fail2Ban..."

    cat > /etc/fail2ban/jail.d/sudo-pi.conf <<'F2B'
[sudo-pi-auth]
enabled  = true
port     = http,https
filter   = sudo-pi-auth
logpath  = /var/log/sudo-pi/audit.log
maxretry = 5
findtime = 600
bantime  = 900

[nginx-http-auth]
enabled  = true

[nginx-botsearch]
enabled  = true
F2B

    cat > /etc/fail2ban/filter.d/sudo-pi-auth.conf <<'FILTER'
[Definition]
failregex = ^.*"status": "failure".*"action": "login".*"ip_address": "<HOST>".*$
ignoreregex =
FILTER

    systemctl enable fail2ban 2>/dev/null || true
    success "Fail2Ban configured"
}

# ─── Initialize database via Alembic migrations ───────────────────────────────
initialize_database() {
    info "Running database migrations..."
    cd "${BACKEND_DIR}"

    # Run alembic migrations (idempotent: 'upgrade head' is safe to run multiple times)
    sudo -u "${SERVICE_USER}" "${VENV_DIR}/bin/alembic" upgrade head

    success "Database schema up to date"
}

# ─── Start all services ───────────────────────────────────────────────────────
start_services() {
    info "Starting services..."

    # Order matters: interface up → hostapd → dnsmasq → backend → nginx
    ip link set "${AP_INTERFACE}" up 2>/dev/null || true

    systemctl restart avahi-daemon && success "avahi-daemon started" || warn "avahi-daemon failed to start"
    systemctl restart hostapd    && success "hostapd started"    || warn "hostapd failed to start"
    systemctl restart dnsmasq    && success "dnsmasq started"    || warn "dnsmasq failed to start"
    systemctl restart sudo-pi-backend && success "Backend started" || warn "Backend failed to start"
    systemctl restart nginx      && success "nginx started"      || warn "nginx failed to start"
    systemctl restart fail2ban   && success "Fail2Ban started"   || warn "Fail2Ban failed to start"
}

# ─── Verify installation ──────────────────────────────────────────────────────
verify_installation() {
    info "Verifying installation..."
    local ok=true

    check_service() {
        if systemctl is-active --quiet "$1"; then
            success "$1 is running"
        else
            error "$1 is NOT running"
            ok=false
        fi
    }

    check_service avahi-daemon
    check_service hostapd
    check_service dnsmasq
    check_service sudo-pi-backend
    check_service nginx

    # Wait up to 15s for the backend health endpoint
    local attempts=0
    while [[ $attempts -lt 15 ]]; do
        if curl -sk "https://127.0.0.1/api/v1/health" | grep -q '"status"'; then
            success "Backend health check passed"
            break
        fi
        attempts=$((attempts + 1))
        sleep 1
    done
    if [[ $attempts -eq 15 ]]; then
        warn "Backend health check timed out (may still be starting)"
    fi

    $ok && success "All checks passed" || warn "Some checks failed — review output above"
}

# ─── Print summary ────────────────────────────────────────────────────────────
print_summary() {
    echo
    echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${GREEN}║           SUDO-Pi Installation Complete!             ║${RESET}"
    echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
    echo
    echo -e "  ${BOLD}Dashboard URL:${RESET}  https://sudopi.local  ${CYAN}(via mDNS)${RESET}"
    echo -e "  ${BOLD}Direct IP:${RESET}      https://${AP_IP}"
    echo -e "  ${BOLD}AP SSID:${RESET}        SUDO-Pi"
    echo -e "  ${BOLD}AP Password:${RESET}    sudopi2024"
    echo -e "  ${BOLD}Admin Login:${RESET}    admin / admin"
    echo
    echo -e "  ${YELLOW}⚠  Change the default admin password immediately after first login!${RESET}"
    echo
    echo -e "  ${CYAN}Service status:${RESET}"
    echo -e "    systemctl status sudo-pi-backend"
    echo -e "    systemctl status hostapd"
    echo -e "    systemctl status nginx"
    echo
    echo -e "  ${CYAN}Logs:${RESET}"
    echo -e "    journalctl -u sudo-pi-backend -f"
    echo -e "    tail -f /var/log/sudo-pi/audit.log"
    echo
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo -e "${BOLD}${CYAN}"
    echo "  ███████╗██╗   ██╗██████╗  ██████╗       ██████╗ ██╗"
    echo "  ██╔════╝██║   ██║██╔══██╗██╔═══██╗      ██╔══██╗██║"
    echo "  ███████╗██║   ██║██║  ██║██║   ██║█████╗██████╔╝██║"
    echo "  ╚════██║██║   ██║██║  ██║██║   ██║╚════╝██╔═══╝ ██║"
    echo "  ███████║╚██████╔╝██████╔╝╚██████╔╝      ██║     ██║"
    echo "  ╚══════╝ ╚═════╝ ╚═════╝  ╚═════╝       ╚═╝     ╚═╝"
    echo -e "${RESET}"
    echo -e "  ${BOLD}Raspberry Pi 5 Management Dashboard Installer${RESET}"
    echo

    check_root
    check_arch
    check_interfaces
    install_system_packages
    install_nodejs
    create_service_user
    create_directories
    copy_application
    setup_python_venv
    build_frontend
    generate_env
    generate_certificates
    configure_mdns
    configure_networkmanager
    configure_hostapd
    configure_dnsmasq
    configure_ap_static_ip
    enable_ip_forwarding
    configure_nat
    configure_nginx
    install_systemd_services
    configure_fail2ban
    initialize_database
    start_services
    verify_installation
    print_summary
}

main "$@"
