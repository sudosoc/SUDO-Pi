import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, RefreshCw, XCircle, ChevronUp, ChevronDown, Server,
  Cpu, User,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Process {
  pid:     number;
  user:    string;
  cpu:     number;
  mem:     number;
  vsz:     number;
  rss:     number;
  stat:    string;
  started: string;
  time:    string;
  command: string;
}

type SortKey  = "pid" | "cpu" | "mem" | "command" | "user";
type SortDir  = "asc" | "desc";

// ─── API ──────────────────────────────────────────────────────────────────────

const processApi = {
  list: async (): Promise<Process[]> => {
    const { data } = await apiClient.get("/processes");
    if (!Array.isArray(data)) return [];
    // Normalize every entry — tolerate alternate field names from older
    // backend builds (cpu_percent/memory_percent) and missing fields.
    return data.map((p: Record<string, unknown>) => ({
      pid:     Number(p.pid) || 0,
      user:    String(p.user ?? p.username ?? "?"),
      cpu:     Number(p.cpu ?? p.cpu_percent) || 0,
      mem:     Number(p.mem ?? p.memory_percent) || 0,
      vsz:     Number(p.vsz) || 0,
      rss:     Number(p.rss) || 0,
      stat:    String(p.stat ?? p.status ?? ""),
      started: String(p.started ?? ""),
      time:    String(p.time ?? ""),
      command: String(p.command ?? p.name ?? ""),
    }));
  },
  kill: async (pid: number, signal = 15): Promise<void> => {
    await apiClient.post(`/processes/${pid}/kill`, { signal });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024)        return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
}

function statColor(stat: string | undefined): string {
  const s = stat ?? "";
  if (s.startsWith("R")) return "text-green-400";
  if (s.startsWith("S")) return "text-cyan-400";
  if (s.startsWith("D")) return "text-yellow-400";
  if (s.startsWith("Z")) return "text-red-400";
  if (s.startsWith("T")) return "text-orange-400";
  return "text-muted-foreground";
}

function statLabel(stat: string | undefined): string {
  const s = stat ?? "";
  if (s.startsWith("R")) return "Running";
  if (s.startsWith("S")) return "Sleeping";
  if (s.startsWith("D")) return "Disk wait";
  if (s.startsWith("Z")) return "Zombie";
  if (s.startsWith("T")) return "Stopped";
  return s || "—";
}

function cpuColor(pct: number): string {
  if (pct >= 80) return "text-red-400";
  if (pct >= 40) return "text-yellow-400";
  if (pct >= 5)  return "text-cyan-400";
  return "text-muted-foreground";
}

// ─── Sort Header Cell ─────────────────────────────────────────────────────────

