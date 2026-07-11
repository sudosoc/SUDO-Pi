import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldBan, Gauge, Moon, MonitorSmartphone, RefreshCw,
  Download, Upload, ChevronDown, ChevronUp, Trash2, Ban, CircleCheck,
  BarChart2, HardDrive, Calendar,
} from "lucide-react";
import ReactECharts from "echarts-for-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CurfewEntry {
  days: number[];
  start: string;
  end: string;
}

interface DevicePolicy {
  id: number;
  mac: string;
  hostname: string | null;
  last_ip: string | null;
  download_kbps: number;
  upload_kbps: number;
  blocked: boolean;
  schedule_enabled: boolean;
  block_start: string;
  block_end: string;
  curfew_schedule: CurfewEntry[] | null;
  monthly_quota_mb: number;
  quota_reset_day: number;
  updated_at: string | null;
}

interface ApClient {
  hostname?: string | null;
  ip_address?: string | null;
  mac_address?: string;
  signal_dbm?: number | null;
}

interface MergedDevice {
  mac: string;
  hostname: string;
  ip: string | null;
  online: boolean;
  policy: DevicePolicy | null;
}

interface PolicyUpdate {
  hostname?: string;
  last_ip?: string;
  download_kbps?: number;
  upload_kbps?: number;
  blocked?: boolean;
  schedule_enabled?: boolean;
  block_start?: string;
  block_end?: string;
  curfew_schedule?: CurfewEntry[];
  monthly_quota_mb?: number;
  quota_reset_day?: number;
}

interface BandwidthPoint {
  timestamp: string;
  rx_mb: number;
  tx_mb: number;
  monthly_rx_mb: number;
  monthly_tx_mb: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const policiesApi = {
  list: async (): Promise<{ policies: DevicePolicy[]; clients: ApClient[] }> => {
    const { data } = await apiClient.get("/device-policies");
    return {
      policies: Array.isArray(data?.policies) ? data.policies : [],
      clients: Array.isArray(data?.clients) ? data.clients : [],
    };
  },
  upsert: async (mac: string, body: PolicyUpdate): Promise<DevicePolicy> => {
    const { data } = await apiClient.put(`/device-policies/${encodeURIComponent(mac)}`, body);
    return data;
  },
  remove: async (mac: string) => {
    await apiClient.delete(`/device-policies/${encodeURIComponent(mac)}`);
  },
  reapply: async () => {
    const { data } = await apiClient.post("/device-policies/apply");
    return data;
  },
  getBandwidthHistory: async (mac: string, hours = 24): Promise<BandwidthPoint[]> => {
    const { data } = await apiClient.get(`/device-policies/${encodeURIComponent(mac)}/bandwidth-history?hours=${hours}`);
    return Array.isArray(data) ? data : [];
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeDevices(policies: DevicePolicy[], clients: ApClient[]): MergedDevice[] {
  const byMac = new Map<string, MergedDevice>();

  for (const c of clients) {
    const mac = (c.mac_address ?? "").toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      mac,
      hostname: c.hostname || "Unknown device",
      ip: c.ip_address ?? null,
      online: true,
      policy: null,
    });
  }

  for (const p of policies) {
    const mac = p.mac.toLowerCase();
    const existing = byMac.get(mac);
    if (existing) {
      existing.policy = p;
      if (!existing.hostname || existing.hostname === "Unknown device") {
        existing.hostname = p.hostname || existing.hostname;
      }
    } else {
      byMac.set(mac, {
        mac,
        hostname: p.hostname || "Offline device",
        ip: p.last_ip,
        online: false,
        policy: p,
      });
    }
  }

  return Array.from(byMac.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.hostname.localeCompare(b.hostname);
  });
}

function mbps(kbps: number): string {
  if (kbps <= 0) return "";
  return String(kbps / 1000);
}

