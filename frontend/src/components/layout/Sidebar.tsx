import { useState, useMemo, useCallback, useEffect } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import {
  Activity, Archive, ArrowLeftRight, BatteryCharging, Bell, Bluetooth,
  Box, BarChart2, Camera, ChevronDown, ChevronLeft, Clock, Cpu, DoorOpen,
  DownloadCloud, FileText, Flame, FolderOpen, Gauge, GitBranch,
  Globe, HardDrive, HeartPulse, Home, KeyRound, LayoutGrid, Layers,
  LockKeyhole, LogOut, Monitor, MonitorPlay, MonitorSmartphone,
  Network, Package, Power, Radar, ScrollText, Search, Server,
  Settings, Share2, Shield, ShieldBan, Shuffle, Star, Stethoscope,
  Store, Terminal, UserCog, Users, Wifi, Workflow, Wrench, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessPage } from "@/lib/pages";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[];
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  items: NavItem[];
}

// ─── Navigation Data ───────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
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

// ─── Hooks ─────────────────────────────────────────────────────────────────────

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

function useExpandedGroups(allIds: string[]) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sidebar-groups-open") ?? "null") as string[] | null;
      return saved ? new Set(saved) : new Set(allIds);
    } catch {
      return new Set(allIds);
    }
  });
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("sidebar-groups-open", JSON.stringify([...next]));
      return next;
    });
  }, []);
  return { expanded, toggle };
}

// ─── NavGroupSection (expanded mode) ──────────────────────────────────────────

