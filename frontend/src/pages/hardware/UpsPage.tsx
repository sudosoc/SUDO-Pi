import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, RefreshCw, Plug, AlertTriangle, Zap, Battery } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UpsStatus {
  available: boolean;
  error?: string;
  ups_name?: string;
  devices: string[];
  status?: string;
  on_battery?: boolean;
  on_line?: boolean;
  charging?: boolean;
  discharging?: boolean;
  low_battery?: boolean;
  battery_charge?: number | null;
  battery_runtime?: number | null;
  battery_voltage?: number | null;
  battery_voltage_nominal?: number | null;
  input_voltage?: number | null;
  input_frequency?: number | null;
  output_voltage?: number | null;
  ups_load?: number | null;
  ups_temperature?: number | null;
  model?: string;
  manufacturer?: string;
  serial?: string;
  firmware?: string;
  driver?: string;
  raw?: Record<string, string>;
}

function formatRuntime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function BatteryRing({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct < 20 ? "#f87171" : pct < 40 ? "#fb923c" : "#4ade80";

  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="mx-auto">
      <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(262 26% 11%)" strokeWidth="10" />
      <circle
        cx="70" cy="70" r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        strokeDashoffset={circ / 4}
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
      <text x="70" y="65" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="24" fontWeight="700">
        {pct}%
      </text>
      <text x="70" y="85" textAnchor="middle" dominantBaseline="middle" fill="#6b6b8a" fontSize="11">
        battery
      </text>
    </svg>
  );
}

export default function UpsPage() {
  const { data: ups, isLoading, isFetching, refetch } = useQuery<UpsStatus>({
    queryKey: ["ups-status"],
    queryFn: async () => {
      const { data } = await apiClient.get<UpsStatus>("/ups/status");
      return data;
    },
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  const charge = ups?.battery_charge ?? null;
  const load = ups?.ups_load ?? null;

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BatteryCharging className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">UPS Monitor</h2>
            <p className="text-sm text-muted-foreground">
              Battery backup status via NUT (Network UPS Tools).
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {isLoading ? (
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      ) : !ups?.available ? (
        <Card className="border-amber-500/30">
          <CardContent className="py-12 text-center space-y-3">
            <Battery className="w-10 h-10 text-amber-400/50 mx-auto" />
            <p className="text-sm font-medium text-amber-400">UPS Not Available</p>
            <p className="text-xs text-muted-foreground/70 max-w-sm mx-auto">
              {ups?.error || "No UPS devices detected."}
            </p>
            <div className="text-left mt-4 bg-muted/40 rounded-lg p-4 max-w-sm mx-auto">
              <p className="text-[11px] text-muted-foreground/80 font-mono space-y-1">
                <span className="block"># Install NUT</span>
                <span className="block text-primary/80">sudo apt install nut</span>
                <span className="block mt-2"># Configure your UPS in /etc/nut/ups.conf</span>
                <span className="block"># Then set MODE=netserver in /etc/nut/nut.conf</span>
                <span className="block text-primary/80">sudo systemctl restart nut-server</span>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status banner */}
          {ups.on_battery && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/8 text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">Running on battery — utility power lost.</p>
            </div>
          )}
          {ups.low_battery && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/8 text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">Low battery! Shutdown may be imminent.</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Battery ring */}
            <Card className="border-border/60 flex items-center justify-center py-4">
              <CardContent className="flex flex-col items-center gap-4 pt-0">
                <BatteryRing pct={Math.round(charge ?? 0)} />
                <div className="flex items-center gap-2">
                  {ups.charging && <span className="text-xs text-green-400 font-medium">Charging</span>}
                  {ups.discharging && <span className="text-xs text-amber-400 font-medium">Discharging</span>}
                  {ups.on_line && !ups.charging && !ups.discharging && (
                    <span className="text-xs text-green-400 font-medium">On Line</span>
                  )}
                  {ups.on_battery && <span className="text-xs text-amber-400 font-medium">On Battery</span>}
                </div>
                <p className="text-xs text-muted-foreground/60 font-mono">
                  {ups.ups_name}
                </p>
              </CardContent>
            </Card>

            {/* Metrics */}
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                {
                  label: "Runtime",
                  value: formatRuntime(ups.battery_runtime),
                  icon: <BatteryCharging className="w-4 h-4 text-primary" />,
                },
                {
                  label: "Load",
                  value: load !== null ? `${Math.round(load)}%` : "—",
                  icon: <Zap className="w-4 h-4 text-amber-400" />,
                },
                {
                  label: "Input Voltage",
                  value: ups.input_voltage !== null ? `${ups.input_voltage}V` : "—",
                  icon: <Plug className="w-4 h-4 text-green-400" />,
                },
                {
                  label: "Output Voltage",
                  value: ups.output_voltage !== null ? `${ups.output_voltage}V` : "—",
                  icon: <Plug className="w-4 h-4 text-cyan-400" />,
                },
                {
                  label: "Batt. Voltage",
                  value: ups.battery_voltage !== null ? `${ups.battery_voltage}V` : "—",
                  icon: <Battery className="w-4 h-4 text-violet-400" />,
                },
                {
                  label: "Temperature",
                  value: ups.ups_temperature !== null ? `${ups.ups_temperature}°C` : "—",
                  icon: <RefreshCw className="w-4 h-4 text-muted-foreground/60" />,
                },
              ].map(({ label, value, icon }) => (
                <div key={label} className="metric-card">
                  <div className="flex items-center gap-1.5 mb-2">{icon}<p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p></div>
                  <p className="text-lg font-bold font-mono">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Load bar */}
          {load !== null && (
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">UPS Load</span>
                  <span className="text-xs font-mono font-semibold">{Math.round(load)}%</span>
                </div>
                <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      load > 80 ? "bg-red-500" : load > 60 ? "bg-amber-500" : "bg-green-500",
                    )}
                    style={{ width: `${Math.min(load, 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Device info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Device Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  { label: "Model", value: ups.model || "—" },
                  { label: "Manufacturer", value: ups.manufacturer || "—" },
                  { label: "Serial", value: ups.serial || "—" },
                  { label: "Firmware", value: ups.firmware || "—" },
                  { label: "Driver", value: ups.driver || "—" },
                  { label: "Status code", value: ups.status || "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="font-mono text-xs break-all">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