function fmtMb(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// ─── Per-day Curfew Grid ─────────────────────────────────────────────────────

function defaultCurfewSchedule(): CurfewEntry[] {
  return [
    { days: [0, 1, 2, 3, 4], start: "22:00", end: "06:00" },
    { days: [5, 6], start: "23:00", end: "07:00" },
  ];
}

interface CurfewGridProps {
  schedule: CurfewEntry[];
  onChange: (next: CurfewEntry[]) => void;
}

function CurfewGrid({ schedule, onChange }: CurfewGridProps) {
  const toggleDay = (entryIdx: number, day: number) => {
    const next = schedule.map((e, i) => {
      if (i !== entryIdx) return e;
      const days = e.days.includes(day)
        ? e.days.filter((d) => d !== day)
        : [...e.days, day].sort();
      return { ...e, days };
    });
    onChange(next);
  };

  const updateTime = (entryIdx: number, field: "start" | "end", val: string) => {
    onChange(schedule.map((e, i) => (i === entryIdx ? { ...e, [field]: val } : e)));
  };

  const addEntry = () => {
    onChange([...schedule, { days: [], start: "22:00", end: "06:00" }]);
  };

  const removeEntry = (i: number) => {
    onChange(schedule.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3">
      {schedule.map((entry, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
          {/* Day selector */}
          <div className="flex flex-wrap gap-1">
            {DAYS.map((label, day) => (
              <button
                key={day}
                onClick={() => toggleDay(i, day)}
                className={cn(
                  "w-9 h-7 text-xs rounded font-medium transition-colors",
                  entry.days.includes(day)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => removeEntry(i)}
              className="ml-auto text-muted-foreground hover:text-destructive transition-colors p-1"
              title="Remove this window"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Time range */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Block from</span>
            <Input
              type="time"
              value={entry.start}
              onChange={(e) => updateTime(i, "start", e.target.value)}
              className="w-28 h-7 font-mono text-xs"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="time"
              value={entry.end}
              onChange={(e) => updateTime(i, "end", e.target.value)}
              className="w-28 h-7 font-mono text-xs"
            />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addEntry}>
        + Add time window
      </Button>
    </div>
  );
}

// ─── Bandwidth History Chart ──────────────────────────────────────────────────

function BandwidthChart({ mac }: { mac: string }) {
  const [hours, setHours] = useState(24);

  const { data = [], isLoading } = useQuery({
    queryKey: ["device-bw-history", mac, hours],
    queryFn: () => policiesApi.getBandwidthHistory(mac, hours),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const option = useMemo(() => {
    if (!data.length) return {};
    const timestamps = data.map((d) => new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    return {
      animation: false,
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ name: string; seriesName: string; value: number }>) => {
          const time = params[0]?.name ?? "";
          return params
            .map((p) => `${p.seriesName}: ${p.value.toFixed(2)} MB`)
            .join("<br/>") + `<br/><small>${time}</small>`;
        },
      },
      legend: { data: ["Download (RX)", "Upload (TX)"], textStyle: { color: "#9ca3af", fontSize: 11 } },
      grid: { top: 30, right: 10, bottom: 24, left: 48 },
      xAxis: {
        type: "category",
        data: timestamps,
        axisLabel: { color: "#6b7280", fontSize: 10 },
        axisLine: { lineStyle: { color: "#374151" } },
        splitLine: { lineStyle: { color: "#1f2937" } },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        name: "MB",
        nameTextStyle: { color: "#6b7280", fontSize: 10 },
        axisLabel: { color: "#6b7280", fontSize: 10, formatter: (v: number) => v.toFixed(1) },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#1f2937" } },
      },
      series: [
        {
          name: "Download (RX)",
          type: "line",
          data: data.map((d) => d.rx_mb),
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#06b6d4", width: 1.5 },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#06b6d440" }, { offset: 1, color: "#06b6d405" }] } },
        },
        {
          name: "Upload (TX)",
          type: "line",
          data: data.map((d) => d.tx_mb),
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#f59e0b", width: 1.5 },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#f59e0b30" }, { offset: 1, color: "#f59e0b05" }] } },
        },
      ],
    };
  }, [data]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" /> Bandwidth history
        </p>
        <div className="flex gap-1">
          {[6, 24, 72, 168].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded transition-colors",
                hours === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {h < 24 ? `${h}h` : h === 24 ? "24h" : h === 72 ? "3d" : "7d"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 bg-muted/30 rounded animate-pulse" />
      ) : data.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-[11px] text-muted-foreground bg-muted/20 rounded">
          No bandwidth data yet — samples collected every 5 minutes
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 120 }} opts={{ renderer: "svg" }} />
      )}
    </div>
  );
}

// ─── Device Row ───────────────────────────────────────────────────────────────

function DeviceRow({ device }: { device: MergedDevice }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [curfewTab, setCurfewTab] = useState<"simple" | "perday">("simple");

  const p = device.policy;
  const [dlMbps, setDlMbps] = useState(p ? mbps(p.download_kbps) : "");
  const [ulMbps, setUlMbps] = useState(p ? mbps(p.upload_kbps) : "");
  const [blockStart, setBlockStart] = useState(p?.block_start ?? "22:00");
  const [blockEnd, setBlockEnd] = useState(p?.block_end ?? "06:00");
  const [curfewSchedule, setCurfewSchedule] = useState<CurfewEntry[]>(
    p?.curfew_schedule ?? defaultCurfewSchedule()
  );
  const [quotaMb, setQuotaMb] = useState(p?.monthly_quota_mb ? String(p.monthly_quota_mb / 1024) : "");
  const [quotaResetDay, setQuotaResetDay] = useState(String(p?.quota_reset_day ?? 1));

  const hasPerDayCurfew = !!(p?.curfew_schedule && p.curfew_schedule.length > 0);

  const mut = useMutation({
    mutationFn: (body: PolicyUpdate) =>
      policiesApi.upsert(device.mac, {
        hostname: device.hostname,
        last_ip: device.ip ?? undefined,
        ...body,
      }),
    onSuccess: () => {
      toast({ title: "Policy applied", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["device-policies"] });
    },
    onError: (err) =>
      toast({
        title: "Failed to apply policy",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: () => policiesApi.remove(device.mac),
    onSuccess: () => {
      toast({ title: "Policy removed", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["device-policies"] });
    },
    onError: (err) =>
      toast({
        title: "Failed to remove policy",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const requestBlock = async () => {
    if (p?.blocked) {
      mut.mutate({ blocked: false });
      return;
    }
    const ok = await confirm({
      title: `Block ${device.hostname}?`,
      description: "The device loses all internet access immediately. It can still reach the dashboard.",
      confirmLabel: "Block device",
      severity: "danger",
    });
    if (ok) mut.mutate({ blocked: true });
  };

  const saveLimits = () => {
    const dl = parseFloat(dlMbps);
    const ul = parseFloat(ulMbps);
    mut.mutate({
      download_kbps: isNaN(dl) || dl <= 0 ? 0 : Math.round(dl * 1000),
      upload_kbps: isNaN(ul) || ul <= 0 ? 0 : Math.round(ul * 1000),
    });
  };

  const saveQuota = () => {
    const gb = parseFloat(quotaMb);
    const day = parseInt(quotaResetDay, 10);
    mut.mutate({
      monthly_quota_mb: isNaN(gb) || gb <= 0 ? 0 : Math.round(gb * 1024),
      quota_reset_day: isNaN(day) || day < 1 || day > 28 ? 1 : day,
    });
  };

  const saveSimpleCurfew = () => {
    mut.mutate({
      schedule_enabled: true,
      block_start: blockStart,
      block_end: blockEnd,
      // Clear per-day schedule when saving simple
      curfew_schedule: [],
    });
  };

  const savePerDayCurfew = () => {
    const valid = curfewSchedule.filter((e) => e.days.length > 0);
    mut.mutate({
      curfew_schedule: valid,
      schedule_enabled: false,
    });
  };

  const clearCurfew = () => {
    mut.mutate({
      schedule_enabled: false,
      curfew_schedule: [],
    });
  };

  const hasLimits = (p?.download_kbps ?? 0) > 0 || (p?.upload_kbps ?? 0) > 0;
  const hasQuota = (p?.monthly_quota_mb ?? 0) > 0;
  const hasCurfew = (p?.schedule_enabled ?? false) || hasPerDayCurfew;

  return (
    <div className="rounded-xl border border-border/70 overflow-hidden">
      {dialog}

      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={cn(
            "status-dot shrink-0",
            p?.blocked ? "error" : device.online ? "running" : "stopped"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{device.hostname}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {device.ip ?? "offline"} · {device.mac}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
          {p?.blocked && (
            <Badge variant="destructive" className="gap-1">
              <Ban className="w-2.5 h-2.5" /> Blocked
            </Badge>
          )}
          {hasLimits && !p?.blocked && (
            <Badge variant="info" className="gap-1">
              <Gauge className="w-2.5 h-2.5" />
              {p!.download_kbps > 0 ? `↓${p!.download_kbps / 1000}M` : ""}
              {p!.upload_kbps > 0 ? ` ↑${p!.upload_kbps / 1000}M` : ""}
            </Badge>
          )}
          {hasQuota && !p?.blocked && (
            <Badge variant="outline" className="gap-1">
              <HardDrive className="w-2.5 h-2.5" />
              {fmtMb(p!.monthly_quota_mb)}/mo
            </Badge>
          )}
          {hasCurfew && !p?.blocked && (
            <Badge variant="warning" className="gap-1">
              <Moon className="w-2.5 h-2.5" />
              {hasPerDayCurfew ? "Per-day curfew" : `${p!.block_start}–${p!.block_end}`}
            </Badge>
          )}
          {!p && device.online && (
            <Badge variant="outline" className="text-muted-foreground">No limits</Badge>
          )}
        </div>

        <Button
          variant={p?.blocked ? "outline" : "ghost"}
          size="sm"
          className={cn(
            "gap-1.5 shrink-0",
            p?.blocked ? "text-success hover:text-success" : "text-destructive hover:text-destructive"
          )}
          loading={mut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            requestBlock();
          }}
        >
          {p?.blocked ? (
            <><CircleCheck className="w-3.5 h-3.5" /> Unblock</>
          ) : (
            <><ShieldBan className="w-3.5 h-3.5" /> Block</>
          )}
        </Button>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Expanded controls */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/30 px-4 py-4 space-y-5">
          {/* Bandwidth limits */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> Bandwidth limit (Mbps — empty or 0 = unlimited)
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Download className="w-3 h-3 text-success" /> Download
                </p>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="∞"
                  value={dlMbps}
                  onChange={(e) => setDlMbps(e.target.value)}
                  className="w-28 font-mono"
                />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Upload className="w-3 h-3 text-info" /> Upload
                </p>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="∞"
                  value={ulMbps}
                  onChange={(e) => setUlMbps(e.target.value)}
                  className="w-28 font-mono"
                />
              </div>
              <div className="flex gap-1.5">
                {[2, 5, 10].map((m) => (
                  <Button
                    key={m}
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 text-xs"
                    onClick={() => { setDlMbps(String(m)); setUlMbps(String(Math.max(1, m / 2))); }}
                  >
                    {m} Mbps
                  </Button>
                ))}
              </div>
              <Button size="sm" className="h-9" loading={mut.isPending} onClick={saveLimits}>
                Apply limits
              </Button>
            </div>
            {!device.online && (
              <p className="text-[11px] text-warning mt-2">
                Device is offline — speed limits apply automatically when it reconnects.
              </p>
            )}
          </div>

          {/* Monthly quota */}
          <div className="border-t border-border/50 pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> Monthly data quota (0 or empty = unlimited)
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Cap (GB/month)</p>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="∞"
                  value={quotaMb}
                  onChange={(e) => setQuotaMb(e.target.value)}
                  className="w-28 font-mono"
                />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Reset on day</p>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={quotaResetDay}
                  onChange={(e) => setQuotaResetDay(e.target.value)}
                  className="w-20 font-mono"
                />
              </div>
              <div className="flex gap-1.5">
                {[5, 10, 20, 50].map((gb) => (
                  <Button
                    key={gb}
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 text-xs"
                    onClick={() => setQuotaMb(String(gb))}
                  >
                    {gb} GB
                  </Button>
                ))}
              </div>
              <Button size="sm" className="h-9" variant="outline" loading={mut.isPending} onClick={saveQuota}>
                Save quota
              </Button>
            </div>
            {hasQuota && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Current cap: {fmtMb(p!.monthly_quota_mb)}/month, resets on day {p!.quota_reset_day}
              </p>
            )}
          </div>

          {/* Curfew schedule */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5" /> Internet curfew
              </p>
              <div className="flex items-center gap-2">
                {hasCurfew && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                    loading={mut.isPending}
                    onClick={clearCurfew}
                  >
                    Clear
                  </Button>
                )}
                {/* Tab switcher */}
                <div className="flex rounded-md overflow-hidden border border-border/60">
                  <button
                    onClick={() => setCurfewTab("simple")}
                    className={cn(
                      "px-2 py-0.5 text-[10px] transition-colors",
                      curfewTab === "simple" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setCurfewTab("perday")}
                    className={cn(
                      "px-2 py-0.5 text-[10px] transition-colors",
                      curfewTab === "perday" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Per-day
                  </button>
                </div>
              </div>
            </div>

            {curfewTab === "simple" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p?.schedule_enabled ?? false}
                    onCheckedChange={(checked) =>
                      mut.mutate({ schedule_enabled: checked, block_start: blockStart, block_end: blockEnd, curfew_schedule: [] })
                    }
                  />
                  <span className="text-xs text-muted-foreground">Enable daily curfew (Pi local time)</span>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Block from</p>
                    <Input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} className="w-32 font-mono" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">until</p>
                    <Input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} className="w-32 font-mono" />
                  </div>
                  <Button size="sm" variant="outline" className="h-9" loading={mut.isPending} onClick={saveSimpleCurfew}>
                    Save curfew
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Set different curfew times per day. Overrides the simple daily schedule.
                </p>
                <CurfewGrid schedule={curfewSchedule} onChange={setCurfewSchedule} />
                <Button size="sm" className="gap-1.5" loading={mut.isPending} onClick={savePerDayCurfew}>
                  <Calendar className="w-3.5 h-3.5" />
                  Apply per-day schedule
                </Button>
              </div>
            )}
          </div>

          {/* Bandwidth history */}
          {device.mac && (
            <div className="border-t border-border/50 pt-4">
              <BandwidthChart mac={device.mac} />
            </div>
          )}

          {/* Remove policy */}
          {p && (
            <div className="pt-1 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-destructive"
                loading={removeMut.isPending}
                onClick={() => removeMut.mutate()}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove all rules for this device
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeviceControlPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["device-policies"],
    queryFn: policiesApi.list,
    refetchInterval: 15000,
  });

  const reapplyMut = useMutation({
    mutationFn: policiesApi.reapply,
    onSuccess: (res: { applied?: number }) => {
      toast({
        title: "Enforcement rebuilt",
        description: `${res.applied ?? 0} device polic${(res.applied ?? 0) === 1 ? "y" : "ies"} re-applied`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["device-policies"] });
    },
    onError: (err) =>
      toast({
        title: "Re-apply failed",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const devices = data ? mergeDevices(data.policies, data.clients) : [];
  const blockedCount = devices.filter((d) => d.policy?.blocked).length;
  const limitedCount = devices.filter(
    (d) => (d.policy?.download_kbps ?? 0) > 0 || (d.policy?.upload_kbps ?? 0) > 0
  ).length;
  const curfewCount = devices.filter(
    (d) => d.policy?.schedule_enabled || (d.policy?.curfew_schedule && d.policy.curfew_schedule.length > 0)
  ).length;

  return (
    <div className="p-6 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldBan className="w-5 h-5 text-primary" />
            Device Control
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bandwidth limits, data quotas, curfew schedules, and internet blocking per AP client
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelp
            title="Device Control"
            points={[
              "Apply per-device network policies: speed limits (HTB tc), monthly data caps, curfew schedules, or a full block",
              "Drag the chevron to expand a device and configure its policy",
              "Limits apply immediately — offline devices get their limits when they reconnect",
              "Per-day curfew lets you set different schedules for weekdays vs weekends",
              "Monthly quota auto-blocks the device when usage exceeds the cap",
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            loading={reapplyMut.isPending}
            onClick={() => reapplyMut.mutate()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-apply rules
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total devices", value: devices.length, icon: MonitorSmartphone },
          { label: "Blocked", value: blockedCount, icon: Ban, color: blockedCount > 0 ? "text-destructive" : undefined },
          { label: "Rate limited", value: limitedCount, icon: Gauge },
          { label: "Curfew active", value: curfewCount, icon: Moon },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className={cn("w-3.5 h-3.5 text-muted-foreground", color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1 tabular-nums", color)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Device list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MonitorSmartphone className="w-4 h-4 text-muted-foreground" />
            AP Clients & Saved Policies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <SkeletonList count={4} />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="No devices found"
              description="Connect devices to the access point or save a policy for an offline device."
            />
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <DeviceRow key={d.mac} device={d} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
