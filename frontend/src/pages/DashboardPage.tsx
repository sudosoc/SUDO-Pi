import { useSystemStore } from "@/stores/systemStore";
import { SystemStats } from "@/components/dashboard/SystemStats";
import { ProcessTable } from "@/components/dashboard/ProcessTable";
import { ServiceStatus } from "@/components/dashboard/ServiceStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SparklineChart } from "@/components/dashboard/SparklineChart";
import { formatBytes, formatUptime } from "@/lib/utils";
import { Activity, Clock, Wifi } from "lucide-react";

export default function DashboardPage() {
  const { stats, wsConnected, lastUpdated, networkRxHistory, networkTxHistory } = useSystemStore();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {stats?.hostname ?? "Loading…"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {stats?.os} · {stats?.architecture} · Kernel {stats?.kernel}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {lastUpdated && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Badge variant={wsConnected ? "success" : "destructive"}>
            {wsConnected ? "Live" : "Offline"}
          </Badge>
        </div>
      </div>

      <SystemStats />

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Uptime
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{formatUptime(stats.uptime_seconds)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Since {new Date(stats.boot_time * 1000).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Load
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold tabular-nums">{stats.cpu.load_avg_1.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.cpu.load_avg_5.toFixed(2)} / {stats.cpu.load_avg_15.toFixed(2)} (5m/15m)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" /> Network RX
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                {stats.network_interfaces.length > 0
                  ? formatBytes(stats.network_interfaces.filter(i => i.name !== "lo").reduce((a, b) => a + b.bytes_recv, 0))
                  : "N/A"}
              </p>
              <SparklineChart data={networkRxHistory} color="#22c55e" height={28} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" /> Network TX
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                {stats.network_interfaces.length > 0
                  ? formatBytes(stats.network_interfaces.filter(i => i.name !== "lo").reduce((a, b) => a + b.bytes_sent, 0))
                  : "N/A"}
              </p>
              <SparklineChart data={networkTxHistory} color="#f59e0b" height={28} />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProcessTable />
        <ServiceStatus />
      </div>
    </div>
  );
}
