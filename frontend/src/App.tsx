import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { MainLayout } from "@/components/layout/MainLayout";
import LoginPage from "@/pages/LoginPage";
import { ThemeProvider } from "@/contexts/ThemeContext";

const DashboardPage   = lazy(() => import("@/pages/DashboardPage"));
const SystemPage      = lazy(() => import("@/pages/SystemPage"));
const TerminalPage    = lazy(() => import("@/pages/TerminalPage"));
const FilesPage       = lazy(() => import("@/pages/FilesPage"));
const NetworkPage     = lazy(() => import("@/pages/NetworkPage"));
const PackagesPage    = lazy(() => import("@/pages/PackagesPage"));
const DockerPage      = lazy(() => import("@/pages/DockerPage"));
const BluetoothPage   = lazy(() => import("@/pages/BluetoothPage"));
const GpioPage        = lazy(() => import("@/pages/GpioPage"));
const UsersPage       = lazy(() => import("@/pages/UsersPage"));
const SecurityPage    = lazy(() => import("@/pages/SecurityPage"));
const SettingsPage    = lazy(() => import("@/pages/SettingsPage"));
const DevicesPage     = lazy(() => import("@/pages/DevicesPage"));
const LogsPage        = lazy(() => import("@/pages/LogsPage"));
const VpnPage         = lazy(() => import("@/pages/VpnPage"));
const FirewallPage    = lazy(() => import("@/pages/FirewallPage"));
const CronPage        = lazy(() => import("@/pages/CronPage"));
const SshPage         = lazy(() => import("@/pages/SshPage"));
const MetricsPage     = lazy(() => import("@/pages/MetricsPage"));
const AlertsPage      = lazy(() => import("@/pages/AlertsPage"));
const StoragePage     = lazy(() => import("@/pages/StoragePage"));
const DisplayPage     = lazy(() => import("@/pages/DisplayPage"));
const ProcessPage     = lazy(() => import("@/pages/ProcessPage"));
const SpeedTestPage       = lazy(() => import("@/pages/SpeedTestPage"));
const NetworkTrafficPage  = lazy(() => import("@/pages/NetworkTrafficPage"));
const DockerComposePage   = lazy(() => import("@/pages/DockerComposePage"));
const AppStorePage        = lazy(() => import("@/pages/AppStorePage"));
const BackupPage          = lazy(() => import("@/pages/BackupPage"));
const DiagnosticsPage     = lazy(() => import("@/pages/DiagnosticsPage"));
const NetworkScannerPage  = lazy(() => import("@/pages/NetworkScannerPage"));
const TlsPage             = lazy(() => import("@/pages/TlsPage"));
const UpdatesPage         = lazy(() => import("@/pages/UpdatesPage"));
const DeviceControlPage   = lazy(() => import("@/pages/DeviceControlPage"));
const RemoteDesktopPage   = lazy(() => import("@/pages/RemoteDesktopPage"));
const SystemUsersPage     = lazy(() => import("@/pages/SystemUsersPage"));
const ServicesPage        = lazy(() => import("@/pages/ServicesPage"));
const DnsPage             = lazy(() => import("@/pages/DnsPage"));
const AutomationsPage     = lazy(() => import("@/pages/AutomationsPage"));
const AccountPage             = lazy(() => import("@/pages/AccountPage"));
const CaptivePortalPage       = lazy(() => import("@/pages/CaptivePortalPage"));
const AuditLogPage            = lazy(() => import("@/pages/AuditLogPage"));
const ReverseProxyPage        = lazy(() => import("@/pages/ReverseProxyPage"));
const IntrusionDetectionPage  = lazy(() => import("@/pages/IntrusionDetectionPage"));
const NetworkTopologyPage     = lazy(() => import("@/pages/NetworkTopologyPage"));
const WakeOnLanPage           = lazy(() => import("@/pages/WakeOnLanPage"));
const SmartDiskPage           = lazy(() => import("@/pages/SmartDiskPage"));
const UpsPage                 = lazy(() => import("@/pages/UpsPage"));
const SystemSnapshotsPage     = lazy(() => import("@/pages/SystemSnapshotsPage"));
const ScriptRunnerPage        = lazy(() => import("@/pages/ScriptRunnerPage"));

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
            <Route index element={<DashboardPage />} />
            <Route path="/system"    element={<SystemPage />} />
            <Route path="/terminal"  element={<TerminalPage />} />
            <Route path="/files"     element={<FilesPage />} />
            <Route path="/network"   element={<NetworkPage />} />
            <Route path="/packages"  element={<PackagesPage />} />
            <Route path="/docker"    element={<DockerPage />} />
            <Route path="/bluetooth" element={<BluetoothPage />} />
            <Route path="/gpio"      element={<GpioPage />} />
            <Route path="/devices"   element={<DevicesPage />} />
            <Route path="/logs"      element={<LogsPage />} />
            <Route path="/settings"  element={<SettingsPage />} />
            <Route path="/vpn"       element={<VpnPage />} />
            <Route path="/firewall"  element={<FirewallPage />} />
            <Route path="/cron"      element={<CronPage />} />
            <Route path="/ssh"       element={<SshPage />} />
            <Route path="/metrics"   element={<MetricsPage />} />
            <Route path="/alerts"    element={<AlertsPage />} />
            <Route path="/storage"    element={<StoragePage />} />
            <Route path="/display"    element={<DisplayPage />} />
            <Route path="/processes"  element={<ProcessPage />} />
            <Route path="/speedtest"       element={<SpeedTestPage />} />
            <Route path="/network-traffic" element={<NetworkTrafficPage />} />
            <Route path="/docker/compose" element={<DockerComposePage />} />
            <Route path="/app-store"      element={<AppStorePage />} />
            <Route path="/backup"         element={<BackupPage />} />
          <Route path="/diagnostics"    element={<DiagnosticsPage />} />
          <Route path="/network-scanner" element={<NetworkScannerPage />} />
          <Route path="/tls"            element={<TlsPage />} />
          <Route path="/updates"        element={<UpdatesPage />} />
          <Route path="/device-control" element={<DeviceControlPage />} />
          <Route path="/remote-desktop" element={<RemoteDesktopPage />} />
          <Route path="/services"       element={<ServicesPage />} />
          <Route path="/dns"            element={<DnsPage />} />
          <Route path="/automations"    element={<AutomationsPage />} />
          <Route path="/account"             element={<AccountPage />} />
          <Route path="/captive-portal"    element={<CaptivePortalPage />} />
          <Route path="/audit-log"         element={<AuditLogPage />} />
          <Route path="/reverse-proxy"     element={<ReverseProxyPage />} />
          <Route path="/intrusion-detection" element={<IntrusionDetectionPage />} />
          <Route path="/network-topology"  element={<NetworkTopologyPage />} />
          <Route path="/wake-on-lan"       element={<WakeOnLanPage />} />
          <Route path="/smart-disk"        element={<SmartDiskPage />} />
          <Route path="/ups"               element={<UpsPage />} />
          <Route path="/snapshots"         element={<SystemSnapshotsPage />} />
          <Route path="/scripts"           element={<ScriptRunnerPage />} />
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
