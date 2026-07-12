import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive, Usb, BarChart3, RefreshCw, LogOut, MountainSnow,
  Unplug, Trash2, Activity, AlertTriangle, Database,
  FolderSearch, ChevronRight, Folder, FileText,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockDevice {
  name: string;
  path: string;
  fstype: string | null;
  size: string;
  size_bytes: number;
  mountpoint: string | null;
  label: string | null;
  model: string | null;
  type: string;
  is_readonly: boolean;
  is_removable: boolean;
  percent_used: number | null;
  children?: BlockDevice[];
}

interface UsbDevice {
  bus: string;
  device: string;
  vendor_id: string;
  product_id: string;
  description: string;
}

interface DiskUsage {
  device: string;
  fstype: string;
  size_bytes: number;
  used_bytes: number;
  avail_bytes: number;
  percent: number;
  mountpoint: string;
}

interface IoStat {
  device: string;
  reads_completed: number;
  reads_bytes: number;
  writes_completed: number;
  writes_bytes: number;
  io_in_progress: number;
  io_time_ms: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (!b || b <= 0) return "0 B";
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
  if (b >= 1e9)  return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6)  return `${(b / 1e6).toFixed(0)} MB`;
  if (b >= 1e3)  return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

function usageColor(pct: number) {
  if (pct >= 90) return "text-red-400";
  if (pct >= 75) return "text-yellow-400";
  return "text-green-400";
}

function barColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-yellow-400";
  return "bg-primary";
}

// ─── API ──────────────────────────────────────────────────────────────────────

const storageApi = {
  getDevices: async (): Promise<BlockDevice[]> => {
    const { data } = await apiClient.get("/storage/devices");
    return Array.isArray(data) ? data : [];
  },
  getUsb: async (): Promise<UsbDevice[]> => {
    const { data } = await apiClient.get("/storage/usb");
    return Array.isArray(data) ? data : [];
  },
  getUsage: async (): Promise<DiskUsage[]> => {
    const { data } = await apiClient.get("/storage/usage");
    return Array.isArray(data) ? data : [];
  },
  getIoStats: async (): Promise<IoStat[]> => {
    const { data } = await apiClient.get("/storage/io-stats");
    return Array.isArray(data) ? data : [];
  },
  mount: async (device: string, mountpoint: string, fstype?: string): Promise<void> => {
    await apiClient.post("/storage/mount", { device, mountpoint, fstype });
  },
  unmount: async (path: string): Promise<void> => {
    await apiClient.post("/storage/unmount", { path });
  },
  format: async (device: string, fstype: string, label: string): Promise<void> => {
    await apiClient.post("/storage/format", { device, fstype, label });
  },
  eject: async (device: string): Promise<void> => {
    await apiClient.post("/storage/eject", { device });
  },
};

// ─── Mount Modal ──────────────────────────────────────────────────────────────

