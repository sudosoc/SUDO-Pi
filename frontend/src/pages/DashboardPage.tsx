import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSystemStore } from "@/stores/systemStore";
import { SystemStats } from "@/components/dashboard/SystemStats";
import { ProcessTable } from "@/components/dashboard/ProcessTable";
import { ServiceStatus } from "@/components/dashboard/ServiceStatus";
import { MetricGauge } from "@/components/dashboard/MetricGauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SparklineChart } from "@/components/dashboard/SparklineChart";
import { formatBytes, formatUptime } from "@/lib/utils";
import { Activity, Clock, Wifi, Power, RefreshCw, AlertTriangle, FileJson } from "lucide-react";
import { apiClient } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

// ─── Live Metrics WebSocket ───────────────────────────────────────────────────

interface LiveMetrics {
  cpu: number;
  ram: number;
  disk: number | null;
  temp: number | null;
  rx: number;
  tx: number;
  timestamp: number;
}

function useMetricsWebSocket() {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws/metrics`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setConnected(true);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data: LiveMetrics };
        if (msg.type === "metrics") {
          setMetrics(msg.data);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnect
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 3 s with exponential back-off handled via fixed 3 s
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { metrics, connected };
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions() {
  const [confirmAction, setConfirmAction] = useState<"reboot" | "shutdown" | null>(null);

  const actionMutation = useMutation({
    mutationFn: async (action: "reboot" | "shutdown") => {
      await apiClient.post(`/system/${action}`);
    },
    onSuccess: (_, action) => {
      toast({
        title: action === "reboot" ? "Rebooting…" : "Shutting down…",
        description: action === "reboot"
          ? "Pi will restart in a few seconds."
          : "Pi is powering off.",
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      setConfirmAction(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Action failed",
        description: err?.response?.data?.detail ?? "Command execution failed",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
      setConfirmAction(null);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Power className="w-3.5 h-3.5 text-muted-foreground" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {confirmAction ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Confirm{" "}
                <strong>{confirmAction === "reboot" ? "reboot" : "shutdown"}</strong>?
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                loading={actionMutation.isPending}
                onClick={() => actionMutation.mutate(confirmAction)}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/60"
              onClick={() => setConfirmAction("reboot")}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reboot
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmAction("shutdown")}
            >
              <Power className="w-3.5 h-3.5" />
              Shutdown
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Gauge Row ────────────────────────────────────────────────────────────────

function GaugeRow({
  liveCpu, liveRam, liveTemp, liveDisk,
}: {
  liveCpu?: number; liveRam?: number; liveTemp?: number | null; liveDisk?: number | null;
}) {
  const { stats } = useSystemStore();
  if (!stats) return null;

  const { disks } = stats;
  const primaryDisk = disks.find((d) => d.mountpoint === "/") ?? disks[0];

  const cpu  = liveCpu  ?? stats.cpu.percent;
  const ram  = liveRam  ?? stats.memory.percent;
  const temp = liveTemp !== undefined ? liveTemp : stats.temperature.cpu;
  const disk = liveDisk !== undefined ? (liveDisk ?? primaryDisk?.percent ?? 0) : (primaryDisk?.percent ?? 0);

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          Live Gauges
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-items-center">
          <div className="flex flex-col items-center">
            <MetricGauge
              value={cpu}
              label="CPU"
              colorThresholds={[
                { value: 0,  color: "#22d3ee" },
                { value: 50, color: "#fbbf24" },
                { value: 80, color: "#f87171" },
              ]}
            />
          </div>
          <div className="flex flex-col items-center">
            <MetricGauge
              value={ram}
              label="RAM"
              colorThresholds={[
                { value: 0,  color: "#a78bfa" },
                { value: 65, color: "#fbbf24" },
                { value: 85, color: "#f87171" },
              ]}
            />
          </div>
          <div className="flex flex-col items-center">
            <MetricGauge
              value={temp ?? 0}
              label="Temp"
              unit="°C"
              colorThresholds={[
                { value: 0,  color: "#4ade80" },
                { value: 55, color: "#fbbf24" },
                { value: 70, color: "#f87171" },
              ]}
              subtitle={temp != null ? `${temp.toFixed(1)}°C` : "No sensor"}
            />
          </div>
          <div className="flex flex-col items-center">
            <MetricGauge
              value={disk}
              label="Disk /"
              colorThresholds={[
                { value: 0,  color: "#4ade80" },
                { value: 75, color: "#fbbf24" },
                { value: 90, color: "#f87171" },
              ]}
              subtitle={primaryDisk ? `${formatBytes(primaryDisk.used_bytes)} / ${formatBytes(primaryDisk.total_bytes)}` : undefined}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { stats, wsConnected, lastUpdated, networkRxHistory, networkTxHistory } = useSystemStore();
  const { metrics: liveMetrics, connected: liveWsConnected } = useMetricsWebSocket();

  // Use live WS metrics to fill in values when the system store hasn't updated yet,
  // or to show the most recent values streamed at 3-second cadence.
  const displayCpu  = liveMetrics?.cpu  ?? stats?.cpu.percent;
  const displayRam  = liveMetrics?.ram  ?? stats?.memory.percent;
  const displayTemp = liveMetrics?.temp ?? stats?.temperature.cpu;
  const displayDisk = liveMetrics?.disk ?? stats?.disks.find((d) => d.mountpoint === "/")?.percent;

  return (
    <div className="p-6 space-y-6">
      {/* Title row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {stats?.hostname ?? "Loading…"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {stats?.os} · {stats?.architecture} · Kernel {stats?.kernel}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {liveWsConnected && liveMetrics && (
            <span
              className="flex items-center gap-1.5 text-xs font-medium text-green-400"
              title="Live metrics streaming via WebSocket"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              Live
            </span>
          )}
          {lastUpdated && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {/* JSON system report export */}
          {stats && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => {
                const report = {
                  exported_at: new Date().toISOString(),
                  hostname: stats.hostname,
                  os: stats.os,
                  kernel: stats.kernel,
                  architecture: stats.architecture,
                  uptime_seconds: stats.uptime_seconds,
                  cpu: { ...stats.cpu, live_percent: displayCpu },
                  memory: { ...stats.memory, live_percent: displayRam },
                  disks: stats.disks,
                  temperature: { ...stats.temperature, live_cpu: displayTemp },
                  network_interfaces: stats.network_interfaces,
                };
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href = url;
                a.download = `system_report_${new Date().toISOString().slice(0,19).replace(/:/g, "-")}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <FileJson className="w-3 h-3" />
              Export
            </Button>
          )}
          <Badge variant={wsConnected ? "success" : "destructive"}>
            {wsConnected ? "Connected" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Live Gauges row — updated via WS at 3-second cadence */}
      <GaugeRow
        liveCpu={displayCpu}
        liveRam={displayRam}
        liveTemp={displayTemp}
        liveDisk={displayDisk}
      />

      {/* Stats cards */}
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
                  ? formatBytes(stats.network_interfaces.filter((i) => i.name !== "lo").reduce((a, b) => a + b.bytes_recv, 0))
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
                  ? formatBytes(stats.network_interfaces.filter((i) => i.name !== "lo").reduce((a, b) => a + b.bytes_sent, 0))
                  : "N/A"}
              </p>
              <SparklineChart data={networkTxHistory} color="#f59e0b" height={28} />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ProcessTable />
          <ServiceStatus />
        </div>
        {/* Gift 7: Quick actions */}
        <div className="space-y-4">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
