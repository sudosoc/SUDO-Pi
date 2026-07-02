#!/usr/bin/env bash
# =============================================================================
# deploy.sh — One-command deploy for SUDO-Pi
#
# Run as root on the Pi after every git push:
#   sudo bash /SUDO-Pi/scripts/deploy.sh
#
# What it does:
#   1. git pull latest code into /SUDO-Pi
#   2. Build the frontend (tsc + vite)
#   3. Sync the backend into /opt/sudo-pi/backend (where systemd runs it from)
#   4. Install any new Python dependencies into the venv
#   5. Refresh the Nginx site config
#   6. Restart backend + reload Nginx
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[0;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}[OK]${RESET}    $*"; }
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
err()  { echo -e "${RED}[ERROR]${RESET} $*"; }

[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash $0"; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="/opt/sudo-pi"
VENV_PIP="${RUNTIME_DIR}/venv/bin/pip"

# ── 1. Pull latest code ──────────────────────────────────────────────────────
info "Pulling latest code in ${REPO_DIR}..."
git -C "${REPO_DIR}" pull --ff-only
ok "Repo up to date ($(git -C "${REPO_DIR}" rev-parse --short HEAD))"

# ── 2. Build frontend ────────────────────────────────────────────────────────
info "Building frontend..."
cd "${REPO_DIR}/frontend"
npm run build
ok "Frontend built → ${REPO_DIR}/frontend/dist"

# ── 3. Sync backend to runtime dir (systemd runs from /opt/sudo-pi/backend) ──
info "Syncing backend → ${RUNTIME_DIR}/backend..."
mkdir -p "${RUNTIME_DIR}/backend"
rsync -a --delete \
    --exclude '.env' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'sudo_pi.db' \
    --exclude '*.db' \
    "${REPO_DIR}/backend/app/" "${RUNTIME_DIR}/backend/app/"
cp "${REPO_DIR}/backend/requirements.txt" "${RUNTIME_DIR}/backend/requirements.txt"
chown -R sudo-pi:sudo-pi "${RUNTIME_DIR}/backend"
ok "Backend synced"

# ── 4. Install any new Python dependencies ──────────────────────────────────
if [[ -x "${VENV_PIP}" ]]; then
    info "Installing Python dependencies..."
    "${VENV_PIP}" install -q -r "${RUNTIME_DIR}/backend/requirements.txt"
    ok "Dependencies up to date"
else
    warn "venv pip not found at ${VENV_PIP} — skipping dependency install"
fi

# ── 5. Refresh Nginx config ──────────────────────────────────────────────────
info "Updating Nginx site config..."
cp "${REPO_DIR}/configs/nginx/sudo-pi.conf" /etc/nginx/sites-enabled/sudo-pi.conf
# Remove a stale duplicate site file (old naming without .conf) if present
if [[ -f /etc/nginx/sites-enabled/sudo-pi ]]; then
    rm /etc/nginx/sites-enabled/sudo-pi
    warn "Removed stale duplicate site file /etc/nginx/sites-enabled/sudo-pi"
fi
nginx -t
ok "Nginx config valid"

# ── 6. Restart services ──────────────────────────────────────────────────────
info "Restarting backend..."
systemctl restart sudo-pi-backend
sleep 2
if systemctl is-active --quiet sudo-pi-backend; then
    ok "Backend running"
else
    err "Backend failed to start — check: journalctl -u sudo-pi-backend -n 40"
    exit 1
fi

info "Reloading Nginx..."
systemctl reload nginx
ok "Nginx reloaded"

# ── 7. Health check ──────────────────────────────────────────────────────────
info "Verifying backend health..."
if curl -sk --max-time 5 "https://127.0.0.1/api/v1/health" | grep -q '"status"'; then
    ok "Health check passed"
else
    warn "Health check failed — backend may still be starting"
fi

echo
echo -e "${GREEN}Deploy complete!${RESET} Hard-refresh the browser (Ctrl+Shift+R) to load the new build."
