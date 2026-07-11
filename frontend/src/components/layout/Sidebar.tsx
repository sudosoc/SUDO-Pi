import { NavLink, useLocation, Link } from "react-router-dom";
import {
  Bluetooth, Box, ChevronLeft, ChevronRight,
  Cpu, FileText, FolderOpen, GitBranch,
  Home, Package, Settings,
  Shield, Terminal, Users, Wifi, Zap, LogOut, MonitorSmartphone,
  Network, Flame, Clock, KeyRound, Activity, Bell, HardDrive,
  Monitor, Server, Gauge, BarChart2, Layers, Store, Archive, Stethoscope,
  DownloadCloud, ShieldBan, LayoutGrid, Globe, Workflow, MonitorPlay, UserCog,
  Radar, LockKeyhole,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessPage } from "@/lib/pages";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[];
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { to: "/", icon: Home, label: "Dashboard" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { to: "/system",      icon: Cpu,         label: "System" },
      { to: "/processes",   icon: Server,      label: "Processes" },
      { to: "/metrics",     icon: Activity,    label: "Metrics" },
      { to: "/logs",        icon: FileText,    label: "Logs" },
      { to: "/alerts",      icon: Bell,        label: "Alerts",      roles: ["admin"] },
      { to: "/automations", icon: Workflow,    label: "Automations", roles: ["admin"] },
      { to: "/diagnostics", icon: Stethoscope, label: "Diagnostics", roles: ["admin", "operator"] },
    ],
  },
  {
    label: "Network",
    items: [
      { to: "/network",         icon: Wifi,              label: "Network" },
      { to: "/network-traffic", icon: BarChart2,         label: "Traffic" },
      { to: "/devices",         icon: MonitorSmartphone, label: "Devices" },
      { to: "/device-control",  icon: ShieldBan,         label: "Device Control",  roles: ["admin"] },
      { to: "/network-scanner", icon: Radar,             label: "Network Scanner", roles: ["admin", "operator"] },
      { to: "/dns",             icon: Globe,             label: "DNS & DHCP", roles: ["admin"] },
      { to: "/vpn",             icon: Network,           label: "VPN",        roles: ["admin", "operator"] },
      { to: "/firewall",        icon: Flame,             label: "Firewall",   roles: ["admin"] },
      { to: "/speedtest",       icon: Gauge,             label: "Speed Test" },
    ],
  },
  {
    label: "Apps",
    items: [
      { to: "/services",       icon: LayoutGrid, label: "Services" },
      { to: "/docker",         icon: Box,    label: "Docker",    roles: ["admin", "operator"] },
      { to: "/docker/compose", icon: Layers, label: "Compose",   roles: ["admin", "operator"] },
      { to: "/app-store",      icon: Store,  label: "App Store", roles: ["admin", "operator"] },
    ],
  },
  {
    label: "Hardware",
    items: [
      { to: "/gpio",      icon: GitBranch, label: "GPIO",      roles: ["admin", "operator"] },
      { to: "/bluetooth", icon: Bluetooth, label: "Bluetooth" },
      { to: "/storage",   icon: HardDrive, label: "Storage" },
      { to: "/display",   icon: Monitor,   label: "Display",   roles: ["admin", "operator"] },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/remote-desktop", icon: MonitorPlay, label: "Remote Desktop", roles: ["admin", "operator"] },
      { to: "/terminal", icon: Terminal,   label: "Terminal",  roles: ["admin", "operator"] },
      { to: "/files",    icon: FolderOpen, label: "Files",     roles: ["admin", "operator"] },
      { to: "/packages", icon: Package,    label: "Packages",  roles: ["admin", "operator"] },
      { to: "/cron",     icon: Clock,      label: "Cron Jobs", roles: ["admin", "operator"] },
      { to: "/ssh",      icon: KeyRound,   label: "SSH",       roles: ["admin"] },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/users",        icon: Users,        label: "Dashboard Users", roles: ["admin"] },
      { to: "/system-users", icon: UserCog,    label: "Pi Users",        roles: ["admin"] },
      { to: "/security",     icon: Shield,     label: "Security",        roles: ["admin"] },
      { to: "/tls",          icon: LockKeyhole, label: "TLS Certs",      roles: ["admin"] },
      { to: "/backup",       icon: Archive,    label: "Backup",          roles: ["admin"] },
      { to: "/updates",      icon: DownloadCloud, label: "Updates",      roles: ["admin"] },
      { to: "/settings",     icon: Settings,   label: "Settings",        roles: ["admin"] },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      logout();
      window.location.href = "/login";
    }
  };

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.roles || (user?.role && item.roles.includes(user.role))) &&
          // Per-user page restrictions (null = full access; "/" always shown)
          canAccessPage(item.to, user?.allowed_pages),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const isItemActive = (to: string) =>
    to === "/"
      ? location.pathname === "/"
      : to === "/docker"
      ? location.pathname === "/docker"
      : location.pathname.startsWith(to);

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card/60 border-r border-border/70 transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-[236px]"
      )}
      style={collapsed ? { zIndex: 50, overflowY: "visible" } : undefined}
    >
      {/* Logo */}
      <div className="flex items-center h-[52px] px-3 border-b border-border/70 shrink-0">
        <div className={cn("flex items-center gap-2.5", collapsed && "mx-auto")}>
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          {!collapsed && (
            <span className="font-bold text-[13px] tracking-wide text-gradient">SUDO-Pi</span>
          )}
        </div>
        {!collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} className="ml-auto text-muted-foreground">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <Button variant="ghost" size="icon-sm" onClick={onToggle} className="mx-auto mt-2 text-muted-foreground">
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}

      {/* Nav groups */}
      <nav
        className="flex-1 overflow-y-auto py-2"
        style={collapsed ? { overflowX: "visible" } : undefined}
      >
        {visibleGroups.map((group, gi) => (
          <div key={group.label ?? `g${gi}`}>
            {group.label && !collapsed && (
              <p className="nav-section">{group.label}</p>
            )}
            {group.label && collapsed && gi > 0 && (
              <div className="mx-3 my-2 border-t border-border/60" />
            )}
            <div className="space-y-px">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "sidebar-item",
                      active && "active",
                      collapsed && "justify-center px-0 mx-2"
                    )}
                    data-tooltip={collapsed ? item.label : undefined}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-border/70 p-2 shrink-0">
        {!collapsed && user && (
          <Link
            to="/account"
            className="flex items-center gap-2.5 px-2 py-1.5 mb-1 rounded-lg hover:bg-secondary/60 transition-colors group"
            title="My account"
          >
            <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary uppercase shrink-0 group-hover:border-primary/40 transition-colors">
              {user.username.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate leading-tight">{user.username}</p>
              <p className="text-[10px] text-muted-foreground capitalize leading-tight">{user.role}</p>
            </div>
          </Link>
        )}
        {collapsed && user && (
          <Link
            to="/account"
            className="sidebar-item justify-center px-0 mx-2 mb-1"
            data-tooltip="My account"
            title="My account"
          >
            <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary uppercase">
              {user.username.slice(0, 2)}
            </div>
          </Link>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "sidebar-item w-full text-destructive/80 hover:text-destructive hover:bg-destructive/10",
            collapsed && "justify-center px-0 mx-2"
          )}
          data-tooltip={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
