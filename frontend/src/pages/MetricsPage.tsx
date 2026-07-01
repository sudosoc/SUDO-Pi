import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { Activity, Thermometer, HardDrive, Wifi } from "lucide-react";
import { metricsApi, type MetricsPoint } from "@/api/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
] as const;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(ts: number, hours: number): string {
  if (hours <= 6) return formatTime(ts);
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Compute per-second rate from cumulative bytes between consecutive points
function computeRates(points: MetricsPoint[]): { t: number; rxRate: number; txRate: number }[] {
  const result: { t: number; rxRate: number; txRate: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000; // seconds
    if (dt <= 0) continue;
    const rxRate = Math.max(0, (points[i].rx - points[i - 1].rx) / dt);
    const txRate = Math.max(0, (points[i].tx - points[i - 1].tx) / dt);
    result.push({ t: points[i].t, rxRate, txRate });
  }
  return result;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-2">
      <Activity className="w-8 h-8 opacity-40" />
      <p className="text-sm font-medium">Collecting data…</p>
      <p className="text-xs">Charts will populate within 1 minute</p>
    </div>
  );
}

interface LineChartProps {
  title: string;
  icon: React.ReactNode;
  series: { name: string; data: [number, number][]; color: string }[];
  yLabel?: string;
  yMax?: number;
  yMin?: number;
  tooltipFormatter?: (value: number) => string;
  hours: number;
  empty: boolean;
}

function LineChart({
  title,
  icon,
  series,
  yLabel = "%",
  yMax = 100,
  yMin = 0,
  tooltipFormatter,
  hours,
  empty,
}: LineChartProps) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      formatter: (params: { axisValue: number; seriesName: string; value: [number, number] }[]) => {
        const time = formatDateTime(params[0]?.axisValue, hours);
        const lines = params.map((p) => {
          const val = tooltipFormatter
            ? tooltipFormatter(p.value[1])
            : `${p.value[1].toFixed(1)}${yLabel}`;
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${
            series.find((s) => s.name === p.seriesName)?.color ?? "#888"
          };margin-right:6px;"></span>${p.seriesName}: <b>${val}</b>`;
        });
        return `<div style="font-size:12px;">${time}<br/>${lines.join("<br/>")}</div>`;
      },
    },
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: "time",
      axisLabel: {
        formatter: (val: number) => formatTime(val),
        fontSize: 11,
        color: "var(--muted-foreground, #888)",
      },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: "var(--border, #333)" } },
    },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      axisLabel: {
        formatter: (v: number) => `${v}${yLabel}`,
        fontSize: 11,
        color: "var(--muted-foreground, #888)",
      },
      splitLine: { lineStyle: { color: "var(--border, #333)", type: "dashed" } },
    },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      showSymbol: false,
      data: s.data,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: s.color + "33" },
            { offset: 1, color: s.color + "00" },
          ],
        },
      },
    })),
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {empty ? (
          <EmptyState />
        ) : (
          <ReactECharts option={option} style={{ height: 200 }} notMerge />
        )}
      </CardContent>
    </Card>
  );
}

export default function MetricsPage() {
  const [hours, setHours] = useState(1);

  const { data: points = [], isLoading } = useQuery({
    queryKey: ["metrics-history", hours],
    queryFn: () => metricsApi.getHistory(hours),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const hasData = points.length > 0;

  // CPU series
  const cpuData: [number, number][] = points.map((p) => [p.t, p.cpu]);

  // RAM series
  const ramData: [number, number][] = points.map((p) => [p.t, p.ram]);

  // Temperature series (filter nulls)
  const tempData: [number, number][] = points
    .filter((p) => p.temp !== null)
    .map((p) => [p.t, p.temp as number]);
  const hasTemp = tempData.length > 0;

  // Network rates
  const rates = computeRates(points);
  const rxData: [number, number][] = rates.map((r) => [r.t, r.rxRate]);
  const txData: [number, number][] = rates.map((r) => [r.t, r.txRate]);
  const maxNetRate = Math.max(...rates.map((r) => Math.max(r.rxRate, r.txRate)), 1024);

  // Temperature color: red when > 80°C
  const maxTemp = tempData.length > 0 ? Math.max(...tempData.map((d) => d[1])) : 0;
  const tempColor = maxTemp > 80 ? "hsl(var(--destructive))" : "hsl(var(--warning, 38 92% 50%))";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Performance History</h2>
          <p className="text-sm text-muted-foreground">Historical system metrics</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {TIME_RANGES.map((r) => (
            <Button
              key={r.hours}
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-3 text-xs font-medium",
                hours === r.hours && "bg-background shadow-sm text-foreground"
              )}
              onClick={() => setHours(r.hours)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading metrics…
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineChart
            title="CPU Usage"
            icon={<Activity className="w-3.5 h-3.5" />}
            series={[{ name: "CPU", data: cpuData, color: "hsl(var(--primary))" }]}
            yLabel="%"
            yMax={100}
            yMin={0}
            hours={hours}
            empty={!hasData}
          />

          <LineChart
            title="RAM Usage"
            icon={<HardDrive className="w-3.5 h-3.5" />}
            series={[{ name: "RAM", data: ramData, color: "hsl(var(--warning, 38 92% 50%))" }]}
            yLabel="%"
            yMax={100}
            yMin={0}
            hours={hours}
            empty={!hasData}
          />

          <LineChart
            title="CPU Temperature"
            icon={<Thermometer className="w-3.5 h-3.5" />}
            series={[{ name: "Temperature", data: tempData, color: tempColor }]}
            yLabel="°C"
            yMax={100}
            yMin={0}
            hours={hours}
            empty={!hasData || !hasTemp}
          />

          <LineChart
            title="Network Throughput"
            icon={<Wifi className="w-3.5 h-3.5" />}
            series={[
              { name: "RX", data: rxData, color: "hsl(var(--success, 142 76% 36%))" },
              { name: "TX", data: txData, color: "hsl(var(--primary))" },
            ]}
            yLabel=" B/s"
            yMax={maxNetRate * 1.1}
            yMin={0}
            tooltipFormatter={formatBytes}
            hours={hours}
            empty={!hasData || rates.length === 0}
          />
        </div>
      )}
    </div>
  );
}
