import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Thermometer, HardDrive, Wifi, Heart, Download } from "lucide-react";
import { metricsApi, type MetricsPoint } from "@/api/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Hardcoded colors (same palette as Dashboard) ─────────────────────────────
const C = {
  cpu:      "#22d3ee",   // cyan
  ram:      "#fb923c",   // orange
  tempNorm: "#facc15",   // yellow
  tempHot:  "#f87171",   // red
  rx:       "#4ade80",   // green
  tx:       "#a78bfa",   // violet
  muted:    "#6b7280",
  grid:     "#2b2b2b",
  axis:     "#3a3a3a",
} as const;

// ─── Time ranges ──────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: "1h",  hours: 1   },
  { label: "6h",  hours: 6   },
  { label: "24h", hours: 24  },
  { label: "7d",  hours: 168 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNetRate(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytes >= 1024)        return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(ts: number, hours: number): string {
  if (hours <= 6) return fmtTime(ts);
  return new Date(ts).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function computeRates(points: MetricsPoint[]): { t: number; rx: number; tx: number }[] {
  const out: { t: number; rx: number; tx: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt <= 0) continue;
    out.push({
      t:  points[i].t,
      rx: Math.max(0, (points[i].rx - points[i - 1].rx) / dt),
      tx: Math.max(0, (points[i].tx - points[i - 1].tx) / dt),
    });
  }
  return out;
}

// Thin the data when there are too many points (e.g. 7-day view)
function downsample(data: [number, number][], max = 500): [number, number][] {
  if (data.length <= max) return data;
  const step = Math.ceil(data.length / max);
  const result: [number, number][] = [];
  for (let i = 0; i < data.length; i++) {
    if (i % step === 0 || i === data.length - 1) result.push(data[i]);
  }
  return result;
}

// ─── Health Score ─────────────────────────────────────────────────────────────
function healthScore(p: MetricsPoint): number {
  const cpuScore  = Math.max(0, 100 - p.cpu);
  const ramScore  = Math.max(0, 100 - p.ram);
  const diskScore = p.disk != null ? Math.max(0, 100 - p.disk) : 100;
  let tempScore   = 100;
  if (p.temp != null) {
    if (p.temp >= 80)      tempScore = 0;
    else if (p.temp > 50)  tempScore = 100 - ((p.temp - 50) / 30) * 100;
  }
  return Math.round(cpuScore * 0.3 + ramScore * 0.3 + diskScore * 0.2 + tempScore * 0.2);
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

// ─── Pure SVG Line Chart ──────────────────────────────────────────────────────
// Replaces echarts-for-react entirely for guaranteed color rendering.

interface ChartSeries { name: string; data: [number, number][]; color: string }

const PAD = { l: 52, r: 14, t: 12, b: 30 } as const;
const CHART_H = 210;

function SvgLineChart({
  title, icon, series, yLabel = "%", yMin = 0, yMax = 100,
  tooltipFormatter, hours, empty,
}: {
  title: string; icon: React.ReactNode; series: ChartSeries[];
  yLabel?: string; yMin?: number; yMax?: number;
  tooltipFormatter?: (v: number) => string; hours: number; empty: boolean;
}) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [svgW,  setSvgW]  = useState(600);
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const [hoverXPx, setHoverXPx] = useState<number | null>(null);

  const plotW = svgW - PAD.l - PAD.r;
  const plotH = CHART_H - PAD.t - PAD.b;

  // Track container width
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setSvgW(el.clientWidth || 600);
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setSvgW(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // All unique sorted timestamps across all series
  const allTs = useMemo(() => {
    const set = new Set<number>();
    series.forEach((s) => s.data.forEach(([t]) => set.add(t)));
    return Array.from(set).sort((a, b) => a - b);
  }, [series]);

  const xMin = allTs[0]  ?? 0;
  const xMax = allTs[allTs.length - 1] ?? (xMin + 1);

  const toX = (t: number): number =>
    PAD.l + ((t - xMin) / Math.max(xMax - xMin, 1)) * plotW;
  const toY = (v: number): number =>
    PAD.t + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / Math.max(yMax - yMin, 1)) * plotH;

  // Y-axis ticks (5 lines)
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => yMin + f * (yMax - yMin));

  // X-axis time labels (up to 6)
  const xTicks = useMemo(() => {
    if (allTs.length < 2) return allTs.slice();
    const n = Math.min(6, allTs.length);
    return Array.from({ length: n }, (_, i) =>
      allTs[Math.round((i / (n - 1)) * (allTs.length - 1))]
    );
  }, [allTs]);

  const fmtTick = (ts: number) =>
    hours <= 6
      ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // Mouse tracking
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || allTs.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const t    = xMin + ((mx - PAD.l) / Math.max(plotW, 1)) * (xMax - xMin);
    let best = 0, bestDiff = Infinity;
    allTs.forEach((ts, i) => {
      const diff = Math.abs(ts - t);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    setHoverTs(allTs[best]);
    setHoverXPx(toX(allTs[best]));
  };

  const hoveredVals = useMemo(
    () =>
      hoverTs !== null
        ? series.map((s) => ({
            name:  s.name,
            color: s.color,
            value: s.data.find(([t]) => t === hoverTs)?.[1] ?? null,
          }))
        : [],
    [hoverTs, series]
  );

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
          {/* Legend for multi-series charts */}
          {series.length > 1 && (
            <div className="ml-auto flex gap-4">
              {series.map((s) => (
                <span key={s.name} className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <span className="inline-block w-5 h-0.5 rounded" style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        {empty ? (
          <EmptyState />
        ) : (
          <div className="relative select-none">
            <svg
              ref={svgRef}
              width="100%"
              height={CHART_H}
              style={{ display: "block" }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => { setHoverTs(null); setHoverXPx(null); }}
            >
              <defs>
                {series.map((s) => {
                  const id = `mg-${s.color.replace("#", "")}`;
                  return (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={s.color} stopOpacity="0.45" />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0.0"  />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* Y grid lines + labels */}
              {yTicks.map((v, i) => {
                const y = toY(v);
                return (
                  <g key={i}>
                    <line
                      x1={PAD.l} y1={y} x2={svgW - PAD.r} y2={y}
                      stroke={C.grid} strokeDasharray="4 3" strokeWidth="0.8"
                    />
                    <text
                      x={PAD.l - 5} y={y + 3.5}
                      textAnchor="end" fontSize="10" fill={C.muted}
                    >
                      {Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}{yLabel}
                    </text>
                  </g>
                );
              })}

              {/* X-axis baseline */}
              <line
                x1={PAD.l} y1={PAD.t + plotH}
                x2={svgW - PAD.r} y2={PAD.t + plotH}
                stroke={C.axis} strokeWidth="1"
              />

              {/* X-axis time labels */}
              {xTicks.map((ts, i) => (
                <text
                  key={i} x={toX(ts)} y={CHART_H - 8}
                  textAnchor="middle" fontSize="9" fill={C.muted}
                >
                  {fmtTick(ts)}
                </text>
              ))}

              {/* Area fills + lines per series */}
              {series.map((s) => {
                const clean = downsample(
                  s.data.filter(([, v]) => v != null && isFinite(v))
                );
                if (clean.length === 0) return null;

                const coords = clean.map(([t, v]) =>
                  `${toX(t).toFixed(1)} ${toY(v).toFixed(1)}`
                );

                if (clean.length === 1) {
                  // Single point — draw circle
                  return (
                    <circle
                      key={s.name}
                      cx={toX(clean[0][0])} cy={toY(clean[0][1])}
                      r="4" fill={s.color}
                    />
                  );
                }

                const linePath = `M ${coords.join(" L ")}`;
                const firstX   = toX(clean[0][0]).toFixed(1);
                const lastX    = toX(clean[clean.length - 1][0]).toFixed(1);
                const baseY    = (PAD.t + plotH).toFixed(1);
                const areaPath = `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;

                return (
                  <g key={s.name}>
                    <path
                      d={areaPath}
                      fill={`url(#mg-${s.color.replace("#", "")})`}
                    />
                    <path
                      d={linePath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Show symbols when data is sparse */}
                    {clean.length <= 15 &&
                      clean.map(([t, v], idx) => (
                        <circle
                          key={idx}
                          cx={toX(t)} cy={toY(v)}
                          r="3.5" fill={s.color}
                        />
                      ))}
                  </g>
                );
              })}

              {/* Hover crosshair */}
              {hoverXPx !== null && (
                <line
                  x1={hoverXPx} y1={PAD.t}
                  x2={hoverXPx} y2={PAD.t + plotH}
                  stroke="#ffffff22" strokeWidth="1"
                />
              )}

              {/* Invisible mouse-tracking rect */}
              <rect
                x={PAD.l} y={PAD.t} width={plotW} height={plotH}
                fill="transparent" style={{ cursor: "crosshair" }}
              />
            </svg>

            {/* Tooltip card */}
            {hoverTs !== null && hoveredVals.some((v) => v.value !== null) && (
              <div className="absolute top-2 right-3 z-10 pointer-events-none bg-card/95 border border-border rounded-lg px-3 py-2 text-xs shadow-xl min-w-[110px]">
                <p className="text-[10px] text-muted-foreground mb-1.5">
                  {fmtDateTime(hoverTs, hours)}
                </p>
                {hoveredVals.map(
                  (v) =>
                    v.value !== null && (
                      <div key={v.name} className="flex items-center gap-2 py-0.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: v.color }}
                        />
                        <span className="font-mono font-bold" style={{ color: v.color }}>
                          {tooltipFormatter
                            ? tooltipFormatter(v.value)
                            : `${v.value.toFixed(1)}${yLabel}`}
                        </span>
                        {series.length > 1 && (
                          <span className="text-muted-foreground">{v.name}</span>
                        )}
                      </div>
                    )
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MetricsPage() {
  const [hours, setHours] = useState(1);

  const { data: points = [], isLoading } = useQuery({
    queryKey: ["metrics-history", hours],
    queryFn:  () => metricsApi.getHistory(hours),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const hasData = points.length > 0;
  const latest  = hasData ? points[points.length - 1] : null;
  const score   = latest ? healthScore(latest) : null;

  const cpuData:  [number, number][] = points.map((p) => [p.t, p.cpu]);
  const ramData:  [number, number][] = points.map((p) => [p.t, p.ram]);
  const tempData: [number, number][] = points
    .filter((p) => p.temp != null)
    .map((p) => [p.t, p.temp as number]);
  const hasTemp  = tempData.length > 0;
  const maxTemp  = hasTemp ? Math.max(...tempData.map((d) => d[1])) : 0;
  const tempColor = maxTemp > 80 ? C.tempHot : C.tempNorm;

  const rates  = computeRates(points);
  const rxData: [number, number][] = rates.map((r) => [r.t, r.rx]);
  const txData: [number, number][] = rates.map((r) => [r.t, r.tx]);
  const maxNet = Math.max(...rates.map((r) => Math.max(r.rx, r.tx)), 1024);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Performance History</h2>
          <p className="text-sm text-muted-foreground">Historical system metrics — recorded every 60 s</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time-range selector */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {TIME_RANGES.map((r) => (
              <Button
                key={r.hours}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs font-medium",
                  hours === r.hours && "bg-background shadow-sm text-foreground",
                )}
                onClick={() => setHours(r.hours)}
              >
                {r.label}
              </Button>
            ))}
          </div>

          {/* CSV export */}
          {points.length > 0 && (
            <Button
              variant="outline" size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => {
                const rateMap = new Map(computeRates(points).map((r) => [r.t, r]));
                const header  = "timestamp,cpu_%,ram_%,disk_%,temp_c,rx_bytes_s,tx_bytes_s";
                const rows    = points.map((p) => {
                  const r = rateMap.get(p.t);
                  return [
                    new Date(p.t).toISOString(),
                    p.cpu.toFixed(2),
                    p.ram.toFixed(2),
                    p.disk?.toFixed(2) ?? "",
                    p.temp?.toFixed(2) ?? "",
                    r?.rx.toFixed(0)   ?? "",
                    r?.tx.toFixed(0)   ?? "",
                  ].join(",");
                });
                const csv  = [header, ...rows].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href = url;
                a.download = `metrics_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Health score + live stats */}
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

      {/* 24-hour CPU heatmap */}
      {!isLoading && hasData && hours >= 24 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              CPU Activity Heatmap — Hour of Day
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {(() => {
              const buckets = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
              points.forEach((p) => {
                const h = new Date(p.t).getHours();
                buckets[h].sum   += p.cpu;
                buckets[h].count += 1;
              });
              return (
                <>
                  <div className="flex gap-0.5 flex-wrap">
                    {buckets.map(({ sum, count }, hour) => {
                      const avg = count > 0 ? sum / count : null;
                      const pct = avg ?? 0;
                      const bg  = pct >= 80 ? "#f87171"
                                : pct >= 60 ? "#fb923c"
                                : pct >= 40 ? "#fbbf24"
                                : pct >= 15 ? "#4ade80"
                                : "#1f2937";
                      return (
                        <div
                          key={hour}
                          title={`${String(hour).padStart(2, "0")}:00 — ${avg != null ? `avg ${avg.toFixed(1)}%` : "no data"}`}
                          className="flex-1 min-w-[20px] h-9 rounded-sm cursor-default flex flex-col items-center justify-end pb-0.5"
                          style={{ backgroundColor: bg + "cc" }}
                        >
                          <span className="text-[8px] text-white/70 font-mono leading-none">
                            {String(hour).padStart(2, "0")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span>Low</span>
                    {(["#1f2937", "#4ade80cc", "#fbbf24cc", "#fb923ccc", "#f87171cc"] as const).map((c) => (
                      <span key={c} className="w-4 h-2 rounded-sm inline-block" style={{ backgroundColor: c }} />
                    ))}
                    <span>High</span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Four charts */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SvgLineChart
            title="CPU Usage"
            icon={<Activity className="w-3.5 h-3.5" style={{ color: C.cpu }} />}
            series={[{ name: "CPU", data: cpuData, color: C.cpu }]}
            yLabel="%" yMax={100} yMin={0}
            hours={hours} empty={!hasData}
          />
          <SvgLineChart
            title="RAM Usage"
            icon={<HardDrive className="w-3.5 h-3.5" style={{ color: C.ram }} />}
            series={[{ name: "RAM", data: ramData, color: C.ram }]}
            yLabel="%" yMax={100} yMin={0}
            hours={hours} empty={!hasData}
          />
          <SvgLineChart
            title="CPU Temperature"
            icon={<Thermometer className="w-3.5 h-3.5" style={{ color: tempColor }} />}
            series={[{ name: "Temperature", data: tempData, color: tempColor }]}
            yLabel="°C" yMax={100} yMin={0}
            hours={hours} empty={!hasData || !hasTemp}
          />
          <SvgLineChart
            title="Network Throughput"
            icon={<Wifi className="w-3.5 h-3.5" style={{ color: C.rx }} />}
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
