import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  ShieldCheck, ShieldAlert, Ban, RefreshCw, Trash2, LogOut,
  Activity, AlertTriangle, Skull, Globe,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { formatDate, formatRelative, cn } from "@/lib/utils";

// ─── GeoIP Hook ──────────────────────────────────────────────────────────────

interface GeoInfo {
  country: string;
  countryCode: string;
  isp: string;
  status: "success" | "fail";
}

function useGeoIp(ips: string[]): Record<string, GeoInfo> {
  const [cache, setCache] = useState<Record<string, GeoInfo>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newIps = ips.filter((ip) => ip && !fetchedRef.current.has(ip));
    if (newIps.length === 0) return;
    newIps.forEach((ip) => fetchedRef.current.add(ip));

    // Batch lookup with ip-api.com (free tier: max 100 per batch)
    const chunks: string[][] = [];
    for (let i = 0; i < newIps.length; i += 100) {
      chunks.push(newIps.slice(i, i + 100));
    }

    const fetchChunk = async (chunk: string[]) => {
      try {
        const res = await fetch("http://ip-api.com/batch?fields=status,country,countryCode,isp,query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk.map((q) => ({ query: q }))),
        });
        if (!res.ok) return;
        const data: (GeoInfo & { query: string })[] = await res.json();
        setCache((prev) => {
          const next = { ...prev };
          data.forEach((d) => { next[d.query] = d; });
          return next;
        });
      } catch {
        // Silently ignore — GeoIP is a nice-to-have
      }
    };

    chunks.forEach(fetchChunk);
  }, [ips.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return cache;
}

interface Fail2BanJail {
  name: string;
  enabled: boolean;
  banned_ips: string[];
  total_banned: number;
  currently_failed: number;
  find_time: number;
  ban_time: number;
  max_retry: number;
}

interface ActiveSession {
  jti: string;
  ip_address: string;
  created_at: string;
  expires_at: string;
  user_agent?: string;
}

interface SshAttempts {
  total_attempts: number;
  unique_ips: number;
  heatmap: number[][];
  top_ips: { ip: string; count: number }[];
}

function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = max > 0 ? value / max : 0;
  const alpha = intensity * 0.85 + (intensity > 0 ? 0.08 : 0);
  return (
    <div
      title={`${value} attempts`}
      className="w-5 h-4 rounded-sm shrink-0"
      style={{
        background: `hsl(0 72% 58% / ${alpha.toFixed(2)})`,
        border: "1px solid hsl(0 0% 100% / 0.05)",
      }}
    />
  );
}

