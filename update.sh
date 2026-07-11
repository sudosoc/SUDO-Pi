#!/usr/bin/env bash
# =============================================================================
# SUDO-Pi — updater
#
#   sudo bash update.sh            # normal update
#   sudo bash update.sh --status   # print machine-readable status and exit
#
# Pulls the latest code, installs any new dependencies, rebuilds the frontend,
# syncs the backend, runs migrations, refreshes configs, and restarts services.
# Safe to run from the dashboard: progress is written to a status file + log so
# the UI can follow along even though this restarts the backend mid-run.
#
# Designed to survive its own backend restart — launch it detached from the
# dashboard via:  sudo systemd-run --unit=sudo-pi-update bash <repo>/update.sh
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${SCRIPT_DIR}"
INSTALL_DIR="/opt/sudo-pi"
BACKEND_DIR="${INSTALL_DIR}/backend"
VENV_DIR="${INSTALL_DIR}/venv"
SERVICE_USER="sudo-pi"
LOG_DIR="/var/log/sudo-pi"
STATUS_FILE="/run/sudo-pi-update.status"
LOG_FILE="${LOG_DIR}/update.log"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

# Every message goes to both the console and the persistent log.
log()  { echo -e "$*" | tee -a "${LOG_FILE}"; }
info() { log "${CYAN}[INFO]${RESET}  $*"; }
ok()   { log "${GREEN}[OK]${RESET}    $*"; }
warn() { log "${YELLOW}[WARN]${RESET}  $*"; }
err()  { log "${RED}[ERROR]${RESET} $*"; }

set_status() { echo "$1" > "${STATUS_FILE}" 2>/dev/null || true; }

