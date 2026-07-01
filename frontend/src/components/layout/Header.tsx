import { Bell, Wifi, WifiOff } from "lucide-react";
import { useSystemStore } from "@/stores/systemStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { formatUptime } from "@/lib/utils";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { wsConnected, stats } = useSystemStore();
  const { unreadCount, notifications, markAllRead } = useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0 z-10">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold">{title}</h1>
        {stats && (
          <span className="hidden md:inline text-xs text-muted-foreground">
            ↑ {formatUptime(stats.uptime_seconds)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
            wsConnected
              ? "text-success bg-success/10"
              : "text-muted-foreground bg-muted"
          )}
          title={wsConnected ? "Real-time connected" : "Reconnecting…"}
        >
          {wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          <span className="hidden sm:inline">{wsConnected ? "Live" : "Offline"}</span>
        </div>

        {stats && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground mr-2">
            <span>CPU {stats.cpu.percent.toFixed(0)}%</span>
            <span>RAM {stats.memory.percent.toFixed(0)}%</span>
            {stats.temperature.cpu && (
              <span>{stats.temperature.cpu.toFixed(0)}°C</span>
            )}
          </div>
        )}

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) markAllRead();
            }}
            className="relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
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
              <div className="absolute right-0 top-10 w-80 bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="text-sm font-medium">Notifications</span>
                  <span className="text-xs text-muted-foreground">{notifications.length} total</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No notifications
                    </div>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/50",
                          !n.read && "bg-primary/5"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                              n.level === "error" ? "bg-destructive" :
                              n.level === "warning" ? "bg-warning" :
                              n.level === "success" ? "bg-success" : "bg-info"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                          </div>
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
