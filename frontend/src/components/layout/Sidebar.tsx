import { useState, useCallback } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import {
  Bluetooth, Box, ChevronLeft,
  Cpu, FileText, FolderOpen, GitBranch,
  Home, Package, Settings,
  Shield, Terminal, Users, Wifi, Zap, LogOut, MonitorSmartphone,
  Network, Flame, Clock, KeyRound, Activity, Bell, HardDrive,
  Monitor, Server, Gauge, BarChart2, Layers, Store, Archive, Stethoscope,
  DownloadCloud, ShieldBan, LayoutGrid, Globe, Workflow, MonitorPlay, UserCog,
  Radar, LockKeyhole,
  DoorOpen, ScrollText, ArrowLeftRight, Share2,
  Power, HeartPulse, BatteryCharging, Camera, Shuffle,
  Star,
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

function usePinnedItems() {
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("sidebar-pinned") ?? "[]") as string[]; }
    catch { return []; }
  });
  const toggle = useCallback((to: string) => {
    setPinned((prev) => {
      const next = prev.includes(to) ? prev.filter((p) => p !== to) : [...prev, to];
      localStorage.setItem("sidebar-pinned", JSON.stringify(next));
      return next;
    });
  }, []);
  return { pinned, toggle };
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
      { to: "/timeline",    icon: Clock,       label: "Timeline",    roles: ["admin"] },
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
      { to: "/network-scanner",    icon: Radar,            label: "Network Scanner",    roles: ["admin", "operator"] },
      { to: "/network-topology",   icon: Share2,           label: "Topology",           roles: ["admin", "operator"] },
      { to: "/dns",                icon: Globe,            label: "DNS & DHCP",         roles: ["admin"] },
      { to: "/vpn",                icon: Network,          label: "VPN",                roles: ["admin", "operator"] },
      { to: "/captive-portal",     icon: DoorOpen,         label: "Captive Portal",     roles: ["admin"] },
      { to: "/reverse-proxy",      icon: ArrowLeftRight,   label: "Reverse Proxy",      roles: ["admin", "operator"] },
      { to: "/wake-on-lan",        icon: Power,            label: "Wake-on-LAN",        roles: ["admin", "operator"] },
      { to: "/port-forwards",      icon: Shuffle,          label: "Port Forwards",      roles: ["admin"] },
      { to: "/speedtest",          icon: Gauge,            label: "Speed Test" },
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
      { to: "/gpio",       icon: GitBranch,    label: "GPIO",         roles: ["admin", "operator"] },
      { to: "/bluetooth",  icon: Bluetooth,    label: "Bluetooth" },
      { to: "/storage",    icon: HardDrive,    label: "Storage" },
      { to: "/display",    icon: Monitor,      label: "Display",      roles: ["admin", "operator"] },
      { to: "/smart-disk", icon: HeartPulse,   label: "SMART Disks",  roles: ["admin", "operator"] },
      { to: "/ups",        icon: BatteryCharging, label: "UPS Monitor", roles: ["admin", "operator"] },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/remote-desktop", icon: MonitorPlay, label: "Remote Desktop", roles: ["admin", "operator"] },
      { to: "/terminal", icon: Terminal,   label: "Terminal",  roles: ["admin", "operator"] },
      { to: "/files",    icon: FolderOpen, label: "Files",     roles: ["admin", "operator"] },
      { to: "/packages", icon: Package,    label: "Packages",  roles: ["admin", "operator"] },
      { to: "/cron",      icon: Clock,       label: "Cron Jobs",    roles: ["admin", "operator"] },
      { to: "/ssh",       icon: KeyRound,    label: "SSH",          roles: ["admin"] },
      { to: "/snapshots", icon: Camera,      label: "Snapshots",    roles: ["admin"] },
    ],
  },
  {
    label: "Security",
    items: [
      { to: "/security",   icon: Shield,       label: "Security",   roles: ["admin"] },
      { to: "/audit-log",  icon: ScrollText,   label: "Audit Log",  roles: ["admin"] },
      { to: "/firewall",   icon: Flame,        label: "Firewall",   roles: ["admin"] },
      { to: "/tls",        icon: LockKeyhole,  label: "TLS Certs",  roles: ["admin"] },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/users",        icon: Users,         label: "Dashboard Users",  roles: ["admin"] },
      { to: "/system-users", icon: UserCog,       label: "Pi Users",         roles: ["admin"] },
      { to: "/backup",       icon: Archive,       label: "Backup",           roles: ["admin"] },
      { to: "/updates",      icon: DownloadCloud, label: "Updates",          roles: ["admin"] },
      { to: "/settings",     icon: Settings,      label: "Settings",         roles: ["admin"] },
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
  const { pinned, toggle: togglePin } = usePinnedItems();

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      logout();
      window.location.href = "/login";
    }
  };

  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.roles || (user?.role && item.roles.includes(user.role))) &&
          canAccessPage(item.to, user?.allowed_pages),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const pinnedItems = pinned
    .map((to) => allItems.find((item) => item.to === to))
    .filter((item): item is NavItem =>
      item !== undefined &&
      (!item.roles || (user?.role ? item.roles.includes(user.role) : false)) &&
      canAccessPage(item.to, user?.allowed_pages)
    );

  const isItemActive = (to: string) =>
    to === "/"
      ? location.pathname === "/"
      : to === "/docker"
      ? location.pathname === "/docker"
      : location.pathname.startsWith(to);

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-border/50 transition-all duration-300 ease-in-out relative",
        "bg-popover/95 backdrop-blur-xl",
        collapsed ? "w-[56px]" : "w-[228px]"
      )}
      style={collapsed ? { zIndex: 50, overflowY: "visible" } : undefined}
    >
      {/* Subtle gradient stripe on right edge */}
      <div className="absolute right-0 top-0 bottom-0 w-px opacity-50"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--primary) / 0.3), transparent)" }}
      />

      {/* Logo */}
      <div className={cn(
        "flex items-center h-[52px] border-b border-border/50 shrink-0",
        collapsed ? "justify-center px-0" : "px-4"
      )}>
        {!collapsed ? (
          <>
            <Link to="/" className="flex items-center gap-2.5 flex-1 min-w-0 group">
              {/* Hexagonal icon */}
              <div className="relative w-7 h-7 shrink-0">
                <div className="absolute inset-0 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ boxShadow: "0 0 12px hsl(var(--primary) / 0.4)" }}
                />
              </div>
              <span className="font-bold text-[13px] tracking-wider text-gradient select-none">SUDO-Pi</span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggle}
              className="ml-auto text-muted-foreground/60 hover:text-foreground shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="relative w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center hover:bg-primary/25 transition-colors group"
          >
            <Zap className="w-3.5 h-3.5 text-primary" />
            <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ boxShadow: "0 0 10px hsl(var(--primary) / 0.35)" }}
            />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav
        className="flex-1 overflow-y-auto py-2 overflow-x-visible"
        style={collapsed ? { overflowX: "visible" } : undefined}
      >
        {/* Pinned group */}
        {!collapsed && pinnedItems.length > 0 && (
          <div>
            <p className="nav-section flex items-center gap-1">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              Pinned
            </p>
            <div className="space-y-px">
              {pinnedItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item.to);
                return (
                  <div key={`pin-${item.to}`} className="group/nav relative flex items-center">
                    <NavLink
                      to={item.to}
                      className={cn("sidebar-item flex-1", active && "active")}
                    >
                      <Icon className={cn("w-[15px] h-[15px] shrink-0", active ? "text-primary" : "text-muted-foreground/70")} />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                    <button
                      onClick={(e) => { e.preventDefault(); togglePin(item.to); }}
                      className="absolute right-1.5 opacity-0 group-hover/nav:opacity-100 transition-opacity p-1 rounded hover:bg-secondary/80"
                      title="Unpin"
                    >
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mx-3 my-2 border-t border-border/30" />
          </div>
        )}

        {visibleGroups.map((group, gi) => (
          <div key={group.label ?? `g${gi}`}>
            {group.label && !collapsed && (
              <p className="nav-section">{group.label}</p>
            )}
            {group.label && collapsed && gi > 0 && (
              <div className="mx-3 my-2 border-t border-border/40" />
            )}
            <div className="space-y-px">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item.to);
                const isPinned = pinned.includes(item.to);
                return collapsed ? (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn("sidebar-item", active && "active", "justify-center px-0 mx-1.5")}
                    data-tooltip={item.label}
                  >
                    <Icon className={cn("w-[15px] h-[15px] shrink-0", active ? "text-primary" : "text-muted-foreground/70")} />
                  </NavLink>
                ) : (
                  <div key={item.to} className="group/nav relative flex items-center">
                    <NavLink
                      to={item.to}
                      className={cn("sidebar-item flex-1", active && "active")}
                    >
                      <Icon className={cn("w-[15px] h-[15px] shrink-0", active ? "text-primary" : "text-muted-foreground/70")} />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                    <button
                      onClick={(e) => { e.preventDefault(); togglePin(item.to); }}
                      className={cn(
                        "absolute right-1.5 transition-opacity p-1 rounded hover:bg-secondary/80",
                        isPinned ? "opacity-100" : "opacity-0 group-hover/nav:opacity-100"
                      )}
                      title={isPinned ? "Unpin" : "Pin to top"}
                    >
                      <Star className={cn(
                        "w-3 h-3",
                        isPinned ? "text-amber-400 fill-amber-400" : "text-muted-foreground/50"
                      )} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-border/50 p-2 shrink-0 space-y-0.5">
        {!collapsed && user ? (
          <Link
            to="/account"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-secondary/60 transition-all group"
          >
            <div className="relative w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[11px] font-bold text-primary uppercase shrink-0 group-hover:border-primary/40 transition-colors">
              {user.username.slice(0, 2)}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-popover"
                style={{ boxShadow: "0 0 6px hsl(var(--success) / 0.7)" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground/90 truncate leading-tight">{user.username}</p>
              <p className="text-[10px] text-muted-foreground/70 capitalize leading-tight">{user.role}</p>
            </div>
          </Link>
        ) : collapsed && user ? (
          <Link
            to="/account"
            className="sidebar-item justify-center px-0 mx-0"
            data-tooltip="My account"
          >
            <div className="relative w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[11px] font-bold text-primary uppercase">
              {user.username.slice(0, 2)}
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-popover" />
            </div>
          </Link>
        ) : null}

        <button
          onClick={handleLogout}
          className={cn(
            "sidebar-item w-full text-destructive/60 hover:text-destructive hover:bg-destructive/8",
            collapsed && "justify-center px-0 mx-0"
          )}
          data-tooltip={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-[15px] h-[15px] shrink-0" />
          {!collapsed && <span className="text-[12.5px]">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
