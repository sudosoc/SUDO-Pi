import {
  Activity, BatteryCharging, Bell, Bluetooth,
  Box, Camera, Clock, Cpu,
  DownloadCloud, FolderOpen, Gauge, GitBranch,
  Globe, HardDrive, KeyRound, LayoutGrid,
  LockKeyhole, Monitor, MonitorPlay,
  Network, Package, Power,
  Settings, Share2, Shield, Stethoscope,
  Store, Terminal, Users, Wifi, Workflow, Wrench,
} from "lucide-react";

export interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  // ── Monitor ──────────────────────────────────────────────────────────────────
  {
    id: "monitor",
    label: "Monitor",
    icon: Activity,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    items: [
      { to: "/system",      icon: Cpu,         label: "System" },
      { to: "/timeline",    icon: Clock,       label: "Timeline",    roles: ["admin"] },
      { to: "/alerts",      icon: Bell,        label: "Alerts",      roles: ["admin"] },
      { to: "/automations", icon: Workflow,    label: "Automations", roles: ["admin"] },
      { to: "/diagnostics", icon: Stethoscope, label: "Diagnostics", roles: ["admin", "operator"] },
    ],
  },

  // ── Network ───────────────────────────────────────────────────────────────────
  {
    id: "network",
    label: "Network",
    icon: Wifi,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    items: [
      { to: "/network",          icon: Wifi,    label: "Overview" },
      { to: "/network/config",   icon: Globe,   label: "Config",        roles: ["admin"] },
      { to: "/network/remote",   icon: Network, label: "Remote Access", roles: ["admin", "operator"] },
      { to: "/network-topology", icon: Share2,  label: "Topology",      roles: ["admin", "operator"] },
      { to: "/wake-on-lan",      icon: Power,   label: "Wake-on-LAN",   roles: ["admin", "operator"] },
      { to: "/speedtest",        icon: Gauge,   label: "Speed Test" },
    ],
  },

  // ── Apps ─────────────────────────────────────────────────────────────────────
  {
    id: "apps",
    label: "Apps",
    icon: Box,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    items: [
      { to: "/services",  icon: LayoutGrid, label: "Services" },
      { to: "/docker",    icon: Box,        label: "Docker",    roles: ["admin", "operator"] },
      { to: "/app-store", icon: Store,      label: "App Store", roles: ["admin", "operator"] },
    ],
  },

  // ── Hardware ─────────────────────────────────────────────────────────────────
  {
    id: "hardware",
    label: "Hardware",
    icon: HardDrive,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    items: [
      { to: "/storage",    icon: HardDrive,       label: "Storage" },
      { to: "/gpio",       icon: GitBranch,       label: "GPIO",         roles: ["admin", "operator"] },
      { to: "/bluetooth",  icon: Bluetooth,       label: "Bluetooth" },
      { to: "/display",    icon: Monitor,         label: "Display",      roles: ["admin", "operator"] },
      { to: "/ups",        icon: BatteryCharging, label: "UPS Monitor",  roles: ["admin", "operator"] },
    ],
  },

  // ── Tools ─────────────────────────────────────────────────────────────────────
  {
    id: "tools",
    label: "Tools",
    icon: Wrench,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    items: [
      { to: "/remote-desktop", icon: MonitorPlay, label: "Remote Desktop", roles: ["admin", "operator"] },
      { to: "/terminal",       icon: Terminal,    label: "Terminal",        roles: ["admin", "operator"] },
      { to: "/files",          icon: FolderOpen,  label: "Files",           roles: ["admin", "operator"] },
      { to: "/packages",       icon: Package,     label: "Packages",        roles: ["admin", "operator"] },
      { to: "/cron",           icon: Clock,       label: "Cron Jobs",       roles: ["admin", "operator"] },
      { to: "/ssh",            icon: KeyRound,    label: "SSH",             roles: ["admin"] },
      { to: "/snapshots",      icon: Camera,      label: "Snapshots",       roles: ["admin"] },
    ],
  },

  // ── Security ──────────────────────────────────────────────────────────────────
  {
    id: "security",
    label: "Security",
    icon: Shield,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    items: [
      { to: "/security", icon: Shield,      label: "Security",  roles: ["admin"] },
      { to: "/tls",      icon: LockKeyhole, label: "TLS Certs", roles: ["admin"] },
    ],
  },

  // ── Admin ─────────────────────────────────────────────────────────────────────
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    color: "text-slate-400",
    bg: "bg-slate-400/10",
    items: [
      { to: "/users",       icon: Users,         label: "Users",       roles: ["admin"] },
      { to: "/maintenance", icon: DownloadCloud, label: "Maintenance", roles: ["admin"] },
    ],
  },
];

export function getActiveGroup(pathname: string, groups: NavGroup[]): NavGroup | null {
  if (pathname === "/") return null;
  for (const group of groups) {
    for (const item of group.items) {
      const match =
        item.to === "/docker"
          ? pathname === "/docker" || pathname.startsWith("/docker/")
          : item.to === "/network"
          ? pathname === "/network" || pathname === "/network/config" || pathname === "/network/remote"
          : pathname.startsWith(item.to);
      if (match) return group;
    }
  }
  return null;
}
