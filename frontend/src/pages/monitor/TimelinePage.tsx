import { useQuery } from "@tanstack/react-query";
import {
  Activity, ShieldAlert, Package, RefreshCw, RotateCcw,
  LogIn, Info, XCircle,
  Clock,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: number;
  username: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  status_code: number | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  ts: Date;
  kind: "auth" | "security" | "system" | "service" | "error" | "info";
  title: string;
  detail: string | null;
  severity: "normal" | "warning" | "danger" | "success";
}

const KIND_ICON: Record<TimelineEvent["kind"], React.ComponentType<{ className?: string }>> = {
  auth:     LogIn,
  security: ShieldAlert,
  system:   RotateCcw,
  service:  Package,
  error:    XCircle,
  info:     Info,
} as const;

const SEVERITY_DOT: Record<TimelineEvent["severity"], string> = {
  normal:  "bg-primary/60",
  warning: "bg-warning",
  danger:  "bg-destructive",
  success: "bg-success",
};

const SEVERITY_ICON_COLOR: Record<TimelineEvent["severity"], string> = {
  normal:  "text-primary/70",
  warning: "text-warning",
  danger:  "text-destructive",
  success: "text-success",
};

function classifyAudit(log: AuditLog): TimelineEvent {
  const action = log.action ?? "";
  const ok = (log.status_code ?? 200) < 400;

  let kind: TimelineEvent["kind"] = "info";
  let severity: TimelineEvent["severity"] = "normal";

  if (action.startsWith("auth.login")) { kind = "auth"; severity = ok ? "success" : "danger"; }
  else if (action.startsWith("auth.logout")) { kind = "auth"; severity = "normal"; }
  else if (action.startsWith("system.reboot")) { kind = "system"; severity = "warning"; }
  else if (action.startsWith("system.shutdown")) { kind = "system"; severity = "warning"; }
  else if (action.startsWith("system.update")) { kind = "system"; severity = "normal"; }
  else if (action.startsWith("security.") || action.startsWith("fail2ban")) { kind = "security"; severity = ok ? "normal" : "danger"; }
  else if (action.startsWith("service.")) { kind = "service"; severity = "normal"; }
  else if (!ok) { kind = "error"; severity = "danger"; }

  const titles: Record<string, string> = {
    "auth.login": ok ? "User signed in" : "Failed login attempt",
    "auth.logout": "User signed out",
    "system.reboot": "System rebooted",
    "system.shutdown": "System shut down",
    "system.update": "System update started",
    "system.set_hostname": "Hostname changed",
    "system.set_timezone": "Timezone changed",
    "system.set_ntp": "NTP configuration changed",
    "service.start": "Service started",
    "service.stop": "Service stopped",
    "service.restart": "Service restarted",
    "process.kill": "Process killed",
  };

  const title = titles[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const parts = [log.username && `by ${log.username}`, log.resource && `on ${log.resource}`, log.ip_address && `from ${log.ip_address}`].filter(Boolean);

  return {
    id: `audit-${log.id}`,
    ts: new Date(log.created_at),
    kind,
    title,
    detail: parts.join(" · ") || null,
    severity,
  };
}

function formatTimestamp(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return `yesterday ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const key = e.ts.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries());
}

export default function TimelinePage() {
  const { data: audit, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["timeline-audit"],
    queryFn: async () => {
      const { data } = await apiClient.get("/security/audit?limit=200&skip=0");
      return (data.items ?? data) as AuditLog[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const events: TimelineEvent[] = (audit ?? []).map(classifyAudit).sort((a, b) => b.ts.getTime() - a.ts.getTime());
  const grouped = groupByDate(events);

  return (
    <div className="p-6 space-y-5 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Activity Timeline</h2>
            <p className="text-sm text-muted-foreground">
              Chronological view of all system activity — logins, reboots, service changes, and security events.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isRefetching}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Summary badges */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["auth", "system", "security", "service", "error"] as const).map((k) => {
            const count = events.filter((e) => e.kind === k).length;
            if (count === 0) return null;
            const labels: Record<string, string> = { auth: "Auth", system: "System", security: "Security", service: "Services", error: "Errors" };
            return (
              <Badge key={k} variant="outline" className="text-xs gap-1.5">
                {count} {labels[k]}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 pt-1.5">
                <div className="h-3.5 w-40 bg-muted rounded animate-pulse" />
                <div className="h-3 w-64 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <Activity className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1 opacity-70">Events appear here as you use the dashboard</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-260px)]">
          <div className="space-y-8">
            {grouped.map(([date, dayEvents]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">{date}</div>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[15px] top-4 bottom-0 w-px bg-border/40" />
                  <div className="space-y-1">
                    {dayEvents.map((event) => {
                      const Icon = KIND_ICON[event.kind];
                      return (
                        <div key={event.id} className="flex gap-4 group">
                          {/* Icon dot */}
                          <div className="relative z-10 shrink-0">
                            <div className={cn(
                              "w-8 h-8 rounded-full border-2 border-background flex items-center justify-center",
                              "bg-secondary/80",
                            )}>
                              <Icon className={cn("w-3.5 h-3.5", SEVERITY_ICON_COLOR[event.severity])} />
                            </div>
                            <div className={cn(
                              "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                              SEVERITY_DOT[event.severity],
                            )} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-3 pt-1 pr-2 rounded-lg group-hover:bg-secondary/20 transition-colors px-2 -ml-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{event.title}</p>
                              <span className="text-[11px] text-muted-foreground/50 tabular-nums ml-auto shrink-0">
                                {formatTimestamp(event.ts)}
                              </span>
                            </div>
                            {event.detail && (
                              <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{event.detail}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
