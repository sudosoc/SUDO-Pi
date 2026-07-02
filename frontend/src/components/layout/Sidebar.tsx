import { NavLink, useLocation } from "react-router-dom";
import {
  Bluetooth, Box, ChevronLeft, ChevronRight,
  Cpu, FileText, FolderOpen, GitBranch,
  Home, Package, Settings,
  Shield, Terminal, Users, Wifi, Zap, LogOut, MonitorSmartphone,
  Network, Flame, Clock, KeyRound, Activity, Bell, HardDrive,
  Monitor, Server, Gauge, BarChart2, Layers, Store, Archive, Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { useSystemStore } from "@/stores/systemStore";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/",           icon: Home,            label: "Dashboard" },
  { to: "/system",     icon: Cpu,             label: "System" },
  { to: "/processes",  icon: Server,          label: "Processes" },
  { to: "/terminal",   icon: Terminal,        label: "Terminal",   roles: ["admin", "operator"] },
  { to: "/files",      icon: FolderOpen,      label: "Files",      roles: ["admin", "operator"] },
  { to: "/network",         icon: Wifi,       label: "Network" },
  { to: "/network-traffic", icon: BarChart2, label: "Traffic Monitor" },
  { to: "/packages",   icon: Package,         label: "Packages",   roles: ["admin", "operator"] },
  { to: "/docker",         icon: Box,    label: "Docker",          roles: ["admin", "operator"] },
  { to: "/docker/compose", icon: Layers, label: "Compose",         roles: ["admin", "operator"] },
  { to: "/app-store",      icon: Store,  label: "App Store",       roles: ["admin", "operator"] },
  { to: "/bluetooth",  icon: Bluetooth,       label: "Bluetooth" },
  { to: "/gpio",       icon: GitBranch,       label: "GPIO",       roles: ["admin", "operator"] },
  { to: "/devices",    icon: MonitorSmartphone, label: "Devices" },
  { to: "/logs",       icon: FileText,        label: "Logs" },
  { to: "/vpn",        icon: Network,         label: "VPN",        roles: ["admin", "operator"] },
  { to: "/firewall",   icon: Flame,           label: "Firewall",   roles: ["admin"] },
  { to: "/cron",       icon: Clock,           label: "Cron Jobs",  roles: ["admin", "operator"] },
  { to: "/ssh",        icon: KeyRound,        label: "SSH",        roles: ["admin"] },
  { to: "/metrics",    icon: Activity,        label: "Metrics" },
  { to: "/speedtest",  icon: Gauge,           label: "Speed Test" },
  { to: "/alerts",     icon: Bell,            label: "Alerts",     roles: ["admin"] },
  { to: "/storage",    icon: HardDrive,       label: "Storage" },
  { to: "/backup",     icon: Archive,         label: "Backup",     roles: ["admin"] },
  { to: "/display",    icon: Monitor,         label: "Display",    roles: ["admin", "operator"] },
  { to: "/users",      icon: Users,           label: "Users",      roles: ["admin"] },
  { to: "/security",   icon: Shield,          label: "Security",   roles: ["admin"] },
  { to: "/diagnostics", icon: Stethoscope,    label: "Diagnostics", roles: ["admin", "operator"] },
  { to: "/settings",   icon: Settings,        label: "Settings",   roles: ["admin"] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Live mini stats bar shown in sidebar footer ──────────────────────────────
function SidebarLiveStats({ collapsed }: { collapsed: boolean }) {
  const { stats } = useSystemStore();
  if (!stats) return null;

  const cpu  = stats.cpu.percent;
  const ram  = stats.memory.percent;
  const temp = stats.temperature.cpu;

  const cpuColor  = cpu  > 80 ? "text-red-400"    : cpu  > 50 ? "text-yellow-400" : "text-green-400";
  const ramColor  = ram  > 85 ? "text-red-400"    : ram  > 65 ? "text-yellow-400" : "text-blue-400";
  const tempColor = temp ? (temp > 70 ? "text-red-400" : temp > 55 ? "text-yellow-400" : "text-cyan-400") : "text-muted-foreground";

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-2 py-2 border-t border-border/50">
        <span className={cn("text-[10px] font-bold tabular-nums leading-none", cpuColor)}>
          {cpu.toFixed(0)}%
        </span>
        <span className={cn("text-[10px] font-bold tabular-nums leading-none", ramColor)}>
          {ram.toFixed(0)}%
        </span>
        {temp != null && (
          <span className={cn("text-[10px] font-bold tabular-nums leading-none", tempColor)}>
            {temp.toFixed(0)}°
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-border/50 grid grid-cols-3 gap-1 text-center">
      <div>
        <p className={cn("text-xs font-bold tabular-nums", cpuColor)}>{cpu.toFixed(0)}%</p>
        <p className="text-[10px] text-muted-foreground">CPU</p>
      </div>
      <div>
        <p className={cn("text-xs font-bold tabular-nums", ramColor)}>{ram.toFixed(0)}%</p>
        <p className="text-[10px] text-muted-foreground">RAM</p>
      </div>
      <div>
        <p className={cn("text-xs font-bold tabular-nums", tempColor)}>
          {temp != null ? `${temp.toFixed(0)}°` : "—"}
        </p>
        <p className="text-[10px] text-muted-foreground">Temp</p>
      </div>
    </div>
  );
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

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role))
  );

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
      style={
        collapsed
          ? { zIndex: 50, overflowY: "auto", overflowX: "visible" }
          : undefined
      }
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-wide text-gradient">SUDO-Pi</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} className="ml-auto">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <Button variant="ghost" size="icon-sm" onClick={onToggle} className="mx-auto mt-2">
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}

      {/* Nav */}
      <nav
        className="flex-1 py-2 px-2 space-y-0.5"
        style={
          collapsed
            ? { overflowY: "auto", overflowX: "visible" }
            : { overflowY: "auto", overflowX: "hidden" }
        }
      >
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : item.to === "/docker"
              ? location.pathname === "/docker"
              : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "sidebar-item",
                isActive && "active",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
              data-tooltip={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Live stats (Gift 4) */}
      <SidebarLiveStats collapsed={collapsed} />

      {/* User + logout */}
      <div className="border-t border-border p-2">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-foreground truncate">{user.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "sidebar-item w-full text-destructive hover:text-destructive hover:bg-destructive/10",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Logout" : undefined}
          data-tooltip={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