function MountModal({
  device, onClose, onMount,
}: {
  device: string;
  onClose: () => void;
  onMount: (device: string, mountpoint: string, fstype?: string) => Promise<void>;
}) {
  const [mountpoint, setMountpoint] = useState(
    `/mnt/${device.replace(/\//g, "").replace(/dev/, "")}`
  );
  const [fstype, setFstype] = useState("");
  const [saving, setSaving] = useState(false);

  const handleMount = async () => {
    if (!mountpoint.trim()) {
      toast({ title: "Mountpoint required", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onMount(device, mountpoint.trim(), fstype.trim() || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
        <h3 className="font-semibold">Mount Device</h3>
        <p className="text-sm text-muted-foreground font-mono">{device}</p>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Mountpoint</label>
          <Input value={mountpoint} onChange={(e) => setMountpoint(e.target.value)} placeholder="/mnt/usb" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Filesystem Type (optional)</label>
          <Select value={fstype} onValueChange={setFstype}>
            <SelectTrigger><SelectValue placeholder="Auto-detect" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto-detect</SelectItem>
              <SelectItem value="ext4">ext4</SelectItem>
              <SelectItem value="ext3">ext3</SelectItem>
              <SelectItem value="ntfs">ntfs</SelectItem>
              <SelectItem value="vfat">vfat (FAT32)</SelectItem>
              <SelectItem value="exfat">exfat</SelectItem>
              <SelectItem value="xfs">xfs</SelectItem>
              <SelectItem value="btrfs">btrfs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleMount} loading={saving}>
            <MountainSnow className="w-3.5 h-3.5 mr-1.5" />
            Mount
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Format Modal ─────────────────────────────────────────────────────────────

function FormatModal({
  device, onClose, onFormat,
}: {
  device: string;
  onClose: () => void;
  onFormat: (device: string, fstype: string, label: string) => Promise<void>;
}) {
  const [fstype, setFstype] = useState("ext4");
  const [label, setLabel]   = useState("");
  const [saving, setSaving] = useState(false);

  // The final critical confirmation (type FORMAT) happens in the unified
  // ConfirmDialog, driven by the parent's onFormat handler.
  const handleFormat = async () => {
    setSaving(true);
    try {
      await onFormat(device, fstype, label);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
        <h3 className="font-semibold text-destructive">Format Device</h3>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          This will permanently erase all data on <span className="font-mono font-bold">{device}</span>. This cannot be undone.
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Filesystem</label>
          <Select value={fstype} onValueChange={setFstype}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ext4">ext4 (Linux)</SelectItem>
              <SelectItem value="ext3">ext3 (Linux legacy)</SelectItem>
              <SelectItem value="vfat">vfat / FAT32 (cross-platform)</SelectItem>
              <SelectItem value="exfat">exFAT (cross-platform, large files)</SelectItem>
              <SelectItem value="ntfs">NTFS (Windows)</SelectItem>
              <SelectItem value="btrfs">btrfs (modern Linux)</SelectItem>
              <SelectItem value="xfs">xfs (performance)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Label (optional)</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="DATA" maxLength={16} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive" className="flex-1"
            onClick={handleFormat} loading={saving}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Format
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Block Device Row ─────────────────────────────────────────────────────────

function BlockDeviceRow({
  device, depth, onMount, onUnmount, onFormat, onEject,
}: {
  device: BlockDevice;
  depth: number;
  onMount: (dev: string) => void;
  onUnmount: (path: string) => void;
  onFormat: (dev: string) => void;
  onEject: (dev: string) => void;
}) {
  const isDisk = device.type === "disk";
  const isReadOnly = device.is_readonly;

  return (
    <>
      <div className={cn(
        "flex items-center gap-3 py-3 border-b border-border/50 last:border-0 text-sm",
        depth > 0 && "pl-6",
      )}>
        <HardDrive className={cn("w-4 h-4 shrink-0", isDisk ? "text-primary" : "text-muted-foreground")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-medium">{device.name}</span>
            {device.model && <span className="text-xs text-muted-foreground">{device.model}</span>}
            {device.label && <Badge variant="secondary" className="text-[10px]">{device.label}</Badge>}
            {device.fstype && <Badge variant="outline" className="text-[10px] font-mono">{device.fstype}</Badge>}
            {isReadOnly && <Badge variant="destructive" className="text-[10px]">RO</Badge>}
            {device.is_removable && <Badge variant="secondary" className="text-[10px]">Removable</Badge>}
          </div>
          {device.mountpoint && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">→ {device.mountpoint}</p>
          )}
          {device.percent_used != null && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[120px]">
                <div
                  className={cn("h-full rounded-full", barColor(device.percent_used))}
                  style={{ width: `${Math.min(device.percent_used, 100)}%` }}
                />
              </div>
              <span className={cn("text-[11px] font-medium", usageColor(device.percent_used))}>
                {device.percent_used.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{device.size}</span>
        <div className="flex gap-1 shrink-0">
          {device.mountpoint ? (
            <Button size="sm" variant="outline" className="h-6 text-[11px]"
              onClick={() => onUnmount(device.mountpoint!)}
            >
              <Unplug className="w-3 h-3 mr-1" />
              Unmount
            </Button>
          ) : device.fstype ? (
            <Button size="sm" variant="outline" className="h-6 text-[11px]"
              onClick={() => onMount(device.path)}
            >
              <MountainSnow className="w-3 h-3 mr-1" />
              Mount
            </Button>
          ) : null}
          {!isDisk && device.fstype && !isReadOnly && (
            <Button size="sm" variant="ghost"
              className="h-6 text-[11px] text-destructive hover:bg-destructive/10"
              onClick={() => onFormat(device.path)}
            >
              Format
            </Button>
          )}
          {isDisk && (
            <Button size="icon-sm" variant="ghost"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => onEject(device.path)} title="Eject"
            >
              <LogOut className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      {device.children?.map((child) => (
        <BlockDeviceRow
          key={child.name} device={child} depth={depth + 1}
          onMount={onMount} onUnmount={onUnmount} onFormat={onFormat} onEject={onEject}
        />
      ))}
    </>
  );
}

// ─── Disk Usage Card ──────────────────────────────────────────────────────────

function DiskUsageCard({ fs }: { fs: DiskUsage }) {
  const pct = fs.percent;

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      pct >= 90 ? "border-red-500/40 bg-red-500/5"
      : pct >= 75 ? "border-yellow-400/40 bg-yellow-400/5"
      : "border-border bg-card/40",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-base">{fs.mountpoint}</span>
            {fs.fstype && (
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">{fs.fstype}</Badge>
            )}
            {pct >= 90 && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{fs.device}</p>
        </div>
        <span className={cn("text-2xl font-bold tabular-nums shrink-0", usageColor(pct))}>
          {pct.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor(pct))}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/30 px-3 py-2 text-center">
          <p className="text-base font-bold text-foreground tabular-nums">{fmtBytes(fs.used_bytes)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Used</p>
        </div>
        <div className="rounded-lg bg-muted/30 px-3 py-2 text-center">
          <p className="text-base font-bold text-green-400 tabular-nums">{fmtBytes(fs.avail_bytes)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Free</p>
        </div>
        <div className="rounded-lg bg-muted/30 px-3 py-2 text-center">
          <p className="text-base font-bold text-muted-foreground tabular-nums">{fmtBytes(fs.size_bytes)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Total</p>
        </div>
      </div>
    </div>
  );
}

// ─── I/O Stats Tab ────────────────────────────────────────────────────────────

function IoStatsTab() {
  const { data: io, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["storage-io-stats"],
    queryFn: storageApi.getIoStats,
    refetchInterval: 10000,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          Disk I/O Statistics
        </CardTitle>
        <Button size="icon-sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Cumulative counters since last boot. I/O time indicates disk saturation.
        </p>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : !io?.length ? (
          <div className="flex flex-col items-center py-10 text-muted-foreground">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No I/O statistics available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {io.map((stat) => (
              <div key={stat.device} className="rounded-xl border border-border bg-card/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-bold text-sm">/dev/{stat.device}</span>
                  {stat.io_in_progress > 0 && (
                    <Badge variant="secondary" className="text-[10px] animate-pulse">
                      Active ({stat.io_in_progress} ops)
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-lg bg-muted/30 px-2 py-2">
                    <p className="text-sm font-bold text-blue-400 tabular-nums">{fmtBytes(stat.reads_bytes)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Read</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-2 py-2">
                    <p className="text-sm font-bold text-purple-400 tabular-nums">{fmtBytes(stat.writes_bytes)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Write</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-2 py-2">
                    <p className="text-sm font-bold text-cyan-400 tabular-nums">{stat.reads_completed.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Read Ops</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-2 py-2">
                    <p className="text-sm font-bold text-orange-400 tabular-nums">{stat.writes_completed.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Write Ops</p>
                  </div>
                </div>
                {stat.io_time_ms > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-2 text-right">
                    I/O busy time: {(stat.io_time_ms / 1000).toFixed(0)}s total
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Analyze Tab ─────────────────────────────────────────────────────────────

interface DirEntry {
  path: string;
  name: string;
  size_bytes: number;
  is_dir: boolean;
}

function AnalyzeTab() {
  const [path, setPath]           = useState("/");
  const [inputPath, setInputPath] = useState("/");
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(["/"]);
  const [enabled, setEnabled]     = useState(false);

  const { data: entries, isLoading, isFetching } = useQuery<DirEntry[]>({
    queryKey: ["storage-analyze", path],
    queryFn: async () => {
      const { data } = await apiClient.get(`/storage/analyze?path=${encodeURIComponent(path)}&depth=1`);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
    enabled,
  });

  const navigate = (dirPath: string) => {
    setPath(dirPath);
    setInputPath(dirPath);
    setEnabled(true);
    setBreadcrumbs((prev) => {
      const idx = prev.indexOf(dirPath);
      if (idx >= 0) return prev.slice(0, idx + 1);
      return [...prev, dirPath];
    });
  };

  const handleGo = () => {
    const p = inputPath.trim() || "/";
    setPath(p);
    setBreadcrumbs([p]);
    setEnabled(true);
  };

  const maxSize = Math.max(...(entries ?? []).map((e) => e.size_bytes), 1);

  return (
    <div className="space-y-4">
      {/* Path input */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Input
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGo()}
              placeholder="/"
              className="h-8 font-mono text-sm"
            />
            <Button size="sm" className="h-8" onClick={handleGo} loading={isFetching}>
              <FolderSearch className="w-3.5 h-3.5 mr-1" /> Analyze
            </Button>
          </div>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 1 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {breadcrumbs.map((crumb, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <button
                    onClick={() => navigate(crumb)}
                    className="text-xs font-mono text-primary hover:underline truncate max-w-[12rem]"
                  >
                    {i === 0 ? "/" : crumb.split("/").pop() || crumb}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : !enabled ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <FolderSearch className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Enter a path above and click <strong className="text-foreground">Analyze</strong> to scan disk usage</p>
          </CardContent>
        </Card>
      ) : !entries?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <FolderSearch className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No entries found at <span className="font-mono">{path}</span></p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[50vh]">
              <div className="divide-y divide-border/40">
                {entries.map((entry, i) => {
                  const pct = entry.size_bytes / maxSize;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 relative",
                        entry.is_dir && "cursor-pointer hover:bg-secondary/30 transition-colors"
                      )}
                      onClick={() => entry.is_dir && navigate(entry.path)}
                    >
                      {/* Bar background */}
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/5 pointer-events-none"
                        style={{ width: `${pct * 100}%` }}
                      />
                      {entry.is_dir ? (
                        <Folder className="w-4 h-4 text-amber-400 shrink-0 relative z-10" />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0 relative z-10" />
                      )}
                      <span className="text-sm font-mono flex-1 min-w-0 truncate relative z-10">
                        {entry.name}
                      </span>
                      <span className="text-sm font-mono font-bold tabular-nums shrink-0 relative z-10">
                        {fmtBytes(entry.size_bytes)}
                      </span>
                      {entry.is_dir && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 relative z-10" />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoragePage() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [mountTarget, setMountTarget] = useState<string | null>(null);
  const [formatTarget, setFormatTarget] = useState<string | null>(null);

  const { data: devices, isLoading: devLoading } = useQuery({
    queryKey: ["storage-devices"],
    queryFn: storageApi.getDevices,
    refetchInterval: 10000,
  });

  const { data: usbDevices, isLoading: usbLoading } = useQuery({
    queryKey: ["usb-devices"],
    queryFn: storageApi.getUsb,
    refetchInterval: 10000,
  });

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["disk-usage"],
    queryFn: storageApi.getUsage,
    refetchInterval: 15000,
  });

  const mountDevice = useMutation({
    mutationFn: ({ device, mountpoint, fstype }: { device: string; mountpoint: string; fstype?: string }) =>
      storageApi.mount(device, mountpoint, fstype),
    onSuccess: (_, { device }) => {
      toast({ title: "Device mounted", description: device, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
      queryClient.invalidateQueries({ queryKey: ["disk-usage"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Mount failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const unmountDevice = useMutation({
    mutationFn: (path: string) => storageApi.unmount(path),
    onSuccess: (_, path) => {
      toast({ title: "Device unmounted", description: path, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
      queryClient.invalidateQueries({ queryKey: ["disk-usage"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Unmount failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const formatDevice = useMutation({
    mutationFn: ({ device, fstype, label }: { device: string; fstype: string; label: string }) =>
      storageApi.format(device, fstype, label),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["storage-devices"] }); },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Format failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const ejectDevice = useMutation({
    mutationFn: (device: string) => storageApi.eject(device),
    onSuccess: (_, device) => {
      toast({ title: "Device ejected", description: device, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Eject failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  // ── Confirmed destructive flows ─────────────────────────────────────────

  const requestUnmount = async (path: string) => {
    const ok = await confirm({
      title: `Unmount ${path}?`,
      description: "Programs using files on this mount may fail. Make sure nothing is actively reading or writing to it.",
      severity: "danger",
      confirmLabel: "Unmount",
    });
    if (ok) unmountDevice.mutate(path);
  };

  const requestEject = async (device: string) => {
    const ok = await confirm({
      title: `Eject ${device}?`,
      description: "The disk will be spun down and can be safely removed afterwards.",
      severity: "danger",
      confirmLabel: "Eject",
    });
    if (ok) ejectDevice.mutate(device);
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
    queryClient.invalidateQueries({ queryKey: ["usb-devices"] });
    queryClient.invalidateQueries({ queryKey: ["disk-usage"] });
    queryClient.invalidateQueries({ queryKey: ["storage-io-stats"] });
  };

  // Storage summary
  const totalUsed  = usage?.reduce((s, f) => s + f.used_bytes, 0) ?? 0;
  const totalSize  = usage?.reduce((s, f) => s + f.size_bytes, 0) ?? 0;
  const totalFree  = usage?.reduce((s, f) => s + f.avail_bytes, 0) ?? 0;
  const overallPct = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      {mountTarget && (
        <MountModal
          device={mountTarget}
          onClose={() => setMountTarget(null)}
          onMount={async (device, mountpoint, fstype) => {
            await mountDevice.mutateAsync({ device, mountpoint, fstype });
          }}
        />
      )}
      {formatTarget && (
        <FormatModal
          device={formatTarget}
          onClose={() => setFormatTarget(null)}
          onFormat={async (device, fstype, label) => {
            const ok = await confirm({
              title: `Format ${device}?`,
              description: "This permanently erases all data on the device. This cannot be undone.",
              severity: "critical",
              typeToConfirm: "FORMAT",
              confirmLabel: "Format Device",
            });
            if (!ok) return;
            await formatDevice.mutateAsync({ device, fstype, label });
            toast({ title: "Format complete", variant: "success" } as { title: string; variant: "success" });
            setFormatTarget(null);
          }}
        />
      )}
      {dialog}

      {/* Storage overview */}
      {usage && usage.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
            <p className="text-xl font-bold tabular-nums">{fmtBytes(totalSize)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Total Storage</p>
          </div>
          <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
            <p className={cn("text-xl font-bold tabular-nums", usageColor(overallPct))}>
              {fmtBytes(totalUsed)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Used</p>
          </div>
          <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
            <p className="text-xl font-bold text-green-400 tabular-nums">{fmtBytes(totalFree)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Available</p>
          </div>
          <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
            <p className={cn("text-xl font-bold tabular-nums", usageColor(overallPct))}>
              {overallPct.toFixed(0)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Overall Used</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="usage">
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="usage">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              Disk Usage
            </TabsTrigger>
            <TabsTrigger value="io">
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              I/O Stats
            </TabsTrigger>
            <TabsTrigger value="devices">
              <HardDrive className="w-3.5 h-3.5 mr-1.5" />
              Block Devices
            </TabsTrigger>
            <TabsTrigger value="usb">
              <Usb className="w-3.5 h-3.5 mr-1.5" />
              USB Devices
            </TabsTrigger>
            <TabsTrigger value="analyze">
              <FolderSearch className="w-3.5 h-3.5 mr-1.5" />
              Analyze
            </TabsTrigger>
          </TabsList>
          <Button size="icon-sm" variant="ghost" onClick={invalidateAll} title="Refresh all">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* ── Disk Usage ────────────────────────────────────────── */}
        <TabsContent value="usage" className="mt-4 space-y-4">
          {/* Critical warning banner */}
          {usage && usage.some((fs) => fs.percent >= 85) && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">Disk Space Warning</p>
                <div className="mt-1 space-y-0.5">
                  {usage.filter((fs) => fs.percent >= 85).map((fs, i) => (
                    <p key={i} className="text-xs text-destructive/90">
                      <span className="font-mono font-bold">{fs.mountpoint}</span>{" "}
                      is <span className="font-bold">{fs.percent.toFixed(0)}% full</span>{" "}
                      — only {fmtBytes(fs.avail_bytes)} remaining
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {usageLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : !usage?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                <Database className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No filesystem data available</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {usage.map((fs, i) => <DiskUsageCard key={i} fs={fs} />)}
            </div>
          )}
        </TabsContent>

        {/* ── I/O Stats ─────────────────────────────────────────── */}
        <TabsContent value="io" className="mt-4">
          <IoStatsTab />
        </TabsContent>

        {/* ── Block Devices ─────────────────────────────────────── */}
        <TabsContent value="devices" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5" />
                Block Devices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {devLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : !devices?.length ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <HardDrive className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No block devices found</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[40rem]">
                  <div className="pr-1">
                    {devices.map((dev) => (
                      <BlockDeviceRow
                        key={dev.name} device={dev} depth={0}
                        onMount={(d) => setMountTarget(d)}
                        onUnmount={(path) => { void requestUnmount(path); }}
                        onFormat={(d) => setFormatTarget(d)}
                        onEject={(d) => { void requestEject(d); }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USB Devices ───────────────────────────────────────── */}
        <TabsContent value="usb" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Usb className="w-3.5 h-3.5" />
                USB Devices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usbLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : !usbDevices?.length ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Usb className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No USB devices detected</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[40rem]">
                  <div className="space-y-2 pr-1">
                    {usbDevices.map((usb, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
                        <Usb className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{usb.description || "Unknown Device"}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {usb.vendor_id}:{usb.product_id} · Bus {usb.bus}, Dev {usb.device}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Bus {usb.bus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analyze ───────────────────────────────────────────── */}
        <TabsContent value="analyze" className="mt-4">
          <AnalyzeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
