import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HeartPulse, RefreshCw, HardDrive, CheckCircle2, XCircle, AlertTriangle,
  Thermometer, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  raw: number;
  flag: string;
}

interface DiskInfo {
  device: string;
  model: string;
  serial: string;
  capacity: string;
  health: "PASSED" | "FAILED" | "UNKNOWN";
  temperature: number | null;
  power_on_hours: number | null;
  reallocated_sectors: number;
  pending_sectors: number;
  uncorrectable_sectors: number;
  attributes: SmartAttribute[];
  smart_available: boolean;
  is_ssd: boolean;
}

const CRITICAL_ATTRS = new Set([5, 197, 198, 10, 196]);


function healthBorder(h: string) {
  if (h === "PASSED") return "border-green-500/30";
  if (h === "FAILED") return "border-red-500/40";
  return "border-border/60";
}

function PowerHours({ hours }: { hours: number | null }) {
  if (hours === null) return <span className="text-muted-foreground/50">—</span>;
  const days = Math.floor(hours / 24);
  const yrs = (days / 365).toFixed(1);
  return (
    <span>
      {hours.toLocaleString()}h
      <span className="text-muted-foreground/60 ml-1 text-[11px]">({yrs}y)</span>
    </span>
  );
}

function DiskCard({ disk }: { disk: DiskInfo }) {
  const [expanded, setExpanded] = useState(false);

  const badAttrs = disk.attributes.filter(
    (a) => CRITICAL_ATTRS.has(a.id) && a.raw > 0,
  );

  return (
    <Card className={cn("border transition-colors", healthBorder(disk.health))}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-primary/80">{disk.device}</span>
          {disk.model && (
            <span className="text-xs font-normal text-muted-foreground truncate">{disk.model}</span>
          )}
          <span className={cn(
            "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
            disk.health === "PASSED"
              ? "bg-green-500/15 text-green-400"
              : disk.health === "FAILED"
              ? "bg-red-500/15 text-red-400"
              : "bg-muted text-muted-foreground",
          )}>
            {disk.health}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!disk.smart_available && (
          <div className="text-xs px-3 py-2 rounded-lg border border-amber-500/30 text-amber-400 bg-amber-500/5">
            SMART data unavailable for this device. Install <code className="font-mono">smartmontools</code> or check device support.
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="metric-card text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Health</p>
            <div className="mt-1 flex justify-center">
              {disk.health === "PASSED"
                ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                : disk.health === "FAILED"
                ? <XCircle className="w-5 h-5 text-red-400" />
                : <AlertTriangle className="w-5 h-5 text-muted-foreground/40" />
              }
            </div>
          </div>
          <div className="metric-card text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Temperature</p>
            <p className={cn("text-lg font-bold mt-1",
              disk.temperature === null ? "text-muted-foreground/40"
              : disk.temperature > 55 ? "text-red-400"
              : disk.temperature > 45 ? "text-amber-400"
              : "text-cyan-400",
            )}>
              {disk.temperature !== null ? `${disk.temperature}°C` : "—"}
            </p>
          </div>
          <div className="metric-card text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Power-On Hours</p>
            <p className="text-sm font-bold mt-1 tabular">
              <PowerHours hours={disk.power_on_hours} />
            </p>
          </div>
          <div className="metric-card text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Type</p>
            <p className="text-sm font-bold mt-1">{disk.is_ssd ? "SSD" : "HDD"}</p>
          </div>
        </div>

        {/* Bad sectors warning */}
        {badAttrs.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-400 space-y-0.5">
              {badAttrs.map((a) => (
                <p key={a.id}><span className="font-semibold">{a.name}:</span> {a.raw.toLocaleString()} (non-zero)</p>
              ))}
            </div>
          </div>
        )}

        {/* Sector health */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Reallocated", val: disk.reallocated_sectors },
            { label: "Pending", val: disk.pending_sectors },
            { label: "Uncorrectable", val: disk.uncorrectable_sectors },
          ].map(({ label, val }) => (
            <div key={label} className={cn(
              "rounded-lg border px-2 py-1.5",
              val > 0 ? "border-red-500/30 bg-red-500/5" : "border-border/40 bg-muted/20",
            )}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={cn("text-sm font-bold mt-0.5", val > 0 ? "text-red-400" : "text-green-400")}>
                {val}
              </p>
            </div>
          ))}
        </div>

        {/* Attribute table toggle */}
        {disk.attributes.length > 0 && (
          <>
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setExpanded((v) => !v)}
            >
              SMART Attributes ({disk.attributes.length})
              {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
            </button>
            {expanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/40 text-[9px] text-muted-foreground uppercase tracking-wide">
                      <th className="text-left py-1.5 pr-3">ID</th>
                      <th className="text-left py-1.5 pr-3">Attribute</th>
                      <th className="text-right py-1.5 pr-3">Value</th>
                      <th className="text-right py-1.5 pr-3">Worst</th>
                      <th className="text-right py-1.5 pr-3">Thresh</th>
                      <th className="text-right py-1.5">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disk.attributes.map((a) => {
                      const isBad = CRITICAL_ATTRS.has(a.id) && a.raw > 0;
                      return (
                        <tr key={a.id} className={cn(
                          "border-b border-border/20 last:border-0",
                          isBad && "bg-red-500/5",
                        )}>
                          <td className="py-1 pr-3 font-mono text-muted-foreground/60">{a.id}</td>
                          <td className={cn("py-1 pr-3", isBad ? "text-red-400" : "")}>{a.name}</td>
                          <td className="py-1 pr-3 text-right font-mono">{a.value}</td>
                          <td className="py-1 pr-3 text-right font-mono text-muted-foreground/60">{a.worst}</td>
                          <td className="py-1 pr-3 text-right font-mono text-muted-foreground/60">{a.threshold}</td>
                          <td className={cn("py-1 text-right font-mono", isBad ? "text-red-400 font-semibold" : "")}>{a.raw.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SmartDiskPage() {
  const { data: disks, isLoading, isFetching, refetch } = useQuery<DiskInfo[]>({
    queryKey: ["smart-disks"],
    queryFn: async () => {
      const { data } = await apiClient.get<DiskInfo[]>("/smart/disks");
      return data;
    },
    staleTime: 60_000,
  });

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HeartPulse className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">SMART Disk Health</h2>
            <p className="text-sm text-muted-foreground">
              Drive health, temperature, hours, and SMART attributes via smartctl.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : !disks || disks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <HardDrive className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No SMART-capable disks found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Install <code className="font-mono text-[11px]">sudo apt install smartmontools</code> and ensure
              your storage device supports SMART.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {disks.map((disk) => <DiskCard key={disk.device} disk={disk} />)}
        </div>
      )}

      {disks && disks.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Thermometer className="w-3.5 h-3.5 shrink-0" />
          <p>
            SMART data is read via <code className="font-mono">sudo smartctl -a</code>.
            Critical attributes: Reallocated Sectors (5), Current Pending (197), Offline Uncorrectable (198).
            Non-zero values on these indicate drive degradation.
          </p>
        </div>
      )}
    </div>
  );
}