# ── --status: report current progress for the dashboard, then exit ───────────
if [[ "${1:-}" == "--status" ]]; then
    echo "status=$(cat "${STATUS_FILE}" 2>/dev/null || echo idle)"
    echo "current=$(git -C "${REPO_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo "--- log tail ---"
    tail -n 40 "${LOG_FILE}" 2>/dev/null || true
    exit 0
fi

[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash update.sh"; exit 1; }

fail() { err "$*"; set_status "failed"; exit 1; }

# Fresh log for this run
: > "${LOG_FILE}"
set_status "running"
info "SUDO-Pi update started at $(date -Is)"

# ── 1. Pull latest code ──────────────────────────────────────────────────────
info "Fetching latest code..."
BEFORE="$(git -C "${REPO_DIR}" rev-parse --short HEAD 2>/dev/null || echo none)"
# Don't let stray local changes to build artefacts block the pull.
git -C "${REPO_DIR}" rev-parse --git-dir >/dev/null 2>&1 || fail "Not a git checkout: ${REPO_DIR}"
# Discard ALL local modifications to tracked files (build artefacts, scripts
# that were deleted upstream, etc.). Untracked + .gitignored files (.env,
# *.db, dist/) are never touched by checkout, so they stay intact.
git -C "${REPO_DIR}" checkout -- . 2>/dev/null || true
if ! git -C "${REPO_DIR}" pull --ff-only 2>&1 | tee -a "${LOG_FILE}"; then
    fail "git pull failed — resolve local changes and retry"
fi
AFTER="$(git -C "${REPO_DIR}" rev-parse --short HEAD)"
ok "Code at ${AFTER} (was ${BEFORE})"

# ── 2. Frontend deps + build ─────────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "${REPO_DIR}/frontend" || fail "frontend directory missing"
if ! (npm ci --no-audit --no-fund 2>&1 || npm install --no-audit --no-fund 2>&1) | tee -a "${LOG_FILE}"; then
    fail "npm install failed"
fi
info "Building frontend..."
if ! npm run build 2>&1 | tee -a "${LOG_FILE}"; then
    fail "Frontend build failed"
fi
ok "Frontend rebuilt"

# ── 3. Sync backend + Python deps ────────────────────────────────────────────
info "Syncing backend → ${BACKEND_DIR}..."
mkdir -p "${BACKEND_DIR}"
rsync -a --delete \
    --exclude '.env' --exclude '__pycache__' --exclude '*.pyc' --exclude '*.db' \
    "${REPO_DIR}/backend/app/" "${BACKEND_DIR}/app/" 2>&1 | tee -a "${LOG_FILE}"
cp "${REPO_DIR}/backend/requirements.txt" "${BACKEND_DIR}/requirements.txt"
[[ -f "${REPO_DIR}/backend/alembic.ini" ]] && cp "${REPO_DIR}/backend/alembic.ini" "${BACKEND_DIR}/" || true
[[ -d "${REPO_DIR}/backend/alembic" ]] && rsync -a "${REPO_DIR}/backend/alembic/" "${BACKEND_DIR}/alembic/" || true

if [[ -x "${VENV_DIR}/bin/pip" ]]; then
    info "Installing Python dependencies..."
    "${VENV_DIR}/bin/pip" install --quiet -r "${BACKEND_DIR}/requirements.txt" 2>&1 | tee -a "${LOG_FILE}" \
        || warn "Some Python dependencies failed to install"
else
    warn "venv not found at ${VENV_DIR} — skipping Python deps"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}" 2>/dev/null || true
ok "Backend synced"

# ── 4. Refresh managed configs (nginx root, dnsmasq conf-dir, units) ─────────
info "Refreshing system configuration..."
FRONTEND_DIST="${REPO_DIR}/frontend/dist"
if [[ -f "${REPO_DIR}/configs/nginx/sudo-pi.conf" ]]; then
    sed "s#^\( *root \).*#\1${FRONTEND_DIST};#" \
        "${REPO_DIR}/configs/nginx/sudo-pi.conf" > /etc/nginx/sites-available/sudo-pi.conf
    rm -f /etc/nginx/sites-enabled/sudo-pi   # drop any stale duplicate site
    ln -sf /etc/nginx/sites-available/sudo-pi.conf /etc/nginx/sites-enabled/sudo-pi.conf
fi
# Keep dnsmasq include dir active (ad-blocker / DNS records depend on it)
grep -q '^conf-dir=/etc/dnsmasq.d' /etc/dnsmasq.conf 2>/dev/null || \
    echo 'conf-dir=/etc/dnsmasq.d/,*.conf' >> /etc/dnsmasq.conf
# Refresh systemd units in case they changed
for unit in sudo-pi-backend sudo-pi-mdns sudo-pi-internet-sharing; do
    [[ -f "${REPO_DIR}/configs/systemd/${unit}.service" ]] && \
        cp "${REPO_DIR}/configs/systemd/${unit}.service" /etc/systemd/system/ || true
done
chmod +x "${REPO_DIR}/scripts/"*.sh 2>/dev/null || true
systemctl daemon-reload
ok "Configuration refreshed"

# ── 5. Migrations ────────────────────────────────────────────────────────────
if [[ -f "${BACKEND_DIR}/alembic.ini" ]]; then
    info "Running database migrations..."
    (cd "${BACKEND_DIR}" && sudo -u "${SERVICE_USER}" "${VENV_DIR}/bin/alembic" upgrade head 2>&1 | tee -a "${LOG_FILE}") \
        || warn "Migration step reported an issue (new tables still auto-create on startup)"
fi

# ── 6. Restart services ──────────────────────────────────────────────────────
info "Restarting backend..."
systemctl restart sudo-pi-backend
sleep 2
if systemctl is-active --quiet sudo-pi-backend; then
    ok "Backend running"
else
    fail "Backend failed to start — check: journalctl -u sudo-pi-backend -n 40"
fi
if nginx -t 2>>"${LOG_FILE}"; then
    systemctl reload nginx && ok "nginx reloaded"
else
    warn "nginx config test failed — left running on previous config"
fi
# Re-apply internet sharing rules (idempotent — safe to run while running)
if [[ -f "${REPO_DIR}/scripts/internet-sharing.sh" ]]; then
    bash "${REPO_DIR}/scripts/internet-sharing.sh" >> "${LOG_FILE}" 2>&1 \
        && ok "Internet sharing rules refreshed" \
        || warn "Internet sharing re-apply skipped (no upstream route yet)"
fi

# ── 7. Health check ──────────────────────────────────────────────────────────
for _ in $(seq 1 10); do
    if curl -sk --max-time 3 "https://127.0.0.1/api/v1/health" | grep -q '"status"'; then
        ok "Health check passed"; break
    fi
    sleep 1
done

set_status "success"
ok "Update complete — now at ${AFTER}. Hard-refresh the browser (Ctrl+Shift+R)."
