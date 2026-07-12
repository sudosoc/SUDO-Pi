import { useState, useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bell, ChevronLeft, ChevronRight, Columns2, Maximize2,
  Minimize2, Moon, Power, RefreshCw, Search, Sun, X,
} from "lucide-react";
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
import { useNavHistory } from "@/hooks/useNavHistory";
import { useTabBadges } from "@/hooks/useTabBadges";
import { useSplitStore } from "@/stores/splitStore";

// ─── Power Panel ───────────────────────────────────────────────────────────────

function PowerPanel({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState<"reboot" | "shutdown" | null>(null);
  const [countdown, setCountdown]   = useState(5);

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
    <div
      className="absolute right-0 top-11 w-52 bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl z-50 p-2"
      style={{ boxShadow: "0 20px 60px hsl(260 50% 3%/0.7), 0 0 0 1px hsl(var(--primary)/0.08)" }}
    >
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60 px-2 pt-1 pb-2 border-b border-border/40">
        Power
      </p>
      {confirming ? (
        <div className="pt-3 pb-1 px-2 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            <span className="font-medium text-foreground">
              {confirming === "reboot" ? "Rebooting" : "Shutting down"}
            </span>{" "}
            in <span className="tabular-nums font-bold text-destructive">{countdown}</span>s…
          </p>
          <div className="bg-muted/50 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-destructive/60 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(countdown / 5) * 100}%` }}
            />
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

// ─── Notifications Panel ───────────────────────────────────────────────────────

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
            <div
              key={n.id}
              className={cn(
                "group px-4 py-3 border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors",
                !n.read && "bg-primary/[0.04]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", LEVEL_COLORS[n.level] ?? "bg-info")} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug">{n.title}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-1">{relativeTime(n.timestamp)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-secondary"
                >
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

// ─── Gift 2: Live CPU Sparkline ────────────────────────────────────────────────

function CpuSparkline({ history, temp }: { history: number[]; temp?: number }) {
  const pts = history.slice(-20);
  if (pts.length < 2) return null;

  const max   = 100;
  const W = 44, H = 14;
  const step  = W / (pts.length - 1);
  const toY   = (v: number) => H - (v / max) * H;
  const path  = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const area  = `${path} L${W},${H} L0,${H} Z`;

  const current = pts[pts.length - 1];
  const dotColor = current > 85 ? "hsl(var(--destructive))" : current > 60 ? "hsl(var(--warning))" : "hsl(var(--primary))";

  const tempColor = !temp ? "text-muted-foreground/40"
    : temp < 60  ? "text-success/70"
    : temp < 75  ? "text-warning"
    : "text-destructive";

  return (
    <div className="flex items-center gap-2 pl-2 border-l border-border/30">
      <div className="relative" title={`CPU: ${current.toFixed(0)}%`}>
        <svg width={W} height={H} className="overflow-visible">
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#spark-fill)" />
          <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          <circle
            cx={(pts.length - 1) * step}
            cy={toY(current)}
            r="2"
            fill={dotColor}
            style={{ filter: `drop-shadow(0 0 3px ${dotColor})` }}
          />
        </svg>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground/50">
        {current.toFixed(0)}%
      </span>
      {temp !== undefined && temp > 0 && (
        <span className={cn("text-[10px] tabular-nums font-medium", tempColor)} title="CPU temp">
          {Math.round(temp)}°
        </span>
      )}
    </div>
  );
}

// ─── Tab Badge ─────────────────────────────────────────────────────────────────

const BADGE_COLORS = {
  error:   "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  info:    "bg-primary/80 text-primary-foreground",
  live:    "bg-success",
  success: "bg-success text-success-foreground",
} as const;

function TabBadgeChip({ count, dot, variant }: { count?: number; dot?: boolean; variant: string }) {
  if (dot || !count) {
    return (
      <span className="relative flex h-1.5 w-1.5 ml-1">
        {variant === "live" && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
        )}
        <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", BADGE_COLORS[variant as keyof typeof BADGE_COLORS] ?? "bg-info")} />
      </span>
    );
  }
  return (
    <span className={cn(
      "ml-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums",
      BADGE_COLORS[variant as keyof typeof BADGE_COLORS] ?? "bg-info text-info-foreground",
    )}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─── Tab Item ─────────────────────────────────────────────────────────────────

function TabItem({
  item,
  isActive,
  badge,
}: {
  item: { to: string; icon: React.ComponentType<{ className?: string }>; label: string };
  isActive: boolean;
  badge?: { count?: number; dot?: boolean; variant: string };
}) {
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
      <Icon className={cn(
        "w-[11px] h-[11px] shrink-0 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground/35 group-hover:text-muted-foreground/70",
      )} />
      {item.label}
      {badge && (
        <TabBadgeChip count={badge.count} dot={badge.dot} variant={badge.variant} />
      )}
    </NavLink>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

interface TabBarProps {
  onOpenPalette:   () => void;
  focusMode:       boolean;
  onToggleFocus:   () => void;
}

export function TabBar({ onOpenPalette, focusMode, onToggleFocus }: TabBarProps) {
  const location  = useLocation();
  const { user }  = useAuthStore();
  const { stats, wsConnected, cpuHistory } = useSystemStore();
  const { unreadCount, markAllRead }       = useNotificationStore();
  const { activeTheme, toggleDarkLight }   = useTheme();
  const { canGoBack, canGoForward, goBack, goForward } = useNavHistory();
  const badges = useTabBadges();
  const { enabled: splitEnabled, setSplit } = useSplitStore();

  const [showPower,         setShowPower]         = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

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

  const isTabActive = (to: string) =>
    to === "/docker"
      ? location.pathname === "/docker" || location.pathname.startsWith("/docker/")
      : location.pathname.startsWith(to);

  return (
    <div className="h-[52px] shrink-0 flex items-stretch border-b border-border/40 bg-background/70 backdrop-blur-xl z-10 relative">

      {/* ── Back / Forward ── */}
      <div className="flex items-center gap-0.5 px-1.5 border-r border-border/30 shrink-0">
        <Button
          variant="ghost" size="icon"
          className="w-6 h-6 text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
          onClick={goBack}
          disabled={!canGoBack}
          title="Go back (Alt+←)"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="w-6 h-6 text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
          onClick={goForward}
          disabled={!canGoForward}
          title="Go forward (Alt+→)"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden scrollbar-none">
        {activeGroup ? (
          activeGroup.items.map((item) => (
            <TabItem
              key={item.to}
              item={item}
              isActive={isTabActive(item.to)}
              badge={badges[item.to]}
            />
          ))
        ) : (
          <div className="flex items-center pl-4 text-[12px] font-semibold text-foreground/50 select-none">
            Dashboard
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-0.5 px-2 border-l border-border/30 shrink-0">

        {/* Sparkline gift */}
        {cpuHistory.length >= 2 && (
          <CpuSparkline
            history={cpuHistory}
            temp={stats?.temperature?.cpu ?? undefined}
          />
        )}

        {/* Uptime */}
        {stats && (
          <span className="hidden xl:inline text-[10px] text-muted-foreground/35 tabular-nums mx-1.5">
            up {formatUptime(stats.uptime_seconds)}
          </span>
        )}

        {/* Search */}
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-1.5 h-[28px] px-2.5 rounded-lg border border-border/50 bg-secondary/20 text-[11px] text-muted-foreground/55 hover:bg-secondary hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Search className="w-3 h-3" />
          <span className="hidden md:inline">Search</span>
          <kbd className="ml-0.5 text-[9px] border border-border/50 rounded px-1 font-mono bg-muted/40 text-muted-foreground/40">⌘K</kbd>
        </button>

        {/* WS dot */}
        <span
          className="flex items-center justify-center w-6 h-6"
          title={wsConnected ? "Live — real-time connected" : "Reconnecting…"}
        >
          <span className="relative flex h-1.5 w-1.5">
            {wsConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-50" />}
            <span
              className={cn("relative inline-flex rounded-full h-1.5 w-1.5", wsConnected ? "bg-success" : "bg-muted-foreground/30")}
              style={wsConnected ? { boxShadow: "0 0 5px hsl(var(--success)/0.7)" } : undefined}
            />
          </span>
        </span>

        {/* Split view toggle */}
        <Button
          variant="ghost" size="icon"
          className={cn(
            "w-7 h-7 transition-colors",
            splitEnabled
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground/50 hover:text-foreground",
          )}
          onClick={() => setSplit(!splitEnabled)}
          title={splitEnabled ? "Close split view (Ctrl+\\)" : "Open split view (Ctrl+\\)"}
        >
          <Columns2 className="w-3.5 h-3.5" />
        </Button>

        {/* Focus mode toggle */}
        <Button
          variant="ghost" size="icon"
          className={cn(
            "w-7 h-7 transition-colors",
            focusMode
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground/50 hover:text-foreground",
          )}
          onClick={onToggleFocus}
          title={focusMode ? "Exit focus mode (F)" : "Focus mode (F)"}
        >
          {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </Button>

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
              <span
                className="absolute top-1 right-1 w-3.5 h-3.5 bg-primary text-[8px] rounded-full flex items-center justify-center font-bold text-primary-foreground"
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
