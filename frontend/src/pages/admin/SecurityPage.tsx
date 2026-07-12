import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Ban, RefreshCw, Trash2, LogOut, Activity } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { formatDate, formatRelative } from "@/lib/utils";

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

interface AuditLog {
  id: number;
  timestamp: string;
  username: string;
  action: string;
  resource: string;
  ip_address: string;
  status: "success" | "failure";
  detail: string;
}

export default function SecurityPage() {
  const queryClient = useQueryClient();

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

  const { data: audit, isLoading: loadingAudit, refetch: refetchAudit } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await apiClient.get("/security/audit?limit=100");
      return data as { items: AuditLog[]; total: number };
    },
  });

  const { data: fw } = useQuery({
    queryKey: ["firewall"],
    queryFn: async () => {
      const { data } = await apiClient.get("/security/firewall");
      return data as { enabled: boolean; rules: { chain: string; target: string; proto: string; source: string; destination: string; comment: string }[] };
    },
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

  return (
    <div className="p-6 space-y-6">
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
              <div className={`w-9 h-9 rounded-lg ${fw?.enabled ? "bg-success/10" : "bg-destructive/10"} flex items-center justify-center`}>
                <ShieldAlert className={`w-5 h-5 ${fw?.enabled ? "text-success" : "text-destructive"}`} />
              </div>
              <div>
                <p className="text-sm font-bold">{fw?.enabled ? "Active" : "Inactive"}</p>
                <p className="text-xs text-muted-foreground">Firewall</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="fail2ban">
        <TabsList>
          <TabsTrigger value="fail2ban">Fail2Ban</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="firewall">Firewall</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="fail2ban" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchFail2ban()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
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
                    <div className="flex flex-wrap gap-2">
                      {jail.banned_ips.map((ip) => (
                        <div key={ip} className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/20 rounded px-2 py-0.5 text-xs font-mono">
                          <span className="text-destructive">{ip}</span>
                          <button
                            className="text-muted-foreground hover:text-foreground ml-1"
                            onClick={() => unbanMutation.mutate({ jail: jail.name, ip })}
                            title="Unban"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No banned IPs</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

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

        <TabsContent value="firewall" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>iptables Rules</CardTitle>
                <Badge variant={fw?.enabled ? "success" : "muted"}>{fw?.enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground">Chain</th>
                      <th className="text-left px-4 py-2 text-muted-foreground">Target</th>
                      <th className="text-left px-4 py-2 text-muted-foreground">Proto</th>
                      <th className="text-left px-4 py-2 text-muted-foreground">Source</th>
                      <th className="text-left px-4 py-2 text-muted-foreground">Destination</th>
                      <th className="text-left px-4 py-2 text-muted-foreground hidden md:table-cell">Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fw?.rules ?? []).map((rule, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-secondary/20">
                        <td className="px-4 py-1.5 text-muted-foreground">{rule.chain}</td>
                        <td className="px-4 py-1.5">
                          <span className={rule.target === "ACCEPT" ? "text-success" : rule.target === "DROP" ? "text-destructive" : "text-warning"}>
                            {rule.target}
                          </span>
                        </td>
                        <td className="px-4 py-1.5">{rule.proto}</td>
                        <td className="px-4 py-1.5">{rule.source}</td>
                        <td className="px-4 py-1.5">{rule.destination}</td>
                        <td className="px-4 py-1.5 text-muted-foreground hidden md:table-cell">{rule.comment}</td>
                      </tr>
                    ))}
                    {!fw?.rules?.length && (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-muted-foreground">No rules loaded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">{audit?.total ?? 0} total events</span>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-340px)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Time</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">User</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Action</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Resource</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden md:table-cell">IP</th>
                      <th className="text-center px-4 py-2 text-muted-foreground font-medium text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAudit
                      ? Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {Array.from({ length: 6 }).map((_, j) => (
                              <td key={j} className="px-4 py-2">
                                <div className="h-3.5 bg-muted rounded animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : (audit?.items ?? []).map((log) => (
                          <tr key={log.id} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="px-4 py-2 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                              {formatRelative(log.timestamp)}
                            </td>
                            <td className="px-4 py-2 font-medium text-xs">{log.username}</td>
                            <td className="px-4 py-2 text-xs font-mono">{log.action}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[140px]">{log.resource}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs font-mono hidden md:table-cell">{log.ip_address}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge
                                variant={log.status === "success" ? "success" : "destructive"}
                                className="text-[10px]"
                              >
                                {log.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                    {(!loadingAudit && !audit?.items?.length) && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          No audit events
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
