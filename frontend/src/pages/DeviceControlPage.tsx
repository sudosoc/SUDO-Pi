import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldBan, Gauge, Moon, MonitorSmartphone, RefreshCw,
  Download, Upload, ChevronDown, ChevronUp, Trash2, Ban, CircleCheck,
} from "lucide-react";
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
  updated_at: string | null;
}

interface ApClient {
  hostname?: string;
  ip?: string;
  mac?: string;
  vendor?: string;
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeDevices(policies: DevicePolicy[], clients: ApClient[]): MergedDevice[] {
  const byMac = new Map<string, MergedDevice>();

  for (const c of clients) {
    const mac = (c.mac ?? "").toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      mac,
      hostname: c.hostname || "Unknown device",
      ip: c.ip ?? null,
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
  return kbps >= 1000 ? String(kbps / 1000) : String(kbps / 1000);
}

// ─── Device Row ───────────────────────────────────────────────────────────────

function DeviceRow({ device }: { device: MergedDevice }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);

  const p = device.policy;
  const [dlMbps, setDlMbps] = useState(p ? mbps(p.download_kbps) : "");
  const [ulMbps, setUlMbps] = useState(p ? mbps(p.upload_kbps) : "");
  const [blockStart, setBlockStart] = useState(p?.block_start ?? "22:00");
  const [blockEnd, setBlockEnd] = useState(p?.block_end ?? "06:00");

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

  const hasLimits = (p?.download_kbps ?? 0) > 0 || (p?.upload_kbps ?? 0) > 0;

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

        <div className="hidden sm:flex items-center gap-1.5">
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
          {p?.schedule_enabled && !p?.blocked && (
            <Badge variant="warning" className="gap-1">
              <Moon className="w-2.5 h-2.5" /> {p.block_start}–{p.block_end}
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
        <div className="border-t border-border/60 bg-muted/30 px-4 py-4 space-y-4">
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

          {/* Curfew schedule */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5" /> Internet curfew (daily, Pi local time)
              </p>
              <Switch
                checked={p?.schedule_enabled ?? false}
                onCheckedChange={(checked) =>
                  mut.mutate({
                    schedule_enabled: checked,
                    block_start: blockStart,
                    block_end: blockEnd,
                  })
                }
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">No internet from</p>
                <Input
                  type="time"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  className="w-32 font-mono"
                />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">until</p>
                <Input
                  type="time"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  className="w-32 font-mono"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                loading={mut.isPending}
                onClick={() =>
                  mut.mutate({
                    schedule_enabled: true,
                    block_start: blockStart,
                    block_end: blockEnd,
                  })
                }
              >
                Save curfew
              </Button>
            </div>
          </div>

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
  const curfewCount = devices.filter((d) => d.policy?.schedule_enabled).length;

  return (
    <div className="p-6 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Device Control</h2>
          <PageHelp
            title="Device control"
            points={[
              "Set per-device download/upload speed limits",
              "Block a device from the internet entirely",
              "Daily curfew: cut internet on a schedule (e.g. 22:00–06:00)",
              "Rules follow the device by MAC address across reconnects",
            ]}
          />
        </div>
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

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Devices</p>
          <p className="text-2xl font-bold tabular-nums">{devices.length}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Speed limited</p>
          <p className="text-2xl font-bold tabular-nums text-info">{limitedCount}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">On curfew</p>
          <p className="text-2xl font-bold tabular-nums text-warning">{curfewCount}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Blocked</p>
          <p className="text-2xl font-bold tabular-nums text-destructive">{blockedCount}</p>
        </div>
      </div>

      {/* Device list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="w-3.5 h-3.5" />
            Connected & Managed Devices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <SkeletonList count={4} />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="No devices yet"
              description="Devices that join the SUDO-Pi network will appear here, ready for limits and schedules."
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
