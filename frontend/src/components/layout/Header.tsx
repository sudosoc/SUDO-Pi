import { Bell, Search, Sun, Moon, Monitor, X, Home, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSystemStore } from "@/stores/systemStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { formatUptime } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

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

export function Header({ title, onOpenPalette }: HeaderProps) {
  const { wsConnected, stats } = useSystemStore();
  const { unreadCount, notifications, markAllRead, clearAll, removeNotification } =
    useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const isHome = location.pathname === "/";

  function cycleTheme() {
    if (theme === "system") setTheme("dark");
    else if (theme === "dark") setTheme("light");
    else setTheme("system");
  }

  const themeIcon =
    theme === "dark" ? (
      <Moon className="w-4 h-4" />
    ) : theme === "light" ? (
      <Sun className="w-4 h-4" />
    ) : (
      <Monitor className="w-4 h-4" />
    );

  return (
    <header className="h-[52px] flex items-center justify-between pl-4 pr-3 border-b border-border/70 bg-card/60 shrink-0 z-10">
      {/* Left: breadcrumb-style title */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Link
          to="/"
          className="flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Dashboard"
        >
          <Home className="w-3.5 h-3.5" />
        </Link>
        {!isHome && (
          <>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            <h1 className="text-sm font-semibold truncate">{title}</h1>
          </>
        )}
        {isHome && <h1 className="text-sm font-semibold ml-1">Dashboard</h1>}
        {stats && (
          <span className="hidden lg:inline ml-3 text-[11px] text-muted-foreground/80 tabular-nums">
            up {formatUptime(stats.uptime_seconds)}
          </span>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {/* Search trigger */}
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 h-8 px-3 mr-1 rounded-lg border border-border/70 bg-background/60 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Search className="w-3 h-3" />
          <span>Search…</span>
          <kbd className="ml-3 text-[10px] border border-border rounded px-1 py-px font-mono bg-muted text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        {/* Realtime status — quiet dot */}
        <span
          className="flex items-center justify-center w-8 h-8"
          title={wsConnected ? "Real-time connected" : "Reconnecting…"}
        >
          <span className="relative flex h-2 w-2">
            {wsConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                wsConnected ? "bg-success" : "bg-muted-foreground"
              )}
            />
          </span>
        </span>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {themeIcon}
        </Button>

        {/* Notification bell */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) markAllRead();
            }}
            className="relative text-muted-foreground hover:text-foreground"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 top-10 w-80 bg-popover border border-border rounded-xl shadow-2xl z-20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70">
                  <span className="text-sm font-medium">Notifications</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {notifications.length} total
                    </span>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => clearAll()}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      All caught up — nothing new.
                    </div>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "group px-4 py-3 border-b border-border/60 last:border-0 hover:bg-secondary/40",
                          !n.read && "bg-primary/5"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                              n.level === "error"
                                ? "bg-destructive"
                                : n.level === "warning"
                                ? "bg-warning"
                                : n.level === "success"
                                ? "bg-success"
                                : "bg-info"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {n.message}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 mt-1">
                              {relativeTime(n.timestamp)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(n.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground shrink-0"
                            title="Dismiss"
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