function SortTh({
  label, sortKey, current, dir, onSort,
  className,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={cn("text-left text-xs text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors py-2 px-3", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? (dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronDown className="w-3 h-3 opacity-20" />
        }
      </span>
    </th>
  );
}

// ─── Kill Confirm Modal ───────────────────────────────────────────────────────

function KillModal({
  process: proc,
  onClose,
  onConfirm,
}: {
  process: Process;
  onClose: () => void;
  onConfirm: (signal: number) => void;
}) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="font-semibold">Kill Process</p>
            <p className="text-xs text-muted-foreground font-mono">PID {proc.pid} — {proc.command.split(" ")[0]}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Send a signal to <span className="font-mono text-foreground">{proc.command.slice(0, 60)}</span>?
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            className="flex-1 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
            onClick={() => onConfirm(15)}
          >
            SIGTERM (15)
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => onConfirm(9)}
          >
            SIGKILL (9)
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProcessPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog }         = useConfirm();
  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("cpu");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [killTarget, setKillTarget] = useState<Process | null>(null);

  const { data: processes = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["processes"],
    queryFn:  processApi.list,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const killMutation = useMutation({
    mutationFn: ({ pid, signal }: { pid: number; signal: number }) =>
      processApi.kill(pid, signal),
    onSuccess: (_, { pid, signal }) => {
      toast({
        title: `Signal ${signal} sent to PID ${pid}`,
        variant: "success",
      } as { title: string; variant: "success" });
      setKillTarget(null);
      queryClient.invalidateQueries({ queryKey: ["processes"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Kill failed",
        description: err?.response?.data?.detail ?? "Permission denied or process not found",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
      setKillTarget(null);
    },
  });

  // Every kill passes through the unified ConfirmDialog. The KillModal above
  // only picks the signal — the actual confirmation happens here.
  const requestKill = async (proc: Process, signal: number) => {
    setKillTarget(null);
    const name = proc.command.split(" ")[0] || `PID ${proc.pid}`;
    const ok = await confirm(
      signal === 9
        ? {
            title: `Force kill ${name}?`,
            description: `SIGKILL (9) terminates PID ${proc.pid} immediately — the process cannot clean up and unsaved data is lost. This can't be undone.`,
            severity: "danger",
            confirmLabel: "Force Kill (SIGKILL)",
          }
        : {
            title: `Kill ${name}?`,
            description: `SIGTERM (15) asks PID ${proc.pid} to exit gracefully, giving it a chance to save state and clean up.`,
            severity: "danger",
            confirmLabel: "Kill (SIGTERM)",
          }
    );
    if (ok) killMutation.mutate({ pid: proc.pid, signal });
  };

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(key);
    setSortDir((prev) => (sortKey === key && prev === "desc" ? "asc" : "desc"));
  }, [sortKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? processes.filter(
          (p) =>
            p.command.toLowerCase().includes(q) ||
            p.user.toLowerCase().includes(q) ||
            String(p.pid).includes(q)
        )
      : processes;

    list = [...list].sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1;
      if (sortKey === "cpu")     return (a.cpu - b.cpu) * mult;
      if (sortKey === "mem")     return (a.mem - b.mem) * mult;
      if (sortKey === "pid")     return (a.pid - b.pid) * mult;
      if (sortKey === "user")    return a.user.localeCompare(b.user) * mult;
      if (sortKey === "command") return a.command.localeCompare(b.command) * mult;
      return 0;
    });

    return list;
  }, [processes, search, sortKey, sortDir]);

  // Summary stats
  const running  = processes.filter((p) => (p.stat ?? "").startsWith("R")).length;
  const sleeping = processes.filter((p) => (p.stat ?? "").startsWith("S")).length;
  const zombies  = processes.filter((p) => (p.stat ?? "").startsWith("Z")).length;
  const topCpu   = processes.slice().sort((a, b) => b.cpu - a.cpu).slice(0, 1)[0];

  return (
    <div className="p-6 space-y-5">
      {killTarget && (
        <KillModal
          process={killTarget}
          onClose={() => setKillTarget(null)}
          onConfirm={(signal) => { void requestKill(killTarget, signal); }}
        />
      )}
      {dialog}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{processes.length}</p>
        </div>
        <div className="rounded-xl border border-green-500/20 bg-card/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">Running</p>
          <p className="text-2xl font-bold text-green-400 tabular-nums">{running}</p>
        </div>
        <div className="rounded-xl border border-cyan-500/20 bg-card/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">Sleeping</p>
          <p className="text-2xl font-bold text-cyan-400 tabular-nums">{sleeping}</p>
        </div>
        <div className={cn("rounded-xl border bg-card/60 px-4 py-3", zombies > 0 ? "border-red-500/30" : "border-border")}>
          <p className="text-xs text-muted-foreground">Zombies</p>
          <p className={cn("text-2xl font-bold tabular-nums", zombies > 0 ? "text-red-400" : "text-foreground")}>
            {zombies}
          </p>
        </div>
      </div>

      {topCpu && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/40 border border-border rounded-lg px-4 py-2">
          <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Top CPU:</span>
          <span className="font-mono text-foreground truncate max-w-xs">{topCpu.command.split(" ")[0]}</span>
          <span className={cn("font-bold tabular-nums ml-auto shrink-0", cpuColor(topCpu.cpu))}>{topCpu.cpu.toFixed(1)}%</span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center gap-3 pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <Server className="w-4 h-4 text-muted-foreground" />
            Processes
          </CardTitle>
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, user, PID…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {filtered.length} / {processes.length}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["processes"] })}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && !processes.length ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border sticky top-0 bg-card z-10">
                  <tr>
                    <SortTh label="PID"     sortKey="pid"     current={sortKey} dir={sortDir} onSort={handleSort} className="w-16" />
                    <SortTh label="User"    sortKey="user"    current={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                    <SortTh label="CPU %"   sortKey="cpu"     current={sortKey} dir={sortDir} onSort={handleSort} className="w-20" />
                    <SortTh label="MEM %"   sortKey="mem"     current={sortKey} dir={sortDir} onSort={handleSort} className="w-20" />
                    <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3 w-24 hidden md:table-cell">RSS</th>
                    <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3 w-20 hidden lg:table-cell">State</th>
                    <SortTh label="Command" sortKey="command" current={sortKey} dir={sortDir} onSort={handleSort} />
                    <th className="py-2 px-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((proc) => (
                    <tr
                      key={proc.pid}
                      className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{proc.pid}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1 text-xs">
                          <User className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                          <span className="truncate max-w-[80px]">{proc.user}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={cn("font-bold tabular-nums text-xs", cpuColor(proc.cpu))}>
                          {proc.cpu.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={cn("font-medium tabular-nums text-xs", proc.mem > 10 ? "text-orange-400" : proc.mem > 5 ? "text-yellow-400" : "text-foreground")}>
                          {proc.mem.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground hidden md:table-cell">
                        {fmtKb(proc.rss)}
                      </td>
                      <td className="px-3 py-1.5 hidden lg:table-cell">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] border-0 px-1.5 py-0", statColor(proc.stat))}
                        >
                          {statLabel(proc.stat)}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 max-w-[240px]">
                        <span className="font-mono text-xs truncate block" title={proc.command}>
                          {proc.command}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setKillTarget(proc)}
                          title="Kill process"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Search className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No processes match "{search}"</p>
                </div>
              )}
            </div>
          )}
          {dataUpdatedAt > 0 && (
            <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
              <span>Auto-refreshes every 5 seconds</span>
              <span>Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
