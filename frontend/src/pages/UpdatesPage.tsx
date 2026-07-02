import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Download, ShieldCheck, Clock, History,
  CheckCircle2, XCircle, Loader2, RotateCcw, Package, AlertTriangle,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpgradablePackage {
  name: string;
  current_version: string;
  new_version: string;
  source: string;
  security: boolean;
}

interface UpdateRunPackage {
  name: string;
  old_version: string | null;
  new_version: string;
}

interface UpdateRun {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  trigger: "manual" | "scheduled" | "rollback";
  status: "running" | "success" | "failed";
  packages: UpdateRunPackage[];
  output: string | null;
  error: string | null;
}

interface UpdateSchedule {
  id: number;
  enabled: boolean;
  run_time: string;
  days: string;
  security_only: boolean;
  auto_reboot_if_required: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface UpdateStatus {
  upgradable_count: number;
  security_count: number;
  last_check_at: string | null;
  last_run: UpdateRun | null;
  schedule: UpdateSchedule;
  reboot_required: boolean;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const updatesApi = {
  status: async (): Promise<UpdateStatus | null> => {
    const { data } = await apiClient.get("/os-updates/status");
    return data && typeof data === "object" ? data : null;
  },
  packages: async (): Promise<UpgradablePackage[]> => {
    const { data } = await apiClient.get("/os-updates/packages");
    return Array.isArray(data?.packages) ? data.packages : [];
  },
  check: async () => {
    const { data } = await apiClient.post("/os-updates/check");
    return data;
  },
  upgrade: async (packages: string[] | null): Promise<{ run_id: number }> => {
    const { data } = await apiClient.post("/os-updates/upgrade", { packages });
    return data;
  },
  run: async (id: number): Promise<UpdateRun> => {
    const { data } = await apiClient.get(`/os-updates/runs/${id}`);
    return data;
  },
  history: async (): Promise<UpdateRun[]> => {
    const { data } = await apiClient.get("/os-updates/history");
    return Array.isArray(data) ? data : [];
  },
  rollback: async (name: string, version: string) => {
    const { data } = await apiClient.post("/os-updates/rollback", { name, version });
    return data;
  },
  updateSchedule: async (body: Partial<UpdateSchedule>) => {
    const { data } = await apiClient.put("/os-updates/schedule", body);
    return data;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const DAY_OPTIONS = ["daily", "mon,wed,fri", "sat,sun", "mon,tue,wed,thu,fri"] as const;
const DAY_LABELS: Record<string, string> = {
  "daily": "Every day",
  "mon,wed,fri": "Mon / Wed / Fri",
  "sat,sun": "Weekends",
  "mon,tue,wed,thu,fri": "Weekdays",
};

// ─── Run status badge ─────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: UpdateRun["status"] }) {
  if (status === "running")
    return (
      <Badge variant="info" className="gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Running
      </Badge>
    );
  if (status === "success")
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="w-3 h-3" /> Success
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
}

// ─── Schedule Card ────────────────────────────────────────────────────────────

function ScheduleCard({ schedule }: { schedule: UpdateSchedule }) {
  const qc = useQueryClient();
  const [runTime, setRunTime] = useState(schedule.run_time);
  const [days, setDays] = useState(schedule.days);

  const mut = useMutation({
    mutationFn: (body: Partial<UpdateSchedule>) => updatesApi.updateSchedule(body),
    onSuccess: () => {
      toast({ title: "Update schedule saved", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["os-updates-status"] });
    },
    onError: (err) =>
      toast({
        title: "Failed to save schedule",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          Automatic Updates
        </CardTitle>
        <Switch
          checked={schedule.enabled}
          onCheckedChange={(checked) => mut.mutate({ enabled: checked })}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Run at</p>
            <Input
              type="time"
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Days</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setDays(opt)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg border text-xs transition-colors",
                    days === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {DAY_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5" />
              Security updates only
            </span>
            <Switch
              checked={schedule.security_only}
              onCheckedChange={(checked) => mut.mutate({ security_only: checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5" />
              Auto-reboot when required
            </span>
            <Switch
              checked={schedule.auto_reboot_if_required}
              onCheckedChange={(checked) => mut.mutate({ auto_reboot_if_required: checked })}
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Last run: {fmtDate(schedule.last_run_at)}</p>
            <p>Next run: {schedule.enabled ? fmtDate(schedule.next_run_at) : "Disabled"}</p>
          </div>
          <Button
            size="sm"
            loading={mut.isPending}
            onClick={() => mut.mutate({ run_time: runTime, days })}
          >
            Save schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

function HistoryCard() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["os-updates-history"],
    queryFn: updatesApi.history,
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "running") ? 4000 : 30000,
  });

  const rollbackMut = useMutation({
    mutationFn: ({ name, version }: { name: string; version: string }) =>
      updatesApi.rollback(name, version),
    onSuccess: (run: UpdateRun) => {
      toast({
        title: run.status === "success" ? "Package rolled back" : "Rollback failed",
        variant: run.status === "success" ? "success" : "destructive",
      } as { title: string; variant: "success" | "destructive" });
      qc.invalidateQueries({ queryKey: ["os-updates-history"] });
      qc.invalidateQueries({ queryKey: ["os-updates-status"] });
    },
    onError: (err) =>
      toast({
        title: "Rollback failed",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const requestRollback = async (pkg: UpdateRunPackage) => {
    if (!pkg.old_version) return;
    const ok = await confirm({
      title: `Roll back ${pkg.name}?`,
      description: `${pkg.name} will be downgraded from ${pkg.new_version} back to ${pkg.old_version}. Dependencies may also change.`,
      confirmLabel: "Roll back",
      severity: "danger",
    });
    if (ok) rollbackMut.mutate({ name: pkg.name, version: pkg.old_version });
  };

  return (
    <Card>
      {dialog}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          Update History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No updates yet"
            description="Runs will appear here after the first upgrade."
          />
        ) : (
          <div className="space-y-2">
            {history.map((run) => (
              <div key={run.id} className="rounded-xl border border-border/70 overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors text-left"
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                >
                  <RunStatusBadge status={run.status} />
                  <Badge variant="outline" className="capitalize">{run.trigger}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {run.packages.length} package{run.packages.length === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {fmtDate(run.started_at)}
                  </span>
                </button>

                {expanded === run.id && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3 bg-muted/30">
                    {run.error && (
                      <p className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {run.error}
                      </p>
                    )}
                    {run.packages.length > 0 && (
                      <div className="space-y-1">
                        {run.packages.map((pkg) => (
                          <div key={pkg.name} className="flex items-center gap-2 text-xs">
                            <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="font-mono">{pkg.name}</span>
                            <span className="text-muted-foreground font-mono">
                              {pkg.old_version ?? "?"} → {pkg.new_version}
                            </span>
                            {run.status === "success" && run.trigger !== "rollback" && pkg.old_version && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-6 px-2 text-[11px] gap-1 text-warning hover:text-warning"
                                onClick={() => requestRollback(pkg)}
                                loading={rollbackMut.isPending}
                              >
                                <RotateCcw className="w-3 h-3" /> Roll back
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {run.output && (
                      <pre className="max-h-48 overflow-y-auto rounded-lg bg-background p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap">
                        {run.output}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UpdatesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  const { data: status } = useQuery({
    queryKey: ["os-updates-status"],
    queryFn: updatesApi.status,
    refetchInterval: 30000,
  });

  const { data: packages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ["os-updates-packages"],
    queryFn: updatesApi.packages,
    refetchInterval: 60000,
  });

  // Poll the active run until it finishes
  useQuery({
    queryKey: ["os-updates-run", activeRunId],
    queryFn: async () => {
      const run = await updatesApi.run(activeRunId as number);
      if (run.status !== "running") {
        setActiveRunId(null);
        toast({
          title: run.status === "success" ? "Upgrade complete" : "Upgrade failed",
          description:
            run.status === "success"
              ? `${run.packages.length} packages upgraded`
              : run.error ?? "Check the history for details",
          variant: run.status === "success" ? "success" : "destructive",
        } as { title: string; description: string; variant: "success" | "destructive" });
        qc.invalidateQueries({ queryKey: ["os-updates-status"] });
        qc.invalidateQueries({ queryKey: ["os-updates-packages"] });
        qc.invalidateQueries({ queryKey: ["os-updates-history"] });
      }
      return run;
    },
    enabled: activeRunId !== null,
    refetchInterval: 3000,
  });

  const checkMut = useMutation({
    mutationFn: updatesApi.check,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["os-updates-status"] });
      qc.invalidateQueries({ queryKey: ["os-updates-packages"] });
      toast({ title: "Package index refreshed", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Check failed",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const upgradeMut = useMutation({
    mutationFn: (pkgs: string[] | null) => updatesApi.upgrade(pkgs),
    onSuccess: (res) => {
      setActiveRunId(res.run_id);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["os-updates-history"] });
      toast({ title: "Upgrade started", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Failed to start upgrade",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const requestUpgrade = async (pkgs: string[] | null) => {
    const count = pkgs === null ? packages.length : pkgs.length;
    const ok = await confirm({
      title: pkgs === null ? "Upgrade all packages?" : `Upgrade ${count} selected package${count === 1 ? "" : "s"}?`,
      description:
        "apt will install the new versions. Services may restart during the upgrade; the dashboard stays reachable.",
      confirmLabel: "Upgrade",
      severity: "danger",
    });
    if (ok) upgradeMut.mutate(pkgs);
  };

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const upgrading = activeRunId !== null || upgradeMut.isPending;

  return (
    <div className="p-6 space-y-5">
      {dialog}

      {/* Title + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">System Updates</h2>
          <PageHelp
            title="System updates"
            points={[
              "Check apt for upgradable packages",
              "Upgrade everything or a selection",
              "Schedule automatic updates (e.g. 4 AM)",
              "Roll any package back to its previous version",
            ]}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          loading={checkMut.isPending}
          onClick={() => checkMut.mutate()}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Check for updates
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Upgradable</p>
          <p className="text-2xl font-bold tabular-nums">{status?.upgradable_count ?? "—"}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Security</p>
          <p className={cn(
            "text-2xl font-bold tabular-nums",
            (status?.security_count ?? 0) > 0 ? "text-warning" : ""
          )}>
            {status?.security_count ?? "—"}
          </p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Last check</p>
          <p className="text-sm font-medium mt-1.5">{fmtDate(status?.last_check_at ?? null)}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Reboot</p>
          {status?.reboot_required ? (
            <Badge variant="warning" className="mt-1.5">Required</Badge>
          ) : (
            <p className="text-sm font-medium mt-1.5 text-success">Not needed</p>
          )}
        </div>
      </div>

      {/* Packages */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5" />
            Available Updates
          </CardTitle>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                loading={upgrading}
                onClick={() => requestUpgrade(Array.from(selected))}
              >
                Upgrade selected ({selected.size})
              </Button>
            )}
            <Button
              size="sm"
              loading={upgrading}
              disabled={packages.length === 0}
              onClick={() => requestUpgrade(null)}
            >
              Upgrade all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {packagesLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : packages.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="System is up to date"
              description={
                status?.last_check_at
                  ? "No upgradable packages found on the last check."
                  : "Run a check to refresh the package index."
              }
              action={{ label: "Check now", onClick: () => checkMut.mutate() }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-xs text-muted-foreground">
                    <th className="py-2 pr-3 w-8"></th>
                    <th className="py-2 pr-4 text-left font-medium">Package</th>
                    <th className="py-2 pr-4 text-left font-medium">Current</th>
                    <th className="py-2 pr-4 text-left font-medium">New</th>
                    <th className="py-2 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr
                      key={pkg.name}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/30 cursor-pointer"
                      onClick={() => toggle(pkg.name)}
                    >
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(pkg.name)}
                          onChange={() => toggle(pkg.name)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-primary"
                        />
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-[13px]">{pkg.name}</span>
                        {pkg.security && (
                          <Badge variant="warning" className="ml-2 text-[10px] gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" /> security
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{pkg.current_version}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-success">{pkg.new_version}</td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground/70 truncate max-w-[180px]">
                        {pkg.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      {status?.schedule && <ScheduleCard schedule={status.schedule} />}

      {/* History */}
      <HistoryCard />
    </div>
  );
}
