import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { MainLayout } from "@/components/layout/MainLayout";
import LoginPage from "@/pages/LoginPage";
import { ThemeProvider } from "@/contexts/ThemeContext";

// ── Dashboard ──────────────────────────────────────────────────────────────────
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));

// ── Monitor ───────────────────────────────────────────────────────────────────
const SystemHubPage    = lazy(() => import("@/pages/monitor/SystemHubPage"));
const TimelinePage     = lazy(() => import("@/pages/monitor/TimelinePage"));
const AlertsPage       = lazy(() => import("@/pages/monitor/AlertsPage"));
const AutomationsPage  = lazy(() => import("@/pages/monitor/AutomationsPage"));
const DiagnosticsPage  = lazy(() => import("@/pages/monitor/DiagnosticsPage"));

// ── Network ───────────────────────────────────────────────────────────────────
const NetworkHubPage      = lazy(() => import("@/pages/network/NetworkHubPage"));
const NetworkConfigPage   = lazy(() => import("@/pages/network/NetworkConfigPage"));
const RemoteAccessPage    = lazy(() => import("@/pages/network/RemoteAccessPage"));
const NetworkTopologyPage = lazy(() => import("@/pages/network/NetworkTopologyPage"));
const WakeOnLanPage       = lazy(() => import("@/pages/network/WakeOnLanPage"));
const SpeedTestPage       = lazy(() => import("@/pages/network/SpeedTestPage"));
const BluetoothPage       = lazy(() => import("@/pages/network/BluetoothPage"));

// ── Containers ────────────────────────────────────────────────────────────────
const ServicesPage   = lazy(() => import("@/pages/containers/ServicesPage"));
const DockerHubPage  = lazy(() => import("@/pages/containers/DockerHubPage"));
const AppStorePage   = lazy(() => import("@/pages/containers/AppStorePage"));

// ── Hardware ──────────────────────────────────────────────────────────────────
const StorageHubPage    = lazy(() => import("@/pages/hardware/StorageHubPage"));
const GpioPage          = lazy(() => import("@/pages/hardware/GpioPage"));
const DisplayPage       = lazy(() => import("@/pages/hardware/DisplayPage"));
const UpsPage           = lazy(() => import("@/pages/hardware/UpsPage"));
const RemoteDesktopPage = lazy(() => import("@/pages/hardware/RemoteDesktopPage"));

// ── Tools ─────────────────────────────────────────────────────────────────────
const TerminalPage        = lazy(() => import("@/pages/tools/TerminalPage"));
const FilesPage           = lazy(() => import("@/pages/tools/FilesPage"));
const PackagesPage        = lazy(() => import("@/pages/tools/PackagesPage"));
const CronPage            = lazy(() => import("@/pages/tools/CronPage"));
const SshPage             = lazy(() => import("@/pages/tools/SshPage"));
const SystemSnapshotsPage = lazy(() => import("@/pages/tools/SystemSnapshotsPage"));

// ── Security ──────────────────────────────────────────────────────────────────
const SecurityHubPage = lazy(() => import("@/pages/admin/SecurityHubPage"));
const TlsPage         = lazy(() => import("@/pages/admin/TlsPage"));

// ── Admin ─────────────────────────────────────────────────────────────────────
const UsersHubPage    = lazy(() => import("@/pages/admin/UsersHubPage"));
const MaintenancePage = lazy(() => import("@/pages/admin/MaintenancePage"));
const AccountPage     = lazy(() => import("@/pages/admin/AccountPage"));

// ── Auth guards ───────────────────────────────────────────────────────────────

function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <MainLayout />;
}

