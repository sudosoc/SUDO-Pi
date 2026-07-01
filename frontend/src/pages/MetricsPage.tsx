import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { Activity, Thermometer, HardDrive, Wifi, Heart } from "lucide-react";
import { metricsApi, type MetricsPoint } from "@/api/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Hardcoded theme colors (ECharts cannot resolve CSS vars) ─────────────────
const C = {
  cpu:       "#22d3ee",   // cyan
  ram:       "#fb923c",   // orange
  tempNorm:  "#facc15",   // yellow
  tempHot:   "#f87171",   // red
  rx:        "#4ade80",   // green
  tx:        "#a78bfa",   // violet
  muted:     "#6b7280",
  border:    "#2b2b2b",
} as const;

// ─── Time ranges ──────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNetRate(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(ts: number, hours: number): string {
  if (hours <= 6) return fmtTime(ts);
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function computeRates(points: MetricsPoint[]): { t: number; rx: number; tx: number }[] {
  const out: { t: number; rx: number; tx: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt <= 0) continue;
    out.push({
      t: points[i].t,
      rx: Math.max(0, (points[i].rx - points[i - 1].rx) / dt),
      tx: Math.max(0, (points[i].tx - points[i - 1].tx) / dt),
    });
  }
  return out;
}

// ─── Gift 1: Health Score ─────────────────────────────────────────────────────
function healthScore(p: MetricsPoint): number {
  const cpuScore  = Math.max(0, 100 - p.cpu);
  const ramScore  = Math.max(0, 100 - p.ram);
  const diskScore = p.disk != null ? Math.max(0, 100 - p.disk) : 100;
  let tempScore = 100;
  if (p.temp != null) {
    if (p.temp >= 80) tempScore = 0;
    else if (p.temp > 50) tempScore = 100 - ((p.temp - 50) / 30) * 100;
  }
  return Math.round((cpuScore * 0.3 + ramScore * 0.3 + diskScore * 0.2 + tempScore * 0.2));
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Fair" : "Critical";
  const ring  = score >= 80 ? "ring-green-400/30" : score >= 60 ? "ring-yellow-400/30" : "ring-red-400/30";
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 ring-1", ring)}>
      <Heart className={cn("w-5 h-5 shrink-0", color)} />
      <div>
        <p className="text-xs text-muted-foreground">System Health</p>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("text-2xl font-bold tabular-nums", color)}>{score}</span>
          <span className={cn("text-xs font-medium", color)}>/ 100 — {label}</span>
        </div>
      </div>
      {/* score bar */}
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden ml-2">
        <div
          className={cn("h-full rounded-full transition-all duration-700",
            score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ─── Live Stat Card ───────────────────────────────────────────────────────────
function LiveStat({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-2">
      <Activity className="w-8 h-8 opacity-40" />
      <p className="text-sm font-medium">Collecting data…</p>
      <p className="text-xs">Charts populate every 60 seconds</p>
    </div>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────
interface ChartSeries { name: string; data: [number, number][]; color: string }

function LineChart({
  title, icon, series, yLabel = "%", yMax = 100, yMin = 0,
  tooltipFormatter, hours, empty,
}: {
  title: string; icon: React.ReactNode;
  series: ChartSeries[];
  yLabel?: string; yMax?: number; yMin?: number;
  tooltipFormatter?: (v: number) => string;
  hours: number; empty: boolean;
}) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1c1c1c",
      borderColor: "#2b2b2b",
      textStyle: { color: "#e8e8e8", fontSize: 12 },
      formatter: (params: { axisValue: number; seriesName: string; value: [number, number] }[]) => {
        const time = fmtDateTime(params[0]?.axisValue, hours);
        const lines = params.map((p) => {
          const val = tooltipFormatter
            ? tooltipFormatter(p.value[1])
            : `${p.value[1].toFixed(1)}${yLabel}`;
          const col = series.find((s) => s.name === p.seriesName)?.color ?? "#888";
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px;"></span>${p.seriesName}: <b>${val}</b>`;
        });
        return `<div style="font-size:12px;line-height:1.6">${time}<br/>${lines.join("<br/>")}</div>`;
      },
    },
    grid: { left: 52, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: "time",
      axisLabel: { formatter: (v: number) => fmtTime(v), fontSize: 10, color: C.muted },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: C.border } },
    },
    yAxis: {
      type: "value", min: yMin, max: yMax,
      axisLabel: { formatter: (v: number) => `${v}${yLabel}`, fontSize: 10, color: C.muted },
      splitLine: { lineStyle: { color: C.border, type: "dashed" } },
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
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: s.color + "44" },
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
        {empty ? <EmptyState /> : <ReactECharts option={option} style={{ height: 200 }} notMerge />}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MetricsPage() {
  const [hours, setHours] = useState(1);

  const { data: points = [], isLoading } = useQuery({
    queryKey: ["metrics-history", hours],
    queryFn: () => metricsApi.getHistory(hours),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const hasData = points.length > 0;
  const latest  = hasData ? points[points.length - 1] : null;
  const score   = latest ? healthScore(latest) : null;

  const cpuData:  [number, number][] = points.map((p) => [p.t, p.cpu]);
  const ramData:  [number, number][] = points.map((p) => [p.t, p.ram]);
  const tempData: [number, number][] = points.filter((p) => p.temp != null).map((p) => [p.t, p.temp as number]);
  const hasTemp = tempData.length > 0;
  const maxTemp = hasTemp ? Math.max(...tempData.map((d) => d[1])) : 0;
  const tempColor = maxTemp > 80 ? C.tempHot : C.tempNorm;

  const rates = computeRates(points);
  const rxData: [number, number][] = rates.map((r) => [r.t, r.rx]);
  const txData: [number, number][] = rates.map((r) => [r.t, r.tx]);
  const maxNet = Math.max(...rates.map((r) => Math.max(r.rx, r.tx)), 1024);

  return (
    <div className="p-6 space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Performance History</h2>
          <p className="text-sm text-muted-foreground">Historical system metrics — recorded every 60 s</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {TIME_RANGES.map((r) => (
            <Button
              key={r.hours}
              variant="ghost"
              size="sm"
              className={cn("h-7 px-3 text-xs font-medium", hours === r.hours && "bg-background shadow-sm text-foreground")}
              onClick={() => setHours(r.hours)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Gift 1 — Live stats + health score */}
      {latest && (
        <>
          <HealthBadge score={score!} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <LiveStat
              label="CPU (latest)"
              value={`${latest.cpu.toFixed(1)}%`}
              sub={`${points.length} samples`}
              color="text-cyan-400"
            />
            <LiveStat
              label="RAM (latest)"
              value={`${latest.ram.toFixed(1)}%`}
              color="text-orange-400"
            />
            <LiveStat
              label="Temperature"
              value={latest.temp != null ? `${latest.temp.toFixed(1)}°C` : "—"}
              color={latest.temp != null && latest.temp > 70 ? "text-red-400" : "text-yellow-400"}
            />
            <LiveStat
              label="Last recorded"
              value={fmtTime(latest.t)}
              sub={new Date(latest.t).toLocaleDateString()}
              color="text-muted-foreground"
            />
          </div>
        </>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading metrics…
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineChart
            title="CPU Usage"
            icon={<Activity className="w-3.5 h-3.5 text-cyan-400" />}
            series={[{ name: "CPU", data: cpuData, color: C.cpu }]}
            yLabel="%" yMax={100} yMin={0}
            hours={hours} empty={!hasData}
          />
          <LineChart
            title="RAM Usage"
            icon={<HardDrive className="w-3.5 h-3.5 text-orange-400" />}
            series={[{ name: "RAM", data: ramData, color: C.ram }]}
            yLabel="%" yMax={100} yMin={0}
            hours={hours} empty={!hasData}
          />
          <LineChart
            title="CPU Temperature"
            icon={<Thermometer className="w-3.5 h-3.5 text-yellow-400" />}
            series={[{ name: "Temperature", data: tempData, color: tempColor }]}
            yLabel="°C" yMax={100} yMin={0}
            hours={hours} empty={!hasData || !hasTemp}
          />
          <LineChart
            title="Network Throughput"
            icon={<Wifi className="w-3.5 h-3.5 text-green-400" />}
            series={[
              { name: "RX", data: rxData, color: C.rx },
              { name: "TX", data: txData, color: C.tx },
            ]}
            yLabel=" B/s" yMax={maxNet * 1.1} yMin={0}
            tooltipFormatter={fmtNetRate}
            hours={hours} empty={!hasData || rates.length === 0}
          />
        </div>
      )}
    </div>
  );
}
