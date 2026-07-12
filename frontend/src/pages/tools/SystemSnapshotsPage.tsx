import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera, RefreshCw, Plus, Trash2, Download, RotateCcw, CheckCircle2, FolderArchive,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Snapshot {
  id: number;
  label: string;
  created_at: string;
  path: string;
  filename: string;
  size: number;
  file_exists: boolean;
  included_paths?: string[];
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  }
  return { msg, toast };
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SystemSnapshotsPage() {
  const qc = useQueryClient();
  const { msg, toast } = useToast();
  const [label, setLabel] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const { data: snapshots = [], isLoading, refetch, isFetching } = useQuery<Snapshot[]>({
    queryKey: ["snapshots"],
    queryFn: async () => {
      const { data } = await apiClient.get<Snapshot[]>("/snapshots");
      return data;
    },
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<Snapshot>("/snapshots", { label: label.trim() || null }, {});
      return data;
    },
    onSuccess: (snap) => {
      toast(`Snapshot "${snap.label}" created (${fmtSize(snap.size)}).`);
      setShowCreate(false);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/snapshots/${id}`);
    },
    onSuccess: () => {
      toast("Snapshot deleted.");
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const restoreMut = useMutation({
    mutationFn: async (id: number) => {
      setRestoringId(id);
      const { data } = await apiClient.post<{ restored_files: number; label: string }>(
        `/snapshots/${id}/restore`, {}, {}
      );
      return data;
    },
    onSuccess: (data) => {
      toast(`Restored "${data.label}" — ${data.restored_files} files applied. Services reloaded.`);
      setRestoringId(null);
    },
    onError: (e) => {
      toast(getApiError(e), false);
      setRestoringId(null);
    },
  });

  async function downloadSnapshot(id: number, filename: string) {
    const res = await apiClient.get(`/snapshots/${id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Camera className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">System Snapshots</h2>
            <p className="text-sm text-muted-foreground">
              Capture config snapshots (tar.gz) and restore them in one click.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate((v) => !v)}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Snapshot
          </Button>
        </div>
      </div>

      {msg && (
        <div className={cn(
          "text-sm px-3 py-2 rounded-lg border",
          msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5",
        )}>
          {msg.text}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Camera className="w-4 h-4 text-primary" />
              Create Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Label <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Before major update"
                maxLength={100}
              />
            </div>
            <div className="text-xs text-muted-foreground/70 space-y-1">
              <p>This snapshot will archive:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono">
                <li>/etc/sudo-pi/</li>
                <li>/etc/dnsmasq.d/</li>
                <li>/etc/wireguard/</li>
                <li>/etc/nginx/sites-available/sudo-pi*.conf</li>
                <li>/opt/sudo-pi/backend/.env</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="gap-1.5"
              >
                {createMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Create Snapshot
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Snapshots</p>
          <p className="text-xl font-bold mt-1">{snapshots.length}</p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Size</p>
          <p className="text-xl font-bold mt-1">
            {fmtSize(snapshots.reduce((acc, s) => acc + (s.size ?? 0), 0))}
          </p>
        </div>
        <div className="metric-card text-center sm:block hidden">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Latest</p>
          <p className="text-sm font-bold mt-1">
            {snapshots[0] ? relTime(snapshots[0].created_at) : "—"}
          </p>
        </div>
      </div>

      {/* Snapshot list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : snapshots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderArchive className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No snapshots yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create your first snapshot before making system changes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {snapshots.map((snap, idx) => (
            <Card key={snap.id} className={cn(
              "border transition-colors",
              !snap.file_exists && "opacity-50 border-dashed",
            )}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    idx === 0 ? "bg-primary/15 border border-primary/25" : "bg-muted/60 border border-border/50",
                  )}>
                    <Camera className={cn("w-4 h-4", idx === 0 ? "text-primary" : "text-muted-foreground/50")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{snap.label}</span>
                      {idx === 0 && (
                        <span className="text-[10px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                          Latest
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground/60">
                        {relTime(snap.created_at)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/40">·</span>
                      <span className="text-[11px] font-mono text-muted-foreground/60">
                        {fmtSize(snap.size ?? 0)}
                      </span>
                      {!snap.file_exists && (
                        <span className="text-[11px] text-red-400">file missing</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => downloadSnapshot(snap.id, snap.filename)}
                      disabled={!snap.file_exists}
                      title="Download archive"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                      onClick={() => {
                        if (confirm(`Restore snapshot "${snap.label}"?\n\nThis will overwrite current configs in /etc/sudo-pi and /etc/dnsmasq.d and reload nginx/dnsmasq.`)) {
                          restoreMut.mutate(snap.id);
                        }
                      }}
                      disabled={!snap.file_exists || (restoreMut.isPending && restoringId === snap.id)}
                      title="Restore this snapshot"
                    >
                      {restoreMut.isPending && restoringId === snap.id
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />
                      }
                      <span className="hidden sm:inline">Restore</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive/60 hover:text-destructive hover:bg-destructive/8"
                      onClick={() => {
                        if (confirm(`Delete snapshot "${snap.label}"?`)) deleteMut.mutate(snap.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground/50">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Snapshots are stored at <code className="font-mono">/opt/sudo-pi/snapshots/</code>.
          Restore only extracts configs to safe paths (<code className="font-mono">/etc/sudo-pi/</code>,{" "}
          <code className="font-mono">/etc/dnsmasq.d/</code>, <code className="font-mono">/etc/wireguard/</code>).
        </p>
      </div>
    </div>
  );
}
