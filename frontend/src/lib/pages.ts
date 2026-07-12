// Canonical catalogue of permission-gated dashboard pages.
// Used by the per-user page-permission editor (Users page) and by the sidebar
// / route filtering. Keep the `to` paths in sync with the router + sidebar.
//
// The Dashboard ("/") is intentionally omitted: every authenticated user can
// always reach the home page, so it is never restricted.

export interface PageDef {
  to: string;
  label: string;
  group: string;
}

export const GATED_PAGES: PageDef[] = [
  // Monitor
  { to: "/system", label: "System", group: "Monitor" },
  { to: "/processes", label: "Processes", group: "Monitor" },
  { to: "/metrics", label: "Metrics", group: "Monitor" },
  { to: "/logs", label: "Logs", group: "Monitor" },
  { to: "/timeline", label: "Timeline", group: "Monitor" },
  { to: "/alerts", label: "Alerts", group: "Monitor" },
  { to: "/diagnostics", label: "Diagnostics", group: "Monitor" },
  // Network
  { to: "/network", label: "Network", group: "Network" },
  { to: "/network-traffic", label: "Traffic", group: "Network" },
  { to: "/devices", label: "Devices", group: "Network" },
  { to: "/device-control", label: "Device Control", group: "Network" },
  { to: "/network-scanner", label: "Network Scanner", group: "Network" },
  { to: "/vpn", label: "VPN", group: "Network" },
  { to: "/speedtest", label: "Speed Test", group: "Network" },
  { to: "/dns", label: "DNS", group: "Network" },
  // Apps
  { to: "/docker", label: "Docker", group: "Apps" },
  { to: "/docker/compose", label: "Compose", group: "Apps" },
  { to: "/app-store", label: "App Store", group: "Apps" },
  { to: "/services", label: "Services", group: "Apps" },
  // Hardware
  { to: "/gpio", label: "GPIO", group: "Hardware" },
  { to: "/bluetooth", label: "Bluetooth", group: "Hardware" },
  { to: "/storage", label: "Storage", group: "Hardware" },
  { to: "/display", label: "Display", group: "Hardware" },
  // Tools
  { to: "/remote-desktop", label: "Remote Desktop", group: "Tools" },
  { to: "/terminal", label: "Terminal", group: "Tools" },
  { to: "/files", label: "Files", group: "Tools" },
  { to: "/packages", label: "Packages", group: "Tools" },
  { to: "/cron", label: "Cron Jobs", group: "Tools" },
  { to: "/ssh", label: "SSH", group: "Tools" },
  { to: "/automations", label: "Automations", group: "Tools" },
  // Security
  { to: "/security", label: "Security", group: "Security" },
  { to: "/audit-log", label: "Audit Log", group: "Security" },
  { to: "/firewall", label: "Firewall", group: "Security" },
  { to: "/tls", label: "TLS Certs", group: "Security" },
  // Admin
  { to: "/users", label: "Dashboard Users", group: "Admin" },
  { to: "/system-users", label: "Pi Users", group: "Admin" },
  { to: "/backup", label: "Backup", group: "Admin" },
  { to: "/updates", label: "Updates", group: "Admin" },
  { to: "/settings", label: "Settings", group: "Admin" },
  // Network extras
  { to: "/captive-portal", label: "Captive Portal", group: "Network" },
  { to: "/network-topology", label: "Network Topology", group: "Network" },
  { to: "/wake-on-lan", label: "Wake-on-LAN", group: "Network" },
  { to: "/reverse-proxy", label: "Reverse Proxy", group: "Network" },
  { to: "/port-forwards", label: "Port Forwards", group: "Network" },
  // Hardware extras
  { to: "/smart-disk", label: "SMART Disks", group: "Hardware" },
  { to: "/ups", label: "UPS Monitor", group: "Hardware" },
  // Tools extras
  { to: "/snapshots", label: "Snapshots", group: "Tools" },
];

/**
 * Whether a user may open a given route.
 * `allowed` null/undefined = full access (default for a role). An explicit
 * list restricts to those paths; the Dashboard is always allowed.
 */
export function canAccessPage(to: string, allowed: string[] | null | undefined): boolean {
  if (allowed == null) return true;
  if (to === "/") return true;
  return allowed.includes(to);
}
