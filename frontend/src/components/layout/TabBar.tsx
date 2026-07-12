import { useState, useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Bell, Moon, Power, RefreshCw, Search, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUptime } from "@/lib/utils";
import { useSystemStore } from "@/stores/systemStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useTheme } from "@/contexts/ThemeContext";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { canAccessPage } from "@/lib/pages";
import { useAuthStore } from "@/stores/authStore";
import { NAV_GROUPS, getActiveGroup } from "@/lib/navGroups";

// ─── Power Panel ────────────────────────────────────────────────────────────────

function PowerPanel({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState<"reboot" | "shutdown" | null>(null);
  const [countdown, setCountdown] = useState(5);

  const rebootMut  = useMutation({ mutationFn: () => apiClient.post("/system/reboot"),   onSettled: onClose });
  const shutdownMut = useMutation({ mutationFn: () => apiClient.post("/system/shutdown"), onSettled: onClose });

  useEffect(() => {
    if (!confirming) return;
    if (countdown === 0) {
      if (confirming === "reboot") rebootMut.mutate(); else shutdownMut.mutate();
      setConfirming(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [confirming, countdown]);

  const start = (action: "reboot" | "shutdown") => { setConfirming(action); setCountdown(5); };

  return (
    <div className="absolute right-0 top-11 w-52 bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl z-50 p-2"
      style={{ boxShadow: "0 20px 60px hsl(260 50% 3%/0.7), 0 0 0 1px hsl(var(--primary)/0.08)" }}
    >
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60 px-2 pt-1 pb-2 border-b border-border/40">
        Power
      </p>
      {confirming ? (
        <div className="pt-3 pb-1 px-2 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            <span className="font-medium text-foreground">{confirming === "reboot" ? "Rebooting" : "Shutting down"}</span>{" "}
            in <span className="tabular-nums font-bold text-destructive">{countdown}</span>s…
          </p>
          <div className="bg-muted/50 rounded-full h-1 overflow-hidden">
            <div className="h-full bg-destructive/60 rounded-full transition-all duration-1000 ease-linear" style={{ width: `${(countdown / 5) * 100}%` }} />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => { setConfirming(null); setCountdown(5); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="pt-1">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-warning/10 hover:text-warning transition-colors text-sm text-left" onClick={() => start("reboot")}>
            <RefreshCw className="w-4 h-4 shrink-0" /> Reboot
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-sm text-left" onClick={() => start("shutdown")}>
            <Power className="w-4 h-4 shrink-0" /> Shutdown
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Notifications Panel ────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  error: "bg-destructive", warning: "bg-warning", success: "bg-success", info: "bg-info",
};

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationsPanel() {
  const { notifications, clearAll, removeNotification } = useNotificationStore();

  return (
    <div
      className="absolute right-0 top-11 w-80 bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl z-50 overflow-hidden"
      style={{ boxShadow: "0 20px 60px hsl(260 50% 3%/0.7), 0 0 0 1px hsl(var(--primary)/0.08)" }}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <span className="text-sm font-semibold">Notifications</span>
        {notifications.length > 0 && (
          <button onClick={clearAll} className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-secondary/50">
            Clear all
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/50">All caught up</p>
          </div>
        ) : (
          notifications.slice(0, 20).map((n) => (
            <div key={n.id} className={cn("group px-4 py-3 border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors", !n.read && "bg-primary/[0.04]")}>
              <div className="flex items-start gap-2.5">
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", LEVEL_COLORS[n.level] ?? "bg-info")} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug">{n.title}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-1">{relativeTime(n.timestamp)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-secondary">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Tab Item ───────────────────────────────────────────────────────────────────

function TabItem({ item, isActive }: { item: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={cn(
        "group relative flex items-center gap-1.5 px-3.5 h-full text-[12px] font-medium whitespace-nowrap transition-all border-b-2",
        isActive
          ? "text-foreground border-primary"
          : "text-muted-foreground/55 border-transparent hover:text-foreground/80 hover:border-border/50",
      )}
    >
      <Icon className={cn("w-[11px] h-[11px] shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground/35 group-hover:text-muted-foreground/70")} />
      {item.label}
    </NavLink>
  );
}

// ─── TabBar ─────────────────────────────────────────────────────────────────────

interface TabBarProps {
  onOpenPalette: () => void;
}

export function TabBar({ onOpenPalette }: TabBarProps) {
  const location = useLocation();
  const { user } = useAuthStore();
  const { stats } = useSystemStore();
  const { wsConnected } = useSystemStore();
  const { unreadCount, markAllRead } = useNotificationStore();
  const { activeTheme, toggleDarkLight } = useTheme();

  const [showPower, setShowPower]           = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Filter groups by user role/permissions
  const visibleGroups = useMemo(() =>
    NAV_GROUPS
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            (!item.roles || (user?.role && item.roles.includes(user.role))) &&
            canAccessPage(item.to, user?.allowed_pages ?? null),
        ),
      }))
      .filter((g) => g.items.length > 0),
    [user],
  );

  const activeGroup = getActiveGroup(location.pathname, visibleGroups);

  // Determine active tab
  const isTabActive = (to: string) =>
    to === "/docker"
      ? location.pathname === "/docker" || location.pathname.startsWith("/docker/")
      : location.pathname.startsWith(to);

  return (
    <div
      className="h-[52px] shrink-0 flex items-stretch border-b border-border/40 bg-background/70 backdrop-blur-xl z-10 relative overflow-hidden"
    >
      {/* ── Tabs area (scrollable) ── */}
      <div className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden scrollbar-none">
        {activeGroup ? (
          activeGroup.items.map((item) => (
            <TabItem key={item.to} item={item} isActive={isTabActive(item.to)} />
          ))
        ) : (
          /* Dashboard — no sub-tabs, just a single label */
          <div className="flex items-center pl-5 text-[12px] font-semibold text-foreground/50 select-none">
            Dashboard
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-0.5 px-2 border-l border-border/30 shrink-0">

        {/* Uptime */}
        {stats && (
          <span className="hidden lg:inline text-[10px] text-muted-foreground/40 tabular-nums mr-1.5">
            up {formatUptime(stats.uptime_seconds)}
          </span>
        )}

        {/* Search */}
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-1.5 h-[28px] px-2.5 rounded-lg border border-border/50 bg-secondary/20 text-[11px] text-muted-foreground/55 hover:bg-secondary hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Search className="w-3 h-3" />
          <span>Search</span>
          <kbd className="ml-1 text-[9px] border border-border/50 rounded px-1 font-mono bg-muted/40 text-muted-foreground/40">⌘K</kbd>
        </button>

        {/* WS status */}
        <span
          className="flex items-center justify-center w-7 h-7"
          title={wsConnected ? "Live — real-time connected" : "Reconnecting…"}
        >
          <span className="relative flex h-1.5 w-1.5">
            {wsConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-50" />}
            <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", wsConnected ? "bg-success" : "bg-muted-foreground/30")}
              style={wsConnected ? { boxShadow: "0 0 5px hsl(var(--success)/0.7)" } : undefined}
            />
          </span>
        </span>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggleDarkLight} className="w-7 h-7 text-muted-foreground/50 hover:text-foreground">
          {activeTheme.dark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost" size="icon"
            className="relative w-7 h-7 text-muted-foreground/50 hover:text-foreground"
            onClick={() => { setShowNotifications((v) => !v); setShowPower(false); if (!showNotifications) markAllRead(); }}
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-primary text-[8px] rounded-full flex items-center justify-center font-bold text-primary-foreground"
                style={{ boxShadow: "0 0 6px hsl(var(--primary)/0.5)" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <NotificationsPanel />
            </>
          )}
        </div>

        {/* Power */}
        <div className="relative">
          <Button
            variant="ghost" size="icon"
            className="w-7 h-7 text-muted-foreground/50 hover:text-destructive/70"
            onClick={() => { setShowPower((v) => !v); setShowNotifications(false); }}
            title="Power"
          >
            <Power className="w-3.5 h-3.5" />
          </Button>
          {showPower && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowPower(false)} />
              <PowerPanel onClose={() => setShowPower(false)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
