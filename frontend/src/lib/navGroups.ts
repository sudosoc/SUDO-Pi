import {
  Activity, Archive, ArrowLeftRight, BatteryCharging, Bell, Bluetooth,
  Box, BarChart2, Camera, Clock, Cpu, DoorOpen,
  DownloadCloud, FileText, Flame, FolderOpen, Gauge, GitBranch,
  Globe, HardDrive, HeartPulse, KeyRound, LayoutGrid, Layers,
  LockKeyhole, Monitor, MonitorPlay, MonitorSmartphone,
  Network, Package, Power, Radar, ScrollText, Server,
  Settings, Share2, Shield, ShieldBan, Shuffle, Stethoscope,
  Store, Terminal, UserCog, Users, Wifi, Workflow, Wrench,
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
  {
    id: "monitor",
    label: "Monitor",
    icon: Activity,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    items: [
      { to: "/system",      icon: Cpu,         label: "System" },
      { to: "/processes",   icon: Server,      label: "Processes" },
      { to: "/metrics",     icon: BarChart2,   label: "Metrics" },
      { to: "/logs",        icon: FileText,    label: "Logs" },
      { to: "/timeline",    icon: Clock,       label: "Timeline",    roles: ["admin"] },
      { to: "/alerts",      icon: Bell,        label: "Alerts",      roles: ["admin"] },
      { to: "/automations", icon: Workflow,    label: "Automations", roles: ["admin"] },
      { to: "/diagnostics", icon: Stethoscope, label: "Diagnostics", roles: ["admin", "operator"] },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: Wifi,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    items: [
      { to: "/network",          icon: Wifi,              label: "Overview" },
      { to: "/network-traffic",  icon: BarChart2,         label: "Traffic" },
      { to: "/devices",          icon: MonitorSmartphone, label: "Devices" },
      { to: "/device-control",   icon: ShieldBan,         label: "Device Control",  roles: ["admin"] },
      { to: "/network-scanner",  icon: Radar,             label: "Scanner",         roles: ["admin", "operator"] },
      { to: "/network-topology", icon: Share2,            label: "Topology",        roles: ["admin", "operator"] },
      { to: "/dns",              icon: Globe,             label: "DNS & DHCP",      roles: ["admin"] },
      { to: "/vpn",              icon: Network,           label: "VPN",             roles: ["admin", "operator"] },
      { to: "/captive-portal",   icon: DoorOpen,          label: "Captive Portal",  roles: ["admin"] },
      { to: "/reverse-proxy",    icon: ArrowLeftRight,    label: "Reverse Proxy",   roles: ["admin", "operator"] },
      { to: "/wake-on-lan",      icon: Power,             label: "Wake-on-LAN",     roles: ["admin", "operator"] },
      { to: "/port-forwards",    icon: Shuffle,           label: "Port Forwards",   roles: ["admin"] },
      { to: "/speedtest",        icon: Gauge,             label: "Speed Test" },
    ],
  },
  {
    id: "apps",
    label: "Apps",
    icon: Box,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    items: [
      { to: "/services",       icon: LayoutGrid, label: "Services" },
      { to: "/docker",         icon: Box,        label: "Docker",    roles: ["admin", "operator"] },
      { to: "/docker/compose", icon: Layers,     label: "Compose",   roles: ["admin", "operator"] },
      { to: "/app-store",      icon: Store,      label: "App Store", roles: ["admin", "operator"] },
    ],
  },
  {
    id: "hardware",
    label: "Hardware",
    icon: HardDrive,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    items: [
      { to: "/gpio",       icon: GitBranch,       label: "GPIO",         roles: ["admin", "operator"] },
      { to: "/bluetooth",  icon: Bluetooth,       label: "Bluetooth" },
      { to: "/storage",    icon: HardDrive,       label: "Storage" },
      { to: "/display",    icon: Monitor,         label: "Display",      roles: ["admin", "operator"] },
      { to: "/smart-disk", icon: HeartPulse,      label: "SMART Disks",  roles: ["admin", "operator"] },
      { to: "/ups",        icon: BatteryCharging, label: "UPS Monitor",  roles: ["admin", "operator"] },
    ],
  },
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
  {
    id: "security",
    label: "Security",
    icon: Shield,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    items: [
      { to: "/security",  icon: Shield,      label: "Overview",  roles: ["admin"] },
      { to: "/audit-log", icon: ScrollText,  label: "Audit Log", roles: ["admin"] },
      { to: "/firewall",  icon: Flame,       label: "Firewall",  roles: ["admin"] },
      { to: "/tls",       icon: LockKeyhole, label: "TLS Certs", roles: ["admin"] },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    color: "text-slate-400",
    bg: "bg-slate-400/10",
    items: [
      { to: "/users",        icon: Users,         label: "Dashboard Users", roles: ["admin"] },
      { to: "/system-users", icon: UserCog,       label: "Pi Users",        roles: ["admin"] },
      { to: "/backup",       icon: Archive,       label: "Backup",          roles: ["admin"] },
      { to: "/updates",      icon: DownloadCloud, label: "Updates",         roles: ["admin"] },
      { to: "/settings",     icon: Settings,      label: "Settings",        roles: ["admin"] },
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
          : pathname.startsWith(item.to);
      if (match) return group;
    }
  }
  return null;
}
