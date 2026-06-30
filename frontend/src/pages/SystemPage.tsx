import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { useSystemStore } from "@/stores/systemStore";
import { systemApi } from "@/api/system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatBytes, formatUptime } from "@/lib/utils";
import { Activity, Cpu, HardDrive, Network, Server, Thermometer } from "lucide-react";

export default function SystemPage() {
  const { stats, cpuHistory, ramHistory } = useSystemStore();

  const cpuChartOption = {
    animation: false,
    grid: { top: 20, right: 10, bottom: 30, left: 45 },
    xAxis: {
      type: "category",
      data: cpuHistory.map((_, i) => i),
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: "#64748b", fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
    },
    series: [
      {
        type: "line",
        data: cpuHistory,
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#06b6d4", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(6,182,212,0.3)" },
              { offset: 1, color: "rgba(6,182,212,0.02)" },
            ],
          },
        },
      },
    ],
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1e293b",
      borderColor: "#334155",
      textStyle: { color: "#e2e8f0", fontSize: 12 },
      formatter: (params: { data: number }[]) => `CPU: ${params[0]?.data?.toFixed(1)}%`,
    },
  };

  const ramChartOption = {
    ...cpuChartOption,
    series: [
      {
        ...cpuChartOption.series[0],
        data: ramHistory,
        lineStyle: { color: "#a855f7", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(168,85,247,0.3)" },
              { offset: 1, color: "rgba(168,85,247,0.02)" },
            ],
          },
        },
      },
    ],
    tooltip: {
      ...cpuChartOption.tooltip,
      formatter: (params: { data: number }[]) => `RAM: ${params[0]?.data?.toFixed(1)}%`,
    },
  };

  if (!stats) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading system data…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> CPU History (60s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ReactECharts option={cpuChartOption} style={{ height: 160 }} opts={{ renderer: "svg" }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> RAM History (60s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ReactECharts option={ramChartOption} style={{ height: 160 }} opts={{ renderer: "svg" }} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> System Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Hostname", stats.hostname],
              ["OS", stats.os],
              ["Kernel", stats.kernel],
              ["Architecture", stats.architecture],
              ["Uptime", formatUptime(stats.uptime_seconds)],
              ["Cores", `${stats.cpu.core_count} physical / ${stats.cpu.thread_count} threads`],
              ["CPU Freq", `${stats.cpu.frequency_mhz.toFixed(0)} / ${stats.cpu.frequency_max_mhz.toFixed(0)} MHz`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium text-right max-w-[60%] truncate">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5" /> Temperatures</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {stats.temperature.cpu !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPU</span>
                <span className="font-medium">{stats.temperature.cpu.toFixed(1)}°C</span>
              </div>
            )}
            {stats.temperature.gpu !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GPU</span>
                <span className="font-medium">{stats.temperature.gpu.toFixed(1)}°C</span>
              </div>
            )}
            {stats.temperature.sensors.map((s, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground truncate max-w-[55%]">{s.label}</span>
                <span>{s.current.toFixed(1)}°C</span>
              </div>
            ))}
            {!stats.temperature.cpu && !stats.temperature.sensors.length && (
              <p className="text-muted-foreground text-xs">No temperature sensors available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5"><Network className="w-3.5 h-3.5" /> Network Interfaces</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {stats.network_interfaces.map((iface) => (
              <div key={iface.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium font-mono">{iface.name}</span>
                  <Badge variant={iface.is_up ? "success" : "muted"} className="text-[10px]">
                    {iface.is_up ? "UP" : "DOWN"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 ml-2">
                  {iface.addresses.map((addr, i) => (
                    <div key={i} className="font-mono">{addr}</div>
                  ))}
                  <div>↓ {formatBytes(iface.bytes_recv)} · ↑ {formatBytes(iface.bytes_sent)}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Disk Partitions</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.disks.map((disk) => (
              <div key={disk.mountpoint} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{disk.mountpoint}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{disk.device} · {disk.fstype}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)} ({disk.percent.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${disk.percent > 90 ? "bg-destructive" : disk.percent > 75 ? "bg-warning" : "bg-primary"}`}
                    style={{ width: `${disk.percent}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>R: {formatBytes(disk.read_bytes)}</span>
                  <span>W: {formatBytes(disk.write_bytes)}</span>
                  <span>Free: {formatBytes(disk.free_bytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
