import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useNotificationStore } from "@/stores/notificationStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import type { NotificationLevel } from "@/types";

// ─── Dot color by level ───────────────────────────────────────────────────────

function levelDotClass(level: NotificationLevel): string {
  switch (level) {
    case "success": return "bg-green-400";
    case "error":   return "bg-red-400";
    case "warning": return "bg-yellow-400";
    case "info":
    default:        return "bg-cyan-400";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const notifications = useNotificationStore((s) => s.notifications);

  // Show at most 15, newest first (store already inserts newest at index 0)
  const recent = notifications.slice(0, 15);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-muted-foreground" />
            Recent Activity
          </span>
          <Link
            to="/alerts"
            className="text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Bell className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No activity yet — events will appear here
            </p>
          </div>
        ) : (
          <ul
            className="divide-y divide-white/5 overflow-y-auto"
            style={{ maxHeight: 320 }}
          >
            {recent.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${
                  n.read ? "opacity-60" : ""
                }`}
              >
                {/* Colored dot */}
                <span className="mt-1.5 shrink-0">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${levelDotClass(n.level)}`}
                  />
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug truncate">
                    {n.title}
                  </p>
                  {n.message && (
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                  )}
                </div>

                {/* Relative time */}
                <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                  {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
