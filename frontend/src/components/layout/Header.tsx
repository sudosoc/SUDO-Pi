import { Bell, Search, Sun, Moon, X, Home, ChevronRight, Power, RefreshCw } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSystemStore } from "@/stores/systemStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { formatUptime } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

interface HeaderProps {
  title: string;
  onOpenPalette: () => void;
}

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const LEVEL_COLORS: Record<string, string> = {
  error:   "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info:    "bg-info",
};

function PowerPanel({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState<"reboot" | "shutdown" | null>(null);
  const [countdown, setCountdown] = useState(5);

  const rebootMut = useMutation({
    mutationFn: () => apiClient.post("/system/reboot"),
    onSettled: onClose,
  });

  const shutdownMut = useMutation({
    mutationFn: () => apiClient.post("/system/shutdown"),
    onSettled: onClose,
  });

  useEffect(() => {
    if (!confirming) return;
    if (countdown === 0) {
      if (confirming === "reboot") rebootMut.mutate();
      else shutdownMut.mutate();
      setConfirming(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [confirming, countdown]);

  const startConfirm = (action: "reboot" | "shutdown") => {
    setConfirming(action);
    setCountdown(5);
  };

  const cancel = () => {
    setConfirming(null);
    setCountdown(5);
  };

  const isBusy = rebootMut.isPending || shutdownMut.isPending;

  return (
    <div
      className="absolute right-0 top-11 w-52 bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl z-20 p-2"
      style={{ boxShadow: "0 20px 60px hsl(260 50% 3% / 0.7), 0 0 0 1px hsl(var(--primary) / 0.08)" }}
    >
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-2 border-b border-border/40">
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
          <Button variant="outline" size="sm" className="w-full" onClick={cancel} disabled={isBusy}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="pt-1">
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-warning/10 hover:text-warning transition-colors text-sm text-left"
            onClick={() => startConfirm("reboot")}
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            Reboot
          </button>
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-sm text-left"
            onClick={() => startConfirm("shutdown")}
          >
            <Power className="w-4 h-4 shrink-0" />
            Shutdown
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ title, onOpenPalette }: HeaderProps) {
  const { wsConnected, stats } = useSystemStore();
  const { unreadCount, notifications, markAllRead, clearAll, removeNotification } =
    useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPower, setShowPower] = useState(false);
  const { activeTheme, toggleDarkLight } = useTheme();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const themeIcon = activeTheme.dark
    ? <Moon className="w-3.5 h-3.5" />
    : <Sun className="w-3.5 h-3.5" />;

  return (
    <header className="h-[52px] flex items-center justify-between pl-5 pr-3 border-b border-border/50 bg-popover/70 backdrop-blur-xl shrink-0 z-10">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Link
          to="/"
          className="text-muted-foreground/60 hover:text-primary transition-colors shrink-0"
          title="Dashboard"
        >
          <Home className="w-3.5 h-3.5" />
        </Link>
        {!isHome && (
          <>
            <ChevronRight className="w-3 h-3 text-border shrink-0" />
            <h1 className="text-sm font-semibold text-foreground/90 truncate">{title}</h1>
          </>
        )}
        {isHome && (
          <h1 className="text-sm font-semibold text-foreground/90 ml-1">Dashboard</h1>
        )}
        {stats && (
          <span className="hidden lg:inline ml-3 px-2 py-0.5 rounded-full bg-secondary/60 text-[10px] text-muted-foreground/70 tabular-nums">
            up {formatUptime(stats.uptime_seconds)}
          </span>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-0.5">
        {/* Search */}
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 h-[30px] px-3 mr-1 rounded-lg border border-border/60 bg-secondary/30 text-[11.5px] text-muted-foreground/70 hover:bg-secondary hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Search className="w-3 h-3" />
          <span>Search…</span>
          <kbd className="ml-2 text-[9px] border border-border/60 rounded px-1 py-px font-mono bg-muted/60">
            ⌘K
          </kbd>
        </button>

        {/* Power */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setShowPower((v) => !v); setShowNotifications(false); }}
            title="Power"
            className="text-muted-foreground/60 hover:text-destructive/80 w-8 h-8"
          >
            <Power className="w-3.5 h-3.5" />
          </Button>
          {showPower && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPower(false)} />
              <PowerPanel onClose={() => setShowPower(false)} />
            </>
          )}
        </div>

        {/* WS status dot */}
        <span
          className="flex items-center justify-center w-8 h-8"
          title={wsConnected ? "Live — real-time connected" : "Reconnecting…"}
        >
          <span className="relative flex h-2 w-2">
            {wsConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-50" />
            )}
            <span className={cn(
              "relative inline-flex rounded-full h-2 w-2 transition-colors",
              wsConnected ? "bg-success" : "bg-muted-foreground/30"
            )} style={wsConnected ? { boxShadow: "0 0 6px hsl(var(--success) / 0.7)" } : undefined} />
          </span>
        </span>

        {/* Theme toggle dark/light */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDarkLight}
          title={`Switch to ${activeTheme.dark ? "light" : "dark"} mode`}
          className="text-muted-foreground/60 hover:text-foreground w-8 h-8"
        >
          {themeIcon}
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) markAllRead();
            }}
            className="relative text-muted-foreground/60 hover:text-foreground w-8 h-8"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-primary text-[8px] rounded-full flex items-center justify-center font-bold text-primary-foreground leading-none"
                style={{ boxShadow: "0 0 8px hsl(var(--primary) / 0.5)" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          {showNotifications && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 top-11 w-80 bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl z-20 overflow-hidden"
                style={{ boxShadow: "0 20px 60px hsl(260 50% 3% / 0.7), 0 0 0 1px hsl(var(--primary) / 0.08)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
                  <span className="text-sm font-semibold">Notifications</span>
                  <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                      <button
                        onClick={() => clearAll()}
                        className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-secondary/50"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                {/* Items */}
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
                          !n.read && "bg-primary/[0.04]"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                            LEVEL_COLORS[n.level] ?? "bg-info"
                          )} />
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
