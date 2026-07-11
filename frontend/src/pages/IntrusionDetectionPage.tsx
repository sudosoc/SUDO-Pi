import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, RefreshCw, ShieldOff, ShieldCheck, Skull, AlertTriangle } from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JailInfo {
  name: string;
  enabled: boolean;
  banned_ips: string[];
  total_banned: number;
  currently_failed: number;
}

interface Fail2banStatus {
  jails: JailInfo[];
  total_banned: number;
  error?: string;
}

interface SshAttempts {
  total_attempts: number;
  unique_ips: number;
  heatmap: number[][];
  top_ips: { ip: string; count: number }[];
  top_users: { user: string; count: number }[];
  recent: { timestamp: string; ip: string; user: string; message: string }[];
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }
  return { msg, toast };
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

export default function IntrusionDetectionPage() {
  const qc = useQueryClient();
  const { msg, toast } = useToast();

  const { data: f2b, isLoading: f2bLoading, refetch: refetchF2b } = useQuery<Fail2banStatus>({
    queryKey: ["fail2ban"],
    queryFn: async () => {
      const { data } = await apiClient.get<Fail2banStatus>("/security/fail2ban");
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: ssh, isLoading: sshLoading } = useQuery<SshAttempts>({
    queryKey: ["ssh-attempts"],
    queryFn: async () => {
      const { data } = await apiClient.get<SshAttempts>("/security/ssh-attempts");
      return data;
    },
    staleTime: 60_000,
  });

  const unbanMut = useMutation({
    mutationFn: async ({ jail, ip }: { jail: string; ip: string }) => {
      await apiClient.post(`/security/fail2ban/${jail}/unban`, { ip }, {});
    },
    onSuccess: (_, { ip }) => {
      toast(`${ip} unbanned.`);
      qc.invalidateQueries({ queryKey: ["fail2ban"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });


  const heatmap = ssh?.heatmap ?? Array.from({ length: 7 }, () => Array(24).fill(0));
  const maxVal = Math.max(...heatmap.flat(), 1);
  const days = ["Today", "Yesterday", "2d ago", "3d ago", "4d ago", "5d ago", "6d ago"];

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Intrusion Detection</h2>
            <p className="text-sm text-muted-foreground">
              fail2ban jails, SSH brute-force attempts, and blocked IPs.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => refetchF2b()} disabled={f2bLoading}>
          <RefreshCw className={cn("w-4 h-4", f2bLoading && "animate-spin")} />
        </Button>
      </div>

      {msg && (
        <div className={cn(
          "text-sm px-3 py-2 rounded-lg border",
          msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5",
        )}>
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Banned</p>
          <p className="text-2xl font-bold mt-1 text-red-400">{f2b?.total_banned ?? "—"}</p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Active Jails</p>
          <p className="text-2xl font-bold mt-1">{f2b?.jails?.length ?? "—"}</p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">SSH Attempts (7d)</p>
          <p className="text-2xl font-bold mt-1 text-amber-400">{ssh?.total_attempts ?? "—"}</p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unique IPs</p>
          <p className="text-2xl font-bold mt-1">{ssh?.unique_ips ?? "—"}</p>
        </div>
      </div>

      {/* SSH Attempt Heatmap */}
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

      {/* fail2ban jails */}
      <div className="space-y-3">
        {f2bLoading ? (
          <div className="h-32 bg-muted animate-pulse rounded-xl" />
        ) : f2b?.error ? (
          <Card className="border-amber-500/30">
            <CardContent className="py-6 text-center">
              <ShieldOff className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-amber-400">fail2ban not available</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Install with <code className="font-mono text-[11px]">sudo apt install fail2ban</code>
              </p>
            </CardContent>
          </Card>
        ) : (f2b?.jails ?? []).map((jail) => (
          <Card key={jail.name} className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                {jail.name}
                <span className="text-[10px] font-normal text-muted-foreground">
                  · {jail.total_banned} total banned · {jail.currently_failed} currently failing
                </span>
              </CardTitle>
            </CardHeader>
            {jail.banned_ips.length > 0 && (
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {jail.banned_ips.map((ip) => (
                    <div key={ip} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-red-500/5 border border-red-500/15">
                      <Skull className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="font-mono text-xs text-red-400 flex-1">{ip}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => unbanMut.mutate({ jail: jail.name, ip })}
                        disabled={unbanMut.isPending}
                      >
                        Unban
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Top attacking IPs */}
      {(ssh?.top_ips?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Attacking IPs (last 7 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(ssh?.top_ips ?? []).slice(0, 10).map((row) => {
              const pct = Math.round((row.count / (ssh?.total_attempts ?? 1)) * 100);
              return (
                <div key={row.ip} className="flex items-center gap-3">
                  <span className="font-mono text-xs w-36 shrink-0 text-muted-foreground/80">{row.ip}</span>
                  <div className="flex-1 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-red-400 w-14 text-right shrink-0">
                    {row.count.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
