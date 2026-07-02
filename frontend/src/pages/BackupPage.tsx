import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive, Cloud, Calendar, FileJson, RefreshCw, Download,
  Trash2, RotateCcw, Plus, CheckCircle2, XCircle, Loader2,
  Clock, HardDrive, AlertTriangle, Wifi, Upload, Play,
  ChevronDown, PlugZap,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackupRecord {
  id: number;
  name: string;
  backup_type: "system" | "config" | "sd_image";
  status: "pending" | "running" | "completed" | "failed";
  size_bytes: number | null;
  path: string | null;
  checksum: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  cloud_synced: boolean;
  cloud_synced_at: string | null;
}

interface BackupSchedule {
  id: number;
  backup_type: string;
  enabled: boolean;
  cron_expression: string;
  keep_count: number;
  destination: string;
  rclone_remote: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface RcloneRemote {
  name: string;
  type: string;
}

interface RcloneStatus {
  installed: boolean;
  version: string | null;
  remotes: RcloneRemote[];
  providers: { id: string; name: string; type: string }[];
}

interface DiskUsage {
  backup_dir: string;
  used_bytes: number;
  free_bytes: number;
  total_bytes: number;
  backup_count: number;
  backup_size_bytes: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(b: number | null | undefined): string {
  if (!b || b <= 0) return "0 B";
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9)  return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6)  return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3)  return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function parseCron(expr: string): string {
  if (!expr) return "Not set";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;

  if (dom === "*" && month === "*" && dow === "*") {
    if (hour !== "*" && minute !== "*") {
      const h = parseInt(hour, 10);
      const m = parseInt(minute, 10);
      const period = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const displayM = m.toString().padStart(2, "0");
      return `Every day at ${displayH}:${displayM} ${period}`;
    }
    if (hour === "*") return `Every hour at minute ${minute}`;
  }
  if (dow !== "*" && dom === "*" && month === "*") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = days[parseInt(dow, 10) % 7] ?? dow;
    return `Every ${dayName} at ${hour}:${minute.padStart(2, "0")}`;
  }
  return expr;
}

function getTypeColor(type: string): string {
  switch (type) {
    case "system":   return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "config":   return "bg-teal-500/20 text-teal-300 border-teal-500/30";
    case "sd_image": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    default:         return "bg-muted text-muted-foreground";
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "system":   return "System";
    case "config":   return "Config";
    case "sd_image": return "Full Restore";
    default:         return type;
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

const backupApi = {
  list: async (): Promise<BackupRecord[]> => {
    const { data } = await apiClient.get("/backup/list");
    return Array.isArray(data) ? data : [];
  },
  diskUsage: async (): Promise<DiskUsage | null> => {
    const { data } = await apiClient.get("/backup/disk-usage");
    return data && typeof data === "object" ? data : null;
  },
  createSystem: async (name?: string) => {
    const { data } = await apiClient.post("/backup/system", { name: name || null });
    return data;
  },
  createConfig: async (name?: string) => {
    const { data } = await apiClient.post("/backup/config", { name: name || null });
    return data;
  },
  createFull: async (name?: string) => {
    const { data } = await apiClient.post("/backup/full", { name: name || null });
    return data;
  },
  delete: async (id: number) => {
    await apiClient.delete(`/backup/${id}`);
  },
  restore: async (id: number) => {
    const { data } = await apiClient.post(`/backup/${id}/restore`);
    return data;
  },
  getSchedule: async (): Promise<BackupSchedule[]> => {
    const { data } = await apiClient.get("/backup/schedule");
    return Array.isArray(data) ? data : [];
  },
  updateSchedule: async (body: Omit<BackupSchedule, "id" | "last_run_at" | "next_run_at">) => {
    const { data } = await apiClient.put("/backup/schedule", body);
    return data;
  },
  exportSnapshot: async () => {
    const res = await apiClient.get("/backup/snapshot/export", { responseType: "blob" });
    return res;
  },
  importSnapshot: async (data: object) => {
    const res = await apiClient.post("/backup/snapshot/import", { data });
    return res.data;
  },
};

const rcloneApi = {
  status: async (): Promise<RcloneStatus | null> => {
    const { data } = await apiClient.get("/rclone/status");
    return data && typeof data === "object" ? data : null;
  },
  providers: async () => {
    const { data } = await apiClient.get("/rclone/providers");
    return data;
  },
  install: async () => {
    const { data } = await apiClient.post("/rclone/install");
    return data;
  },
  addRemote: async (name: string, provider: string, config: Record<string, string>) => {
    const { data } = await apiClient.post("/rclone/remotes", { name, provider, config });
    return data;
  },
  removeRemote: async (name: string) => {
    await apiClient.delete(`/rclone/remotes/${name}`);
  },
  testRemote: async (name: string) => {
    const { data } = await apiClient.post(`/rclone/remotes/${name}/test`);
    return data;
  },
  sync: async (remote_path: string) => {
    const { data } = await apiClient.post("/rclone/sync", { remote_path, include_configs: true });
    return data;
  },
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BackupRecord["status"] }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-500/20 text-green-300 border-green-500/30 border gap-1">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </Badge>
      );
    case "running":
      return (
        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 border gap-1 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" /> Running
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-muted text-muted-foreground border gap-1">
          <Clock className="w-3 h-3" /> Pending
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/20 text-red-300 border-red-500/30 border gap-1">
          <XCircle className="w-3 h-3" /> Failed
        </Badge>
      );
  }
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  variant = "destructive",
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
        <h3 className={cn("font-semibold", variant === "destructive" && "text-destructive")}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            variant={variant}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Backups ───────────────────────────────────────────────────────────