function AdminGuard() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
          />

          <Route element={<ProtectedLayout />}>
            {/* Dashboard */}
            <Route index element={<DashboardPage />} />

            {/* ── Monitor ── */}
            <Route path="/system"      element={<SystemHubPage />} />
            <Route path="/timeline"    element={<TimelinePage />} />
            <Route path="/alerts"      element={<AlertsPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            {/* Legacy single-page redirects → SystemHub with correct tab */}
            <Route path="/metrics"   element={<Navigate to="/system?tab=metrics"   replace />} />
            <Route path="/processes" element={<Navigate to="/system?tab=processes" replace />} />
            <Route path="/logs"      element={<Navigate to="/system?tab=logs"      replace />} />

            {/* ── Network ── */}
            <Route path="/network"           element={<NetworkHubPage />} />
            <Route path="/network/config"    element={<NetworkConfigPage />} />
            <Route path="/network/remote"    element={<RemoteAccessPage />} />
            <Route path="/network-topology"  element={<NetworkTopologyPage />} />
            <Route path="/wake-on-lan"       element={<WakeOnLanPage />} />
            <Route path="/speedtest"         element={<SpeedTestPage />} />
            <Route path="/bluetooth"         element={<BluetoothPage />} />
            {/* Legacy redirects */}
            <Route path="/devices"          element={<Navigate to="/network?tab=devices"  replace />} />
            <Route path="/network-traffic"  element={<Navigate to="/network?tab=traffic"  replace />} />
            <Route path="/network-scanner"  element={<Navigate to="/network?tab=scanner"  replace />} />
            <Route path="/dns"              element={<Navigate to="/network/config?tab=dns"     replace />} />
            <Route path="/device-control"   element={<Navigate to="/network/config?tab=control" replace />} />
            <Route path="/port-forwards"    element={<Navigate to="/network/config?tab=ports"   replace />} />
            <Route path="/vpn"              element={<Navigate to="/network/remote?tab=vpn"     replace />} />
            <Route path="/captive-portal"   element={<Navigate to="/network/remote?tab=captive" replace />} />
            <Route path="/reverse-proxy"    element={<Navigate to="/network/remote?tab=proxy"   replace />} />

            {/* ── Containers ── */}
            <Route path="/services"  element={<ServicesPage />} />
            <Route path="/docker"    element={<DockerHubPage />} />
            <Route path="/app-store" element={<AppStorePage />} />
            {/* Legacy redirect */}
            <Route path="/docker/compose" element={<Navigate to="/docker?tab=compose" replace />} />

            {/* ── Hardware ── */}
            <Route path="/storage"        element={<StorageHubPage />} />
            <Route path="/gpio"           element={<GpioPage />} />
            <Route path="/display"        element={<DisplayPage />} />
            <Route path="/ups"            element={<UpsPage />} />
            <Route path="/remote-desktop" element={<RemoteDesktopPage />} />
            {/* Legacy redirect */}
            <Route path="/smart-disk" element={<Navigate to="/storage?tab=smart" replace />} />

            {/* ── Tools ── */}
            <Route path="/terminal"  element={<TerminalPage />} />
            <Route path="/files"     element={<FilesPage />} />
            <Route path="/packages"  element={<PackagesPage />} />
            <Route path="/cron"      element={<CronPage />} />
            <Route path="/ssh"       element={<SshPage />} />
            <Route path="/snapshots" element={<SystemSnapshotsPage />} />

            {/* ── Security ── */}
            <Route path="/tls"      element={<TlsPage />} />
            <Route path="/account"  element={<AccountPage />} />
            {/* Legacy redirects */}
            <Route path="/audit-log"           element={<Navigate to="/security?tab=audit"    replace />} />
            <Route path="/firewall"            element={<Navigate to="/security?tab=firewall" replace />} />
            <Route path="/intrusion-detection" element={<Navigate to="/security"              replace />} />

            {/* ── Admin ── */}
            <Route path="/maintenance" element={<MaintenancePage />} />
            {/* Legacy redirects */}
            <Route path="/backup"   element={<Navigate to="/maintenance?tab=backups"  replace />} />
            <Route path="/updates"  element={<Navigate to="/maintenance?tab=updates"  replace />} />
            <Route path="/settings" element={<Navigate to="/maintenance?tab=settings" replace />} />
            <Route path="/system-users" element={<Navigate to="/users?tab=system" replace />} />

            <Route element={<AdminGuard />}>
              <Route path="/security" element={<SecurityHubPage />} />
              <Route path="/users"    element={<UsersHubPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
