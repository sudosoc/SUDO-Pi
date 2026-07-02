import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  Activity, Download, Upload, Cpu, RefreshCw, Trash2, Users,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { useAuthStore } from "@/stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceStats {
  ip: string;
  mac: string;
  hostname: string | null;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
}

interface AggregateStats {
  total_devices: number;
  total_rx_bytes: number;
  total_tx_bytes: number;
  top_consumer: { ip: string; hostname: string | null; bytes: number } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : val.toFixed(0)} ${units[i]}`;
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-lg", color)}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-base font-bold tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function UsageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NetworkTrafficPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const { data: stats = [], isLoading: statsLoading } = useQuery({
    queryKey: ["traffic-stats"],
    queryFn: async () => {
      const { data } = await apiClient.get<DeviceStats[]>("/traffic/stats");
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const { data: aggregate } = useQuery({
    queryKey: ["traffic-aggregate"],
    queryFn: async () => {
      const { data } = await apiClient.get<AggregateStats>("/traffic/aggregate");
      return data;
    },
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/traffic/reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traffic-stats"] });
      queryClient.invalidateQueries({ queryKey: ["traffic-aggregate"] });
      toast({
        title: "Counters reset",
        description: "Traffic counters have been zeroed",
        variant: "success",
      } as { title: string; description: string; variant: "success" });
    },
    onError: () => {
      toast({
        title: "Reset failed",
        description: "Could not reset traffic counters",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  // Compute max total bytes for relative progress bars
  const maxBytes = Math.max(
    1,
    ...stats.map((d) => d.rx_bytes + d.tx_bytes),
  );

  const topConsumerLabel = aggregate?.top_consumer
    ? aggregate.top_consumer.hostname ?? aggregate.top_consumer.ip
    : "—";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold">Network Traffic Monitor</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["traffic-stats"] });
              queryClient.invalidateQueries({ queryKey: ["traffic-aggregate"] });
            }}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", statsLoading && "animate-spin")} />
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              loading={resetMutation.isPending}
              className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Reset Counters
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Users}
          label="Active Devices"
          value={String(aggregate?.total_devices ?? 0)}
          color="bg-blue-500/10 text-blue-400"
        />
        <SummaryCard
          icon={Download}
          label="Total Download"
          value={formatBytes(aggregate?.total_rx_bytes ?? 0)}
          color="bg-green-500/10 text-green-400"
        />
        <SummaryCard
          icon={Upload}
          label="Total Upload"
          value={formatBytes(aggregate?.total_tx_bytes ?? 0)}
          color="bg-violet-500/10 text-violet-400"
        />
        <SummaryCard
          icon={Cpu}
          label="Top Consumer"
          value={topConsumerLabel}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Per-device table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Per-Device Traffic</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {statsLoading && stats.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : stats.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No devices connected to AP</p>
              <p className="text-xs mt-1 opacity-70">
                Clients appear here once they join the 192.168.4.x network
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Device</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5 hidden sm:table-cell">MAC</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2.5">
                      <span className="text-green-400">↓</span> Download
                    </th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-2.5">
                      <span className="text-violet-400">↑</span> Upload
                    </th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5 w-36 hidden md:table-cell">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((device) => {
                    const totalBytes = device.rx_bytes + device.tx_bytes;
                    const pct = (totalBytes / maxBytes) * 100;
                    const isTop = aggregate?.top_consumer?.ip === device.ip;

                    return (
                      <tr
                        key={device.ip}
                        className="border-b border-border/30 last:border-0 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isTop && (
                              <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30 px-1 py-0">
                                TOP
                              </Badge>
                            )}
                            <div>
                              <p className="font-medium">
                                {device.hostname ?? device.ip}
                              </p>
                              {device.hostname && (
                                <p className="text-xs text-muted-foreground font-mono">{device.ip}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="font-mono text-xs text-muted-foreground">{device.mac}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-xs text-green-400">{formatBytes(device.rx_bytes)}</span>
                          <p className="text-[10px] text-muted-foreground">{device.rx_packets.toLocaleString()} pkts</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-xs text-violet-400">{formatBytes(device.tx_bytes)}</span>
                          <p className="text-[10px] text-muted-foreground">{device.tx_packets.toLocaleString()} pkts</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <UsageBar
                            percent={pct}
                            color={pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-violet-500"}
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(totalBytes)} total</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Auto-refreshes every 5 seconds · Counters measure traffic through the FORWARD chain since last reset
      </p>
    </div>
  );
}