export default function SecurityPage() {
  const queryClient = useQueryClient();
  const [geoExpanded, setGeoExpanded] = useState(false);

  const { data: fail2ban, isLoading: loadingFail2ban, refetch: refetchFail2ban } = useQuery({
    queryKey: ["fail2ban"],
    queryFn: async () => {
      const { data } = await apiClient.get("/security/fail2ban");
      return data as { jails: Fail2BanJail[]; total_banned: number };
    },
    refetchInterval: 30000,
  });

  const { data: sessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: async () => {
      const { data } = await apiClient.get("/security/sessions");
      return data as ActiveSession[];
    },
  });

  const { data: ssh, isLoading: sshLoading } = useQuery<SshAttempts>({
    queryKey: ["ssh-attempts"],
    queryFn: async () => {
      const { data } = await apiClient.get<SshAttempts>("/security/ssh-attempts");
      return data;
    },
    staleTime: 60_000,
  });

  const unbanMutation = useMutation({
    mutationFn: ({ jail, ip }: { jail: string; ip: string }) =>
      apiClient.post(`/security/fail2ban/${jail}/unban`, { ip }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fail2ban"] });
      toast({ title: "IP unbanned", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Unban failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (jti: string) => apiClient.delete(`/security/sessions/${jti}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
      toast({ title: "Session revoked", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Failed to revoke session", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => apiClient.delete("/security/sessions"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
      toast({ title: "All sessions revoked", variant: "success" } as { title: string; variant: "success" });
    },
  });

  const heatmap = ssh?.heatmap ?? Array.from({ length: 7 }, () => Array(24).fill(0));
  const maxVal = Math.max(...heatmap.flat(), 1);
  const days = ["Today", "Yesterday", "2d ago", "3d ago", "4d ago", "5d ago", "6d ago"];

  // Collect all banned IPs for GeoIP lookup
  const allBannedIps = (fail2ban?.jails ?? []).flatMap((j) => j.banned_ips);
  const geoMap = useGeoIp(geoExpanded ? allBannedIps : []);

  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Ban className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{fail2ban?.total_banned ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Banned IPs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{sessions?.length ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Active Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{fail2ban?.jails?.length ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Active Jails</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-400">{ssh?.total_attempts ?? "—"}</p>
                <p className="text-xs text-muted-foreground">SSH Attacks (7d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="fail2ban">
        <TabsList>
          <TabsTrigger value="fail2ban">Fail2Ban</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="intrusion">Intrusion Detection</TabsTrigger>
        </TabsList>

        {/* ── Fail2Ban ──────────────────────────────────────────────────────── */}
        <TabsContent value="fail2ban" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetchFail2ban()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGeoExpanded((v) => !v)}
              className={cn(geoExpanded && "border-primary/40 text-primary")}
            >
              <Globe className="w-3.5 h-3.5 mr-1" />
              {geoExpanded ? "Hide" : "Show"} GeoIP
            </Button>
          </div>
          {loadingFail2ban ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            (fail2ban?.jails ?? []).map((jail) => (
              <Card key={jail.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">{jail.name}</CardTitle>
                      <Badge variant={jail.enabled ? "success" : "muted"} className="text-[10px]">
                        {jail.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>find: {jail.find_time}s</span>
                      <span>ban: {jail.ban_time}s</span>
                      <span>max: {jail.max_retry}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">
                    {jail.currently_failed} failing · {jail.total_banned} total banned
                  </p>
                  {jail.banned_ips.length > 0 ? (
                    <div className="space-y-1.5">
                      {jail.banned_ips.map((ip) => {
                        const geo = geoMap[ip];
                        return (
                          <div key={ip} className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded px-2 py-1 text-xs font-mono group">
                            <span className="text-destructive">{ip}</span>
                            {geoExpanded && (
                              <span className="text-muted-foreground truncate">
                                {geo?.status === "success"
                                  ? `· ${geo.countryCode} — ${geo.isp}`
                                  : geo
                                  ? "· lookup failed"
                                  : "· …"}
                              </span>
                            )}
                            <button
                              className="text-muted-foreground hover:text-foreground ml-auto shrink-0"
                              onClick={() => unbanMutation.mutate({ jail: jail.name, ip })}
                              title="Unban"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No banned IPs</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Sessions ──────────────────────────────────────────────────────── */}
        <TabsContent value="sessions" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchSessions()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => confirm("Revoke all sessions? You will be logged out.") && revokeAllMutation.mutate()}
              loading={revokeAllMutation.isPending}
            >
              <LogOut className="w-3.5 h-3.5 mr-1" /> Revoke All
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-80">
                <div className="divide-y divide-border">
                  {loadingSessions
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="px-4 py-3 flex justify-between">
                          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
                          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                        </div>
                      ))
                    : (sessions ?? []).map((session) => (
                        <div key={session.jti} className="px-4 py-3 flex items-center justify-between hover:bg-secondary/20">
                          <div>
                            <p className="text-sm font-mono">{session.ip_address}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Created {formatRelative(session.created_at)} · Expires {formatDate(session.expires_at)}
                            </p>
                            {session.user_agent && (
                              <p className="text-xs text-muted-foreground truncate max-w-xs">{session.user_agent}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => revokeSessionMutation.mutate(session.jti)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                  {(!loadingSessions && !sessions?.length) && (
                    <div className="flex justify-center py-12 text-muted-foreground text-sm">
                      No active sessions
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Intrusion Detection ───────────────────────────────────────────── */}
        <TabsContent value="intrusion" className="mt-4 space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total SSH Attempts (7d)</p>
                <p className="text-3xl font-bold mt-1 text-amber-400 tabular-nums">{ssh?.total_attempts ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unique Attacker IPs</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{ssh?.unique_ips ?? "—"}</p>
              </CardContent>
            </Card>
          </div>

          {/* SSH Brute-Force Heatmap */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                SSH Brute-Force Heatmap — Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sshLoading ? (
                <div className="h-28 bg-muted animate-pulse rounded-lg" />
              ) : (
                <div className="overflow-x-auto">
                  <div className="space-y-1.5 min-w-[640px]">
                    {/* Hour labels */}
                    <div className="flex items-center gap-1 pl-20">
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="w-5 text-center text-[9px] text-muted-foreground/50 shrink-0">
                          {h % 6 === 0 ? `${h}h` : ""}
                        </div>
                      ))}
                    </div>
                    {heatmap.map((row, di) => (
                      <div key={di} className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground/60 w-16 text-right shrink-0 pr-2">
                          {days[di]}
                        </span>
                        {row.map((val, hi) => (
                          <HeatmapCell key={hi} value={val} max={maxVal} />
                        ))}
                      </div>
                    ))}
                    {/* Legend */}
                    <div className="flex items-center gap-2 mt-2 justify-end">
                      <span className="text-[10px] text-muted-foreground/60">Less</span>
                      {[0, 0.2, 0.4, 0.7, 1].map((alpha) => (
                        <div
                          key={alpha}
                          className="w-4 h-3 rounded-sm"
                          style={{ background: `hsl(0 72% 58% / ${alpha * 0.85 + (alpha > 0 ? 0.08 : 0)})` }}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground/60">More</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Attacking IPs */}
          {(ssh?.top_ips?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Attacking IPs — Last 7 Days</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(ssh?.top_ips ?? []).slice(0, 10).map((row) => {
                  const pct = Math.round((row.count / (ssh?.total_attempts ?? 1)) * 100);
                  return (
                    <div key={row.ip} className="flex items-center gap-3">
                      <Skull className="w-3 h-3 text-red-400/60 shrink-0" />
                      <span className="font-mono text-xs w-36 shrink-0 text-muted-foreground/80">{row.ip}</span>
                      <div className="flex-1 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-red-400 w-16 text-right shrink-0 tabular-nums">
                        {row.count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