function BackupsTab() {
  const qc = useQueryClient();
  const [showNameInput, setShowNameInput] = useState(false);
  const [pendingType, setPendingType] = useState<"system" | "config" | "full" | null>(null);
  const [customName, setCustomName] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const { data: backups, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: backupApi.list,
    refetchInterval: (query) => {
      const data = query.state.data as BackupRecord[] | undefined;
      return data?.some((b) => b.status === "running" || b.status === "pending") ? 3000 : false;
    },
  });

  const { data: diskUsage } = useQuery({
    queryKey: ["backup-disk-usage"],
    queryFn: backupApi.diskUsage,
    refetchInterval: 30000,
  });

  const createMut = useMutation({
    mutationFn: async ({ type, name }: { type: string; name?: string }) => {
      if (type === "system") return backupApi.createSystem(name);
      if (type === "config") return backupApi.createConfig(name);
      return backupApi.createFull(name);
    },
    onSuccess: () => {
      toast({ title: "Backup started", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["backups"] });
      setShowNameInput(false);
      setCustomName("");
      setPendingType(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Backup failed",
        description: err?.response?.data?.detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => backupApi.delete(id),
    onSuccess: () => {
      toast({ title: "Backup deleted", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["backups"] });
      qc.invalidateQueries({ queryKey: ["backup-disk-usage"] });
      setConfirmDelete(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Delete failed",
        description: err?.response?.data?.detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => backupApi.restore(id),
    onSuccess: (result) => {
      toast({
        title: "Restore completed",
        description: result.message,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      setConfirmRestore(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Restore failed",
        description: err?.response?.data?.detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  const hasRunning = backups?.some((b) => b.status === "running" || b.status === "pending");
  const totalBackupSize = backups?.reduce((s, b) => s + (b.size_bytes ?? 0), 0) ?? 0;
  const lastBackup = backups?.find((b) => b.status === "completed");

  const handleStartBackup = (type: "system" | "config" | "full") => {
    setPendingType(type);
    setShowNameInput(true);
    setDropdownOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
          <p className="text-xl font-bold tabular-nums">{backups?.length ?? 0}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Total Backups</p>
        </div>
        <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
          <p className="text-xl font-bold tabular-nums">{formatBytes(totalBackupSize)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Total Size</p>
        </div>
        <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
          <p className="text-sm font-bold tabular-nums truncate">
            {lastBackup ? new Date(lastBackup.started_at).toLocaleDateString() : "Never"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Last Backup</p>
        </div>
        <div className="rounded-xl border border-border bg-card/40 px-4 py-3 text-center">
          <p className="text-xl font-bold tabular-nums">{formatBytes(diskUsage?.free_bytes)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Disk Free</p>
        </div>
      </div>

      {/* Disk usage bar */}
      {diskUsage && diskUsage.total_bytes > 0 && (
        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              Backup directory: <span className="font-mono text-xs">{diskUsage.backup_dir}</span>
            </span>
            <span className="font-medium">
              {formatBytes(diskUsage.used_bytes)} / {formatBytes(diskUsage.total_bytes)}
            </span>
          </div>
          <Progress
            value={(diskUsage.used_bytes / diskUsage.total_bytes) * 100}
            className="h-2"
          />
        </div>
      )}

      {/* Create backup header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Backup Archive
        </h2>
        <div className="relative">
          <Button
            size="sm"
            onClick={() => setDropdownOpen((v) => !v)}
            disabled={createMut.isPending}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Backup
            <ChevronDown className="w-3 h-3 opacity-60" />
          </Button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-1 z-20 w-48 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              {(["system", "config", "full"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleStartBackup(type)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors"
                >
                  {type === "system" && "System Backup"}
                  {type === "config" && "Config Only"}
                  {type === "full" && "Full Restore Backup"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Name input for pending backup */}
      {showNameInput && pendingType && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <p className="text-sm font-medium">
            {pendingType === "system" && "Create System Backup"}
            {pendingType === "config" && "Create Config Backup"}
            {pendingType === "full" && "Create Full Restore Backup"}
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Optional name (auto-generated if blank)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  createMut.mutate({ type: pendingType, name: customName || undefined });
                }
              }}
              className="flex-1"
            />
            <Button
              onClick={() => createMut.mutate({ type: pendingType, name: customName || undefined })}
              loading={createMut.isPending}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Start
            </Button>
            <Button
              variant="outline"
              onClick={() => { setShowNameInput(false); setPendingType(null); setCustomName(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Running progress indicator */}
      {hasRunning && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-blue-300 font-medium">Backup in progress…</p>
            <Progress className="h-1.5 mt-1.5" value={undefined} />
          </div>
        </div>
      )}

      {/* Backup table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : !backups?.length ? (
            <div className="flex flex-col items-center py-14 text-muted-foreground">
              <Archive className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No backups yet</p>
              <p className="text-xs mt-1 opacity-60">Create your first backup using the button above</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate max-w-[200px]">{b.name}</span>
                      <Badge
                        className={cn(
                          "text-[10px] border px-1.5 py-0",
                          getTypeColor(b.backup_type),
                        )}
                      >
                        {getTypeLabel(b.backup_type)}
                      </Badge>
                      <StatusBadge status={b.status} />
                      {b.cloud_synced && (
                        <Badge className="text-[10px] bg-sky-500/20 text-sky-300 border-sky-500/30 border">
                          <Cloud className="w-2.5 h-2.5 mr-0.5" /> Synced
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(b.started_at)}</span>
                      {b.size_bytes != null && (
                        <span className="font-mono">{formatBytes(b.size_bytes)}</span>
                      )}
                      {b.error_message && (
                        <span className="text-red-400 truncate max-w-[200px]" title={b.error_message}>
                          {b.error_message}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {b.status === "completed" && (
                      <>
                        <a href={`/api/v1/backup/${b.id}/download`} download>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]">
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        </a>
                        {(b.backup_type === "config" || b.backup_type === "sd_image") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => setConfirmRestore(b.id)}
                            loading={restoreMut.isPending && confirmRestore === b.id}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Restore
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDelete(b.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm delete */}
      {confirmDelete !== null && (
        <ConfirmModal
          title="Delete Backup"
          description="This will permanently delete the backup archive from disk. This cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => deleteMut.mutate(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Confirm restore */}
      {confirmRestore !== null && (
        <ConfirmModal
          title="Restore Backup"
          description="This will overwrite current configuration files with the backup contents. A service restart will be required. Continue?"
          confirmLabel="Restore"
          variant="default"
          onConfirm={() => restoreMut.mutate(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </div>
  );
}

// ─── Tab 2: Schedule ──────────────────────────────────────────────────────────

const SCHEDULE_TYPES: { type: string; label: string; description: string }[] = [
  { type: "system",   label: "System Backup",       description: "/home, /etc, app database" },
  { type: "config",   label: "Config Backup",        description: "SUDO-Pi settings and .env only" },
  { type: "sd_image", label: "Full Restore Backup",  description: "Comprehensive archive of all important directories" },
];

function ScheduleCard({
  scheduleType,
  initial,
  remotes,
  onSave,
  saving,
}: {
  scheduleType: { type: string; label: string; description: string };
  initial: BackupSchedule | undefined;
  remotes: RcloneRemote[];
  onSave: (data: Omit<BackupSchedule, "id" | "last_run_at" | "next_run_at">) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [cron, setCron] = useState(initial?.cron_expression ?? "0 2 * * *");
  const [keepCount, setKeepCount] = useState(initial?.keep_count ?? 5);
  const [destination, setDestination] = useState(initial?.destination ?? "local");
  const [rcloneRemote, setRcloneRemote] = useState(initial?.rclone_remote ?? "");

  const human = parseCron(cron);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div>
            <span>{scheduleType.label}</span>
            <p className="text-xs font-normal text-muted-foreground mt-0.5">
              {scheduleType.description}
            </p>
          </div>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              "relative inline-flex w-10 h-5 rounded-full transition-colors shrink-0",
              enabled ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                enabled && "translate-x-5",
              )}
            />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Cron Expression</label>
            <Input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              className="font-mono text-xs"
              placeholder="0 2 * * *"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{human}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Keep last N backups</label>
            <Input
              type="number"
              min={1}
              max={50}
              value={keepCount}
              onChange={(e) => setKeepCount(parseInt(e.target.value, 10) || 1)}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Destination</label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local storage only</SelectItem>
              <SelectItem value="rclone">Cloud (rclone)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {destination === "rclone" && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              rclone remote &amp; path
            </label>
            {remotes.length === 0 ? (
              <p className="text-xs text-yellow-400">
                No remotes configured. Add one in the Cloud Sync tab.
              </p>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={rcloneRemote.split(":")[0] ?? ""}
                  onValueChange={(v) => setRcloneRemote(`${v}:sudo-pi-backups/`)}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select remote" />
                  </SelectTrigger>
                  <SelectContent>
                    {remotes.map((r) => (
                      <SelectItem key={r.name} value={r.name}>
                        {r.name} ({r.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={rcloneRemote}
                  onChange={(e) => setRcloneRemote(e.target.value)}
                  placeholder="gdrive:sudo-pi-backups/"
                  className="flex-1 text-xs h-8"
                />
              </div>
            )}
          </div>
        )}

        {initial?.next_run_at && (
          <p className="text-xs text-muted-foreground">
            Next run: <span className="font-medium text-foreground">{formatDate(initial.next_run_at)}</span>
          </p>
        )}
        {initial?.last_run_at && (
          <p className="text-xs text-muted-foreground">
            Last run: <span className="font-medium">{formatDate(initial.last_run_at)}</span>
          </p>
        )}

        <Button
          size="sm"
          className="w-full"
          onClick={() =>
            onSave({
              backup_type: scheduleType.type,
              enabled,
              cron_expression: cron,
              keep_count: keepCount,
              destination,
              rclone_remote: destination === "rclone" ? rcloneRemote || null : null,
            })
          }
          loading={saving}
        >
          Save Schedule
        </Button>
      </CardContent>
    </Card>
  );
}

function ScheduleTab() {
  const qc = useQueryClient();
  const { data: schedules } = useQuery({
    queryKey: ["backup-schedules"],
    queryFn: backupApi.getSchedule,
  });
  const { data: rcloneStatus } = useQuery({
    queryKey: ["rclone-status"],
    queryFn: rcloneApi.status,
  });

  const saveMut = useMutation({
    mutationFn: (body: Omit<BackupSchedule, "id" | "last_run_at" | "next_run_at">) =>
      backupApi.updateSchedule(body),
    onSuccess: () => {
      toast({ title: "Schedule saved", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["backup-schedules"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Save failed",
        description: err?.response?.data?.detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <Calendar className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300">
          Schedules are checked every minute by the background task. The cron expression uses
          standard 5-field format: <span className="font-mono">minute hour day month weekday</span>.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {SCHEDULE_TYPES.map((st) => (
          <ScheduleCard
            key={st.type}
            scheduleType={st}
            initial={schedules?.find((s) => s.backup_type === st.type)}
            remotes={rcloneStatus?.remotes ?? []}
            onSave={(data) => saveMut.mutate(data)}
            saving={saveMut.isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Tab 3: Cloud Sync ────────────────────────────────────────────────────────

const PROVIDER_FIELDS: Record<string, { key: string; label: string; type?: string; hint?: string }[]> = {
  drive: [
    { key: "client_id",     label: "Client ID" },
    { key: "client_secret", label: "Client Secret", type: "password" },
    { key: "token",         label: "OAuth Token (JSON)", hint: "Get from Google OAuth playground" },
  ],
  s3: [
    { key: "access_key_id",     label: "Access Key ID" },
    { key: "secret_access_key", label: "Secret Access Key", type: "password" },
    { key: "region",            label: "Region", hint: "e.g. us-east-1" },
    { key: "bucket",            label: "Bucket Name" },
  ],
  dropbox: [
    { key: "token", label: "Access Token", hint: "Get from Dropbox App Console" },
  ],
  onedrive: [
    { key: "token",    label: "OAuth Token (JSON)", hint: "Get from Microsoft OAuth" },
    { key: "drive_id", label: "Drive ID (optional)" },
  ],
  sftp: [
    { key: "host",     label: "Hostname" },
    { key: "port",     label: "Port", hint: "Default: 22" },
    { key: "user",     label: "Username" },
    { key: "pass",     label: "Password", type: "password" },
    { key: "key_file", label: "SSH Key File (optional)", hint: "e.g. /home/pi/.ssh/id_rsa" },
  ],
  b2: [
    { key: "account", label: "Account ID" },
    { key: "key",     label: "Application Key", type: "password" },
  ],
  webdav: [
    { key: "url",  label: "URL", hint: "e.g. https://dav.box.com/dav" },
    { key: "user", label: "Username" },
    { key: "pass", label: "Password", type: "password" },
  ],
};

function CloudSyncTab() {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("s3");
  const [remoteName, setRemoteName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message?: string; error?: string }>>({});
  const [syncRemote, setSyncRemote] = useState("");
  const [syncPath, setSyncPath] = useState("sudo-pi-backups/");
  const [syncLog, setSyncLog] = useState<string[]>([]);

  const { data: rclone, isLoading } = useQuery({
    queryKey: ["rclone-status"],
    queryFn: rcloneApi.status,
    refetchInterval: 30000,
  });

  const installMut = useMutation({
    mutationFn: rcloneApi.install,
    onSuccess: (res) => {
      toast({
        title: res.success ? "rclone installed" : "Install failed",
        description: res.message,
        variant: res.success ? "success" : "destructive",
      } as { title: string; description: string; variant: "success" | "destructive" });
      qc.invalidateQueries({ queryKey: ["rclone-status"] });
    },
  });

  const addMut = useMutation({
    mutationFn: () =>
      rcloneApi.addRemote(remoteName, selectedProvider, fieldValues),
    onSuccess: () => {
      toast({ title: "Remote added", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["rclone-status"] });
      setShowAddForm(false);
      setRemoteName("");
      setFieldValues({});
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Failed to add remote",
        description: err?.response?.data?.detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  const removeMut = useMutation({
    mutationFn: (name: string) => rcloneApi.removeRemote(name),
    onSuccess: () => {
      toast({ title: "Remote removed", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["rclone-status"] });
    },
  });

  const testMut = useMutation({
    mutationFn: (name: string) => rcloneApi.testRemote(name),
    onSuccess: (res, name) => {
      setTestResults((prev) => ({ ...prev, [name]: res }));
    },
    onError: (err: { response?: { data?: { detail?: string } } }, name) => {
      setTestResults((prev) => ({
        ...prev,
        [name]: { success: false, error: err?.response?.data?.detail ?? "Connection failed" },
      }));
    },
  });

  const syncMut = useMutation({
    mutationFn: () => rcloneApi.sync(`${syncRemote}:${syncPath}`),
    onSuccess: (res) => {
      const msg = res.success
        ? `Sync complete: ${res.transferred_count} files transferred (${formatBytes(res.transferred_bytes)}) in ${res.elapsed_seconds}s`
        : `Sync failed: ${res.error}`;
      setSyncLog((prev) => [
        `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...prev.slice(0, 19),
      ]);
      toast({
        title: res.success ? "Sync complete" : "Sync failed",
        description: msg,
        variant: res.success ? "success" : "destructive",
      } as { title: string; description: string; variant: "success" | "destructive" });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const msg = err?.response?.data?.detail ?? "Sync failed";
      setSyncLog((prev) => [`[${new Date().toLocaleTimeString()}] ERROR: ${msg}`, ...prev.slice(0, 19)]);
    },
  });

  const fields = PROVIDER_FIELDS[selectedProvider] ?? [];

  return (
    <div className="space-y-5">
      {/* Install banner */}
      {!isLoading && !rclone?.installed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-300">rclone is not installed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              rclone is required for cloud sync functionality.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => installMut.mutate()}
            loading={installMut.isPending}
          >
            <PlugZap className="w-3.5 h-3.5 mr-1.5" />
            Install rclone
          </Button>
        </div>
      )}

      {rclone?.installed && (
        <div className="flex items-center gap-2">
          <Badge className="bg-green-500/20 text-green-300 border-green-500/30 border text-[11px]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            rclone installed
          </Badge>
          {rclone.version && (
            <span className="text-xs text-muted-foreground font-mono">{rclone.version}</span>
          )}
        </div>
      )}

      {/* Configured remotes */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cloud className="w-3.5 h-3.5" />
            Configured Remotes
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm((v) => !v)}
            disabled={!rclone?.installed}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Remote
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!rclone?.remotes?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No remotes configured yet.
            </p>
          ) : (
            rclone.remotes.map((remote) => (
              <div
                key={remote.name}
                className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3"
              >
                <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{remote.name}</p>
                  <p className="text-xs text-muted-foreground">{remote.type}</p>
                </div>
                {testResults[remote.name] && (
                  <span
                    className={cn(
                      "text-xs",
                      testResults[remote.name].success ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {testResults[remote.name].success
                      ? testResults[remote.name].message
                      : testResults[remote.name].error}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => testMut.mutate(remote.name)}
                  loading={testMut.isPending}
                >
                  Test
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (window.confirm(`Remove remote "${remote.name}"?`)) {
                      removeMut.mutate(remote.name);
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add remote form */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Add Cloud Remote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Remote Name</label>
                <Input
                  value={remoteName}
                  onChange={(e) => setRemoteName(e.target.value)}
                  placeholder="my-gdrive"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
                <Select
                  value={selectedProvider}
                  onValueChange={(v) => { setSelectedProvider(v); setFieldValues({}); }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rclone?.providers?.map((p) => (
                      <SelectItem key={p.id} value={p.type}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                  <Input
                    type={f.type === "password" ? "password" : "text"}
                    value={fieldValues[f.key] ?? ""}
                    onChange={(e) =>
                      setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    placeholder={f.hint ?? ""}
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => addMut.mutate()}
                loading={addMut.isPending}
                disabled={!remoteName}
              >
                Add Remote
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync now */}
      {rclone?.installed && rclone.remotes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5" />
              Sync Now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Remote</label>
                <Select value={syncRemote} onValueChange={setSyncRemote}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select remote" />
                  </SelectTrigger>
                  <SelectContent>
                    {rclone.remotes.map((r) => (
                      <SelectItem key={r.name} value={r.name}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Remote path</label>
                <Input
                  value={syncPath}
                  onChange={(e) => setSyncPath(e.target.value)}
                  className="text-xs h-8"
                  placeholder="sudo-pi-backups/"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => syncMut.mutate()}
              loading={syncMut.isPending}
              disabled={!syncRemote}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Sync Backups to {syncRemote || "Remote"}:{syncPath}
            </Button>
            {syncLog.length > 0 && (
              <div className="rounded-lg bg-muted/30 border border-border p-3 font-mono text-[11px] text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
                {syncLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 4: Snapshot ──────────────────────────────────────────────────────────

const SNAPSHOT_SECTIONS = [
  { icon: "📡", label: "AP Configuration", key: "ap_configs" },
  { icon: "👤", label: "User Accounts (hashed passwords)", key: "users" },
  { icon: "🔔", label: "Alert Rules", key: "alert_rules" },
  { icon: "📅", label: "Backup Schedules", key: "backup_schedules" },
  { icon: "🔑", label: "SSH Authorized Keys", key: "ssh_authorized_keys" },
  { icon: "🌐", label: "VPN (WireGuard, no private keys)", key: "wireguard_configs" },
  { icon: "⚙️", label: "hostapd & dnsmasq configs", key: "hostapd_conf" },
  { icon: "📋", label: "System metadata (hostname, timezone)", key: "system" },
];

function SnapshotTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<object | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState<{
    applied: string[];
    skipped: string[];
    warnings: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      const res = await backupApi.exportSnapshot();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `sudopi_snapshot_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Snapshot exported", variant: "success" } as { title: string; variant: "success" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" } as { title: string; variant: "destructive" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setImportData(parsed);
        setImportResult(null);
      } catch {
        toast({ title: "Invalid JSON file", variant: "destructive" } as { title: string; variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData) return;
    setImporting(true);
    try {
      const result = await backupApi.importSnapshot(importData);
      setImportResult(result);
      toast({
        title: "Snapshot imported",
        description: `Applied ${result.applied.length} item(s)`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast({
        title: "Import failed",
        description: detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Warning */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300">
          Importing a snapshot will overwrite current settings. A service restart may be required
          for all changes to take effect.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Export */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Download className="w-3.5 h-3.5" />
              Export Settings Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Download a complete JSON snapshot of all SUDO-Pi settings. Includes:
            </p>
            <ul className="space-y-1.5">
              {SNAPSHOT_SECTIONS.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full" size="sm" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Snapshot
            </Button>
          </CardContent>
        </Card>

        {/* Import */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="w-3.5 h-3.5" />
              Import Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileRef.current?.click()}
            >
              <FileJson className="w-3.5 h-3.5 mr-1.5" />
              {importFileName || "Choose JSON file…"}
            </Button>

            {importData && !importResult && (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Preview</p>
                  {SNAPSHOT_SECTIONS.map((s) => {
                    const val = (importData as Record<string, unknown>)[s.key];
                    const count =
                      Array.isArray(val)
                        ? val.length
                        : typeof val === "object" && val !== null
                        ? Object.keys(val).length
                        : val
                        ? 1
                        : 0;
                    return (
                      <div key={s.key} className="flex justify-between">
                        <span>{s.label}</span>
                        <span className={cn(count > 0 ? "text-green-400" : "text-muted-foreground")}>
                          {count > 0 ? `${count} item(s)` : "empty"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleImport}
                  loading={importing}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Apply Snapshot
                </Button>
              </div>
            )}

            {importResult && (
              <div className="space-y-3">
                {importResult.applied.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-400 mb-1">
                      Applied ({importResult.applied.length})
                    </p>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5">
                      {importResult.applied.map((item) => (
                        <li key={item} className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.skipped.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-yellow-400 mb-1">
                      Skipped ({importResult.skipped.length})
                    </p>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5">
                      {importResult.skipped.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.warnings.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-400 mb-1">Warnings</p>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5">
                      {importResult.warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setImportData(null);
                    setImportFileName("");
                    setImportResult(null);
                  }}
                >
                  Import Another
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const qc = useQueryClient();

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Archive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Backup &amp; Recovery</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Schedule, manage, and restore SUDO-Pi backups
            </p>
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["backups"] });
            qc.invalidateQueries({ queryKey: ["backup-schedules"] });
            qc.invalidateQueries({ queryKey: ["rclone-status"] });
            qc.invalidateQueries({ queryKey: ["backup-disk-usage"] });
          }}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <Tabs defaultValue="backups">
        <TabsList>
          <TabsTrigger value="backups">
            <Archive className="w-3.5 h-3.5 mr-1.5" />
            Backups
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="cloud">
            <Cloud className="w-3.5 h-3.5 mr-1.5" />
            Cloud Sync
          </TabsTrigger>
          <TabsTrigger value="snapshot">
            <FileJson className="w-3.5 h-3.5 mr-1.5" />
            Snapshot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="mt-4">
          <BackupsTab />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab />
        </TabsContent>

        <TabsContent value="cloud" className="mt-4">
          <CloudSyncTab />
        </TabsContent>

        <TabsContent value="snapshot" className="mt-4">
          <SnapshotTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
