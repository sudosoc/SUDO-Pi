import { NavLink, useLocation } from "react-router-dom";
import {
  Bluetooth, Box, ChevronLeft, ChevronRight,
  Cpu, FileText, FolderOpen, GitBranch,
  Home, Package, Settings,
  Shield, Terminal, Users, Wifi, Zap, LogOut, MonitorSmartphone,
  Network, Flame, Clock, KeyRound, Activity, Bell, HardDrive, Gauge, Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", icon: Home, label: "Dashboard" },
  { to: "/system", icon: Cpu, label: "System" },
  { to: "/terminal", icon: Terminal, label: "Terminal", roles: ["admin", "operator"] },
  { to: "/files", icon: FolderOpen, label: "Files", roles: ["admin", "operator"] },
  { to: "/network", icon: Wifi, label: "Network" },
  { to: "/packages", icon: Package, label: "Packages", roles: ["admin", "operator"] },
  { to: "/docker", icon: Box, label: "Docker", roles: ["admin", "operator"] },
  { to: "/bluetooth", icon: Bluetooth, label: "Bluetooth" },
  { to: "/gpio", icon: GitBranch, label: "GPIO", roles: ["admin", "operator"] },
  { to: "/devices", icon: MonitorSmartphone, label: "Devices" },
  { to: "/logs", icon: FileText, label: "Logs" },
  { to: "/vpn", icon: Network, label: "VPN", roles: ["admin", "operator"] },
  { to: "/firewall", icon: Flame, label: "Firewall", roles: ["admin"] },
  { to: "/cron", icon: Clock, label: "Cron Jobs", roles: ["admin", "operator"] },
  { to: "/ssh", icon: KeyRound, label: "SSH", roles: ["admin"] },
  { to: "/metrics", icon: Activity, label: "Metrics" },
  { to: "/alerts", icon: Bell, label: "Alerts", roles: ["admin"] },
  { to: "/storage", icon: HardDrive, label: "Storage" },
  { to: "/speedtest", icon: Gauge, label: "Speed Test" },
  { to: "/display", icon: Monitor, label: "Display", roles: ["admin", "operator"] },
  { to: "/users", icon: Users, label: "Users", roles: ["admin"] },
  { to: "/security", icon: Shield, label: "Security", roles: ["admin"] },
  { to: "/settings", icon: Settings, label: "Settings", roles: ["admin"] },
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

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role))
  );

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
    >
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

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
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
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

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
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