function NavGroupSection({
  group,
  isOpen,
  onToggle,
  query,
  isItemActive,
  pinned,
  togglePin,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  query: string;
  isItemActive: (to: string) => boolean;
  pinned: string[];
  togglePin: (to: string) => void;
}) {
  const GroupIcon = group.icon;
  const showOpen = query ? true : isOpen;

  const visibleItems = query
    ? group.items.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : group.items;

  if (visibleItems.length === 0) return null;

  return (
    <div>
      {/* ── Group Header ── */}
      <button
        onClick={onToggle}
        className="group/gh w-full flex items-center gap-2 px-3 py-[6px] transition-colors hover:bg-secondary/25 rounded-none"
      >
        <div className={cn(
          "w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0",
          group.bg,
        )}>
          <GroupIcon className={cn("w-[10px] h-[10px]", group.color)} />
        </div>
        <span className="flex-1 text-left text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground/50 group-hover/gh:text-muted-foreground/80 transition-colors select-none">
          {group.label}
        </span>
        <span className="text-[9px] tabular-nums text-muted-foreground/25 mr-1">
          {visibleItems.length}
        </span>
        <ChevronDown
          className={cn(
            "w-[11px] h-[11px] text-muted-foreground/25 transition-transform duration-200 ease-in-out",
            showOpen && "rotate-180",
          )}
        />
      </button>

      {/* ── Items (height-animated) ── */}
      <div
        style={{
          maxHeight: showOpen ? `${visibleItems.length * 34 + 10}px` : "0px",
          overflow: "hidden",
          transition: "max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="pt-px pb-2">
          {visibleItems.map((item) => {
            const ItemIcon = item.icon;
            const active = isItemActive(item.to);
            const isPinned = pinned.includes(item.to);
            return (
              <div key={item.to} className="group/ni relative flex items-center">
                {active && (
                  <div className="absolute left-0 top-[5px] bottom-[5px] w-[2px] rounded-full bg-primary" />
                )}
                <NavLink
                  to={item.to}
                  className={cn(
                    "flex-1 flex items-center gap-2.5 pl-[28px] pr-8 py-[7px] text-[12px] transition-all duration-150 leading-none",
                    active
                      ? "font-semibold text-primary bg-gradient-to-r from-primary/[0.11] via-primary/[0.05] to-transparent"
                      : "font-medium text-muted-foreground/65 hover:text-foreground/85 hover:bg-secondary/30",
                  )}
                >
                  <ItemIcon
                    className={cn(
                      "w-[12px] h-[12px] shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground/40",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </NavLink>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(item.to); }}
                  className={cn(
                    "absolute right-2 p-0.5 rounded transition-opacity",
                    isPinned
                      ? "opacity-100"
                      : "opacity-0 group-hover/ni:opacity-50 hover:!opacity-100",
                  )}
                  title={isPinned ? "Unpin" : "Pin to top"}
                >
                  <Star className={cn(
                    "w-[9px] h-[9px]",
                    isPinned ? "text-amber-400 fill-amber-400" : "text-muted-foreground/50",
                  )} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CollapsedGroupTile (collapsed mode, with hover flyout) ───────────────────

function CollapsedGroupTile({
  group,
  isItemActive,
}: {
  group: NavGroup;
  isItemActive: (to: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const GroupIcon = group.icon;
  const hasActive = group.items.some((item) => isItemActive(item.to));

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Group icon button */}
      <div
        className={cn(
          "mx-auto w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all",
          hasActive
            ? cn(group.bg, "ring-1 ring-inset ring-white/10")
            : "hover:bg-secondary/50",
        )}
      >
        {hasActive && (
          <div className="absolute left-0 inset-y-1.5 w-[2px] rounded-full bg-primary" />
        )}
        <GroupIcon
          className={cn(
            "w-[15px] h-[15px] transition-colors",
            hasActive ? group.color : "text-muted-foreground/50",
          )}
        />
      </div>

      {/* Hover flyout panel */}
      {open && (
        <div className="absolute left-[calc(100%+10px)] top-0 w-52 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl z-[200] overflow-hidden">
          <div className={cn("flex items-center gap-2 px-3 py-2 border-b border-border/30", group.bg)}>
            <GroupIcon className={cn("w-[12px] h-[12px]", group.color)} />
            <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground/70">
              {group.label}
            </span>
          </div>
          <div className="py-1.5">
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              const active = isItemActive(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 mx-1.5 px-2.5 py-[7px] rounded-lg text-[12px] font-medium transition-colors",
                    active
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/50",
                  )}
                >
                  <ItemIcon
                    className={cn(
                      "w-[12px] h-[12px] shrink-0",
                      active ? "text-primary" : "text-muted-foreground/40",
                    )}
                  />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const { pinned, toggle: togglePin } = usePinnedItems();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (collapsed) setSearchQuery("");
  }, [collapsed]);

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      logout();
      window.location.href = "/login";
    }
  };

  const visibleGroups = useMemo(() =>
    NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (!item.roles || (user?.role && item.roles.includes(user.role))) &&
            canAccessPage(item.to, user?.allowed_pages),
        ),
      }))
      .filter((g) => g.items.length > 0),
    [user],
  );

  const { expanded, toggle: toggleExpanded } = useExpandedGroups(
    useMemo(() => visibleGroups.map((g) => g.id), [visibleGroups]),
  );

  const allItems = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups]);

  const pinnedItems = useMemo(() =>
    pinned
      .map((to) => allItems.find((item) => item.to === to))
      .filter((item): item is NavItem => item !== undefined),
    [pinned, allItems],
  );

  const isItemActive = useCallback(
    (to: string) =>
      to === "/"
        ? location.pathname === "/"
        : to === "/docker"
        ? location.pathname === "/docker"
        : location.pathname.startsWith(to),
    [location.pathname],
  );

  const dashActive = location.pathname === "/";

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-border/40 transition-all duration-300 ease-in-out relative select-none",
        "bg-background/80 backdrop-blur-2xl",
        collapsed ? "w-[56px]" : "w-[236px]",
      )}
      style={collapsed ? { zIndex: 50, overflowY: "visible" } : undefined}
    >
      {/* Right edge glow */}
      <div
        className="pointer-events-none absolute right-0 top-[8%] bottom-[8%] w-px opacity-40"
        style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--primary)/0.4), transparent)" }}
      />

      {/* ── Logo / Header ──────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center h-[52px] border-b border-border/40 shrink-0",
        collapsed ? "justify-center" : "px-3",
      )}>
        {collapsed ? (
          <button
            onClick={onToggle}
            className="relative w-8 h-8 rounded-lg bg-primary/12 border border-primary/20 flex items-center justify-center hover:bg-primary/22 hover:border-primary/35 transition-all group"
          >
            <Zap className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
          </button>
        ) : (
          <>
            <Link to="/" className="flex items-center gap-2.5 flex-1 min-w-0 group">
              <div className="relative w-7 h-7 shrink-0">
                <div className="absolute inset-0 rounded-lg bg-primary/12 border border-primary/22 flex items-center justify-center group-hover:bg-primary/22 transition-all">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
              <span className="font-bold text-[13px] tracking-wider text-gradient select-none">
                SUDO-Pi
              </span>
            </Link>
            <button
              onClick={onToggle}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/35 hover:text-muted-foreground/80 hover:bg-secondary/50 transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ── Collapsed Mode ─────────────────────────────────────────────── */}
      {collapsed ? (
        <nav className="flex-1 overflow-y-auto overflow-x-visible py-2 flex flex-col items-center gap-0.5">
          {/* Dashboard */}
          <NavLink
            to="/"
            className={cn(
              "relative w-8 h-8 rounded-lg flex items-center justify-center transition-all",
              dashActive
                ? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/20"
                : "text-muted-foreground/45 hover:bg-secondary/50 hover:text-foreground",
            )}
            data-tooltip="Dashboard"
          >
            {dashActive && (
              <div className="absolute left-0 inset-y-1.5 w-[2px] rounded-full bg-primary" />
            )}
            <Home className="w-[14px] h-[14px]" />
          </NavLink>

          <div className="w-5 border-t border-border/35 my-1" />

          {visibleGroups.map((group) => (
            <CollapsedGroupTile
              key={group.id}
              group={group}
              isItemActive={isItemActive}
            />
          ))}
        </nav>
      ) : (

      /* ── Expanded Mode ───────────────────────────────────────────────── */
        <nav className="flex-1 overflow-y-auto py-2 overflow-x-hidden">

          {/* Search */}
          <div className="px-3 pb-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[11px] h-[11px] text-muted-foreground/35 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className={cn(
                  "w-full h-7 pl-[26px] pr-6 text-[12px] rounded-lg transition-all",
                  "bg-secondary/25 border border-transparent",
                  "focus:border-border/50 focus:bg-secondary/40",
                  "text-foreground placeholder:text-muted-foreground/35",
                  "outline-none",
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/35 hover:text-muted-foreground/70 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Dashboard */}
          {(!searchQuery || "dashboard".includes(searchQuery.toLowerCase())) && (
            <div className="relative flex items-center mb-px">
              {dashActive && (
                <div className="absolute left-0 top-[5px] bottom-[5px] w-[2px] rounded-full bg-primary" />
              )}
              <NavLink
                to="/"
                className={cn(
                  "flex-1 flex items-center gap-2.5 pl-[14px] pr-3 py-[7px] text-[12px] font-medium transition-all duration-150 leading-none",
                  dashActive
                    ? "font-semibold text-primary bg-gradient-to-r from-primary/[0.11] via-primary/[0.05] to-transparent"
                    : "text-muted-foreground/65 hover:text-foreground/85 hover:bg-secondary/30",
                )}
              >
                <Home className={cn("w-[12px] h-[12px] shrink-0", dashActive ? "text-primary" : "text-muted-foreground/40")} />
                <span>Dashboard</span>
              </NavLink>
            </div>
          )}

          {/* Pinned section */}
          {!searchQuery && pinnedItems.length > 0 && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5 px-3 py-[5px]">
                <Star className="w-[9px] h-[9px] text-amber-400 fill-amber-400" />
                <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground/45">
                  Pinned
                </span>
              </div>
              <div className="pt-px pb-1.5">
                {pinnedItems.map((item) => {
                  const ItemIcon = item.icon;
                  const active = isItemActive(item.to);
                  return (
                    <div key={`pin-${item.to}`} className="group/ni relative flex items-center">
                      {active && (
                        <div className="absolute left-0 top-[5px] bottom-[5px] w-[2px] rounded-full bg-primary" />
                      )}
                      <NavLink
                        to={item.to}
                        className={cn(
                          "flex-1 flex items-center gap-2.5 pl-[28px] pr-8 py-[7px] text-[12px] transition-all duration-150 leading-none",
                          active
                            ? "font-semibold text-primary bg-gradient-to-r from-primary/[0.11] via-primary/[0.05] to-transparent"
                            : "font-medium text-muted-foreground/65 hover:text-foreground/85 hover:bg-secondary/30",
                        )}
                      >
                        <ItemIcon className={cn("w-[12px] h-[12px] shrink-0", active ? "text-primary" : "text-muted-foreground/40")} />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(item.to); }}
                        className="absolute right-2 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
                        title="Unpin"
                      >
                        <Star className="w-[9px] h-[9px] text-amber-400 fill-amber-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mx-3 border-t border-border/25 mb-1" />
            </div>
          )}

          {/* Separator after Dashboard (when no pinned) */}
          {!searchQuery && pinnedItems.length === 0 && (
            <div className="mx-3 border-t border-border/25 my-1" />
          )}

          {/* Groups */}
          <div>
            {visibleGroups.map((group) => (
              <NavGroupSection
                key={group.id}
                group={group}
                isOpen={expanded.has(group.id)}
                onToggle={() => toggleExpanded(group.id)}
                query={searchQuery}
                isItemActive={isItemActive}
                pinned={pinned}
                togglePin={togglePin}
              />
            ))}
          </div>
        </nav>
      )}

      {/* ── User + Logout ──────────────────────────────────────────────── */}
      <div className={cn(
        "border-t border-border/40 shrink-0",
        collapsed ? "py-2 flex flex-col items-center gap-1" : "p-1.5 space-y-0.5",
      )}>
        {user && !collapsed && (
          <Link
            to="/account"
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-all group"
          >
            <div className="relative w-6 h-6 rounded-full bg-primary/12 border border-primary/22 flex items-center justify-center text-[10px] font-bold text-primary uppercase shrink-0 group-hover:border-primary/40 transition-colors">
              {user.username.slice(0, 2)}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border-[1.5px] border-popover"
                style={{ boxShadow: "0 0 5px hsl(var(--success)/0.6)" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground/85 truncate leading-tight">
                {user.username}
              </p>
              <p className="text-[10px] text-muted-foreground/50 capitalize leading-tight">
                {user.role}
              </p>
            </div>
          </Link>
        )}

        {user && collapsed && (
          <Link
            to="/account"
            className="relative w-8 h-8 rounded-full bg-primary/12 border border-primary/22 flex items-center justify-center text-[10px] font-bold text-primary uppercase hover:border-primary/40 transition-colors"
            data-tooltip={user.username}
          >
            {user.username.slice(0, 2)}
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-popover" />
          </Link>
        )}

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12px] font-medium",
            "text-muted-foreground/45 hover:text-destructive hover:bg-destructive/8 transition-all",
            collapsed && "justify-center",
          )}
          data-tooltip={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-[12px] h-[12px] shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
