import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { MainLayout } from "@/components/layout/MainLayout";
import LoginPage from "@/pages/LoginPage";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Dashboard (root)
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));

// Monitor
const SystemPage       = lazy(() => import("@/pages/monitor/SystemPage"));
const MetricsPage      = lazy(() => import("@/pages/monitor/MetricsPage"));
const ProcessPage      = lazy(() => import("@/pages/monitor/ProcessPage"));
const LogsPage         = lazy(() => import("@/pages/monitor/LogsPage"));
const TimelinePage     = lazy(() => import("@/pages/monitor/TimelinePage"));
const AlertsPage       = lazy(() => import("@/pages/monitor/AlertsPage"));
const AutomationsPage  = lazy(() => import("@/pages/monitor/AutomationsPage"));
const DiagnosticsPage  = lazy(() => import("@/pages/monitor/DiagnosticsPage"));

// Network
const NetworkPage          = lazy(() => import("@/pages/network/NetworkPage"));
const NetworkTrafficPage   = lazy(() => import("@/pages/network/NetworkTrafficPage"));
const DevicesPage          = lazy(() => import("@/pages/network/DevicesPage"));
const DeviceControlPage    = lazy(() => import("@/pages/network/DeviceControlPage"));
const NetworkScannerPage   = lazy(() => import("@/pages/network/NetworkScannerPage"));
const NetworkTopologyPage  = lazy(() => import("@/pages/network/NetworkTopologyPage"));
const DnsPage              = lazy(() => import("@/pages/network/DnsPage"));
const VpnPage              = lazy(() => import("@/pages/network/VpnPage"));
const FirewallPage         = lazy(() => import("@/pages/network/FirewallPage"));
const CaptivePortalPage    = lazy(() => import("@/pages/network/CaptivePortalPage"));
const ReverseProxyPage     = lazy(() => import("@/pages/network/ReverseProxyPage"));
const WakeOnLanPage        = lazy(() => import("@/pages/network/WakeOnLanPage"));
const SpeedTestPage        = lazy(() => import("@/pages/network/SpeedTestPage"));
const BluetoothPage        = lazy(() => import("@/pages/network/BluetoothPage"));

// Containers & Apps
const ServicesPage      = lazy(() => import("@/pages/containers/ServicesPage"));
const DockerPage        = lazy(() => import("@/pages/containers/DockerPage"));
const DockerComposePage = lazy(() => import("@/pages/containers/DockerComposePage"));
const AppStorePage      = lazy(() => import("@/pages/containers/AppStorePage"));

// Hardware
const GpioPage          = lazy(() => import("@/pages/hardware/GpioPage"));
const StoragePage       = lazy(() => import("@/pages/hardware/StoragePage"));
const DisplayPage       = lazy(() => import("@/pages/hardware/DisplayPage"));
const SmartDiskPage     = lazy(() => import("@/pages/hardware/SmartDiskPage"));
const UpsPage           = lazy(() => import("@/pages/hardware/UpsPage"));
const RemoteDesktopPage = lazy(() => import("@/pages/hardware/RemoteDesktopPage"));

// Tools
const TerminalPage        = lazy(() => import("@/pages/tools/TerminalPage"));
const FilesPage           = lazy(() => import("@/pages/tools/FilesPage"));
const PackagesPage        = lazy(() => import("@/pages/tools/PackagesPage"));
const CronPage            = lazy(() => import("@/pages/tools/CronPage"));
const SshPage             = lazy(() => import("@/pages/tools/SshPage"));
const SystemSnapshotsPage = lazy(() => import("@/pages/tools/SystemSnapshotsPage"));

// Admin
const UsersPage             = lazy(() => import("@/pages/admin/UsersPage"));
const SystemUsersPage       = lazy(() => import("@/pages/admin/SystemUsersPage"));
const SecurityPage          = lazy(() => import("@/pages/admin/SecurityPage"));
const AuditLogPage          = lazy(() => import("@/pages/admin/AuditLogPage"));
const TlsPage               = lazy(() => import("@/pages/admin/TlsPage"));
const BackupPage            = lazy(() => import("@/pages/admin/BackupPage"));
const UpdatesPage           = lazy(() => import("@/pages/admin/UpdatesPage"));
const SettingsPage          = lazy(() => import("@/pages/admin/SettingsPage"));
const AccountPage           = lazy(() => import("@/pages/admin/AccountPage"));

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

            {/* Monitor */}
            <Route path="/system"      element={<SystemPage />} />
            <Route path="/metrics"     element={<MetricsPage />} />
            <Route path="/processes"   element={<ProcessPage />} />
            <Route path="/logs"        element={<LogsPage />} />
            <Route path="/timeline"    element={<TimelinePage />} />
            <Route path="/alerts"      element={<AlertsPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />

            {/* Network */}
            <Route path="/network"           element={<NetworkPage />} />
            <Route path="/network-traffic"   element={<NetworkTrafficPage />} />
            <Route path="/devices"           element={<DevicesPage />} />
            <Route path="/device-control"    element={<DeviceControlPage />} />
            <Route path="/network-scanner"   element={<NetworkScannerPage />} />
            <Route path="/network-topology"  element={<NetworkTopologyPage />} />
            <Route path="/dns"               element={<DnsPage />} />
            <Route path="/vpn"               element={<VpnPage />} />
            <Route path="/firewall"          element={<FirewallPage />} />
            <Route path="/captive-portal"    element={<CaptivePortalPage />} />
            <Route path="/reverse-proxy"     element={<ReverseProxyPage />} />
            <Route path="/wake-on-lan"       element={<WakeOnLanPage />} />
            <Route path="/speedtest"         element={<SpeedTestPage />} />
            <Route path="/bluetooth"         element={<BluetoothPage />} />

            {/* Containers */}
            <Route path="/services"       element={<ServicesPage />} />
            <Route path="/docker"         element={<DockerPage />} />
            <Route path="/docker/compose" element={<DockerComposePage />} />
            <Route path="/app-store"      element={<AppStorePage />} />

            {/* Hardware */}
            <Route path="/gpio"          element={<GpioPage />} />
            <Route path="/storage"       element={<StoragePage />} />
            <Route path="/display"       element={<DisplayPage />} />
            <Route path="/smart-disk"    element={<SmartDiskPage />} />
            <Route path="/ups"           element={<UpsPage />} />
            <Route path="/remote-desktop" element={<RemoteDesktopPage />} />

            {/* Tools */}
            <Route path="/terminal"  element={<TerminalPage />} />
            <Route path="/files"     element={<FilesPage />} />
            <Route path="/packages"  element={<PackagesPage />} />
            <Route path="/cron"      element={<CronPage />} />
            <Route path="/ssh"       element={<SshPage />} />
            <Route path="/snapshots" element={<SystemSnapshotsPage />} />

            {/* Admin */}
            <Route path="/tls"                  element={<TlsPage />} />
            <Route path="/backup"               element={<BackupPage />} />
            <Route path="/updates"              element={<UpdatesPage />} />
            <Route path="/settings"             element={<SettingsPage />} />
            <Route path="/account"              element={<AccountPage />} />
            <Route path="/audit-log"            element={<AuditLogPage />} />
            <Route path="/intrusion-detection"  element={<Navigate to="/security" replace />} />
            <Route element={<AdminGuard />}>
              <Route path="/users"        element={<UsersPage />} />
              <Route path="/system-users" element={<SystemUsersPage />} />
              <Route path="/security"     element={<SecurityPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
