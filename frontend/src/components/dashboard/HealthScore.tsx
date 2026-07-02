import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

// ─── Props ────────────────────────────────────────────────────────────────────

interface HealthScoreProps {
  cpu: number;
  ram: number;
  disk: number;
  temp: number | null;
  servicesUpPct: number; // 0–100
}

// ─── Score calculation ────────────────────────────────────────────────────────

interface ScoreBreakdown {
  score: number;
  cpu: number;
  ram: number;
  disk: number;
  temp: number;
  services: number;
}

function computeScore(
  cpu: number,
  ram: number,
  disk: number,
  temp: number | null,
  servicesUpPct: number
): ScoreBreakdown {
  const cpuContrib      = (100 - cpu) * 0.25;
  const ramContrib      = (100 - ram) * 0.25;
  const diskContrib     = (100 - disk) * 0.20;
  const tempContrib     =
    temp != null
      ? Math.max(0, 1 - Math.max(0, (temp - 40) / 40)) * 100 * 0.15
      : 100 * 0.15;
  const servicesContrib = servicesUpPct * 0.15;

  const raw   = cpuContrib + ramContrib + diskContrib + tempContrib + servicesContrib;
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    score,
    cpu:      cpuContrib,
    ram:      ramContrib,
    disk:     diskContrib,
    temp:     tempContrib,
    services: servicesContrib,
  };
}

// ─── Arc helpers ──────────────────────────────────────────────────────────────

// Build an SVG arc path for a semicircle (180° sweep).
// Center (cx, cy), radius r, progress 0–1.
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startAngleDeg));
  const sy = cy + r * Math.sin(toRad(startAngleDeg));
  const ex = cx + r * Math.cos(toRad(endAngleDeg));
  const ey = cy + r * Math.sin(toRad(endAngleDeg));
  // Always use large-arc=0 since we'll never exceed 180° in one call
  const largeArc = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

// The full background arc spans 180° → 0° (left to right in standard SVG coords).
// We map that to angles 180° → 360° (i.e. left semicircle in standard math).
const CX = 100;
const CY = 110;
const R  = 80;
const BG_PATH   = describeArc(CX, CY, R, 180, 360);

function fgPath(progress: number): string {
  // Interpolate from 180° to 360°
  const endAngle = 180 + progress * 180;
  return describeArc(CX, CY, R, 180, Math.min(endAngle, 359.99));
}

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#fbbf24";
  return "#f87171";
}

// ─── Breakdown row ────────────────────────────────────────────────────────────

interface BreakdownRowProps {
  label: string;
  value: number;   // raw contribution (not percentage)
  maxVal: number;  // maximum possible contribution for this metric
}

function BreakdownRow({ label, value, maxVal }: BreakdownRowProps) {
  const pct     = maxVal > 0 ? Math.min(100, (value / maxVal) * 100) : 0;
  const barColor =
    pct >= 80 ? "#4ade80" : pct >= 60 ? "#fbbf24" : "#f87171";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct.toFixed(1)}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-muted-foreground">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HealthScore({ cpu, ram, disk, temp, servicesUpPct }: HealthScoreProps) {
  const breakdown = computeScore(cpu, ram, disk, temp, servicesUpPct);
  const { score }  = breakdown;
  const progress   = score / 100;
  const color      = scoreColor(score);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SVG Gauge */}
        <svg
          viewBox="0 0 200 120"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full max-w-[220px] mx-auto"
          aria-label={`System health score: ${score} out of 100`}
        >
          {/* Background arc */}
          <path
            d={BG_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={12}
            strokeLinecap="round"
          />

          {/* Foreground arc */}
          {progress > 0 && (
            <path
              d={fgPath(progress)}
              fill="none"
              stroke={color}
              strokeWidth={12}
              strokeLinecap="round"
              style={{ transition: "stroke 0.4s ease, d 0.5s ease" }}
            />
          )}

          {/* Score number */}
          <text
            x={CX}
            y={CY - 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="48"
            fontWeight="600"
            fill={color}
          >
            {score}
          </text>

          {/* Label */}
          <text
            x={CX}
            y={CY + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fill="currentColor"
            opacity="0.5"
          >
            Health Score
          </text>
        </svg>

        {/* Breakdown rows */}
        <div className="space-y-2">
          {/* CPU max contribution = 100 * 0.25 = 25 */}
          <BreakdownRow label="CPU"      value={breakdown.cpu}      maxVal={25} />
          {/* RAM max contribution = 100 * 0.25 = 25 */}
          <BreakdownRow label="RAM"      value={breakdown.ram}      maxVal={25} />
          {/* Disk max contribution = 100 * 0.20 = 20 */}
          <BreakdownRow label="Disk"     value={breakdown.disk}     maxVal={20} />
          {/* Temp max contribution = 100 * 0.15 = 15 */}
          <BreakdownRow label="Temp"     value={breakdown.temp}     maxVal={15} />
          {/* Services max contribution = 100 * 0.15 = 15 */}
          <BreakdownRow label="Services" value={breakdown.services} maxVal={15} />
        </div>
      </CardContent>
    </Card>
  );
}
