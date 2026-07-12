import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Trash2, Play, Bell, RefreshCw, Terminal, Power,
  Cpu, X, CheckCircle2, XCircle, Activity, ChevronRight,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Automation {
  id: number;
  name: string;
  enabled: boolean;
  trigger_type: "metric" | "service_down";
  metric: string | null;
  operator: ">" | "<";
  threshold: number;
  duration_sec: number;
  service_name: string | null;
  action_type: "notify" | "restart_service" | "run_command" | "reboot";
  action_target: string | null;
  cooldown_sec: number;
  last_triggered_at: string | null;
  trigger_count: number;
}

interface AutomationEvent {
  id: number;
  automation_name: string;
  fired_at: string | null;
  detail: string;
  action_type: string;
  action_result: string | null;
  success: boolean;
}

type NewAutomation = Omit<Automation, "id" | "last_triggered_at" | "trigger_count">;

// ─── Constants ────────────────────────────────────────────────────────────────

const METRICS = [
  { value: "cpu", label: "CPU %", unit: "%" },
  { value: "ram", label: "RAM %", unit: "%" },
  { value: "disk", label: "Disk %", unit: "%" },
  { value: "temp", label: "Temperature", unit: "°C" },
];

const ACTION_META: Record<string, { label: string; icon: typeof Bell; needsTarget: boolean; targetLabel?: string; targetPlaceholder?: string }> = {
  notify:          { label: "Notify me", icon: Bell, needsTarget: false },
  restart_service: { label: "Restart a service", icon: RefreshCw, needsTarget: true, targetLabel: "Service name", targetPlaceholder: "sudo-pi-backend" },
  run_command:     { label: "Run a command", icon: Terminal, needsTarget: true, targetLabel: "Shell command", targetPlaceholder: "systemctl restart nginx" },
  reboot:          { label: "Reboot the Pi", icon: Power, needsTarget: false },
};

const DEFAULT_NEW: NewAutomation = {
  name: "",
  enabled: true,
  trigger_type: "metric",
  metric: "cpu",
  operator: ">",
  threshold: 85,
  duration_sec: 60,
  service_name: null,
  action_type: "notify",
  action_target: null,
  cooldown_sec: 300,
};

// ─── API ──────────────────────────────────────────────────────────────────────

const api = {
  list: async (): Promise<Automation[]> => {
    const { data } = await apiClient.get("/automations");
    return Array.isArray(data) ? data : [];
  },
  events: async (): Promise<AutomationEvent[]> => {
    const { data } = await apiClient.get("/automations/events");
    return Array.isArray(data) ? data : [];
  },
  create: async (body: NewAutomation) => (await apiClient.post("/automations", body)).data,
  update: async (id: number, body: Partial<Automation>) => (await apiClient.put(`/automations/${id}`, body)).data,
  remove: async (id: number) => { await apiClient.delete(`/automations/${id}`); },
  test: async (id: number) => (await apiClient.post(`/automations/${id}/test`)).data,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function triggerText(a: Automation): string {
  if (a.trigger_type === "service_down") return `${a.service_name} is down`;
  const meta = METRICS.find((m) => m.value === a.metric);
  const unit = meta?.unit ?? "";
  return `${meta?.label ?? a.metric} ${a.operator} ${a.threshold}${unit} for ${a.duration_sec}s`;
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "Never";
}

// ─── Builder Modal ────────────────────────────────────────────────────────────

function BuilderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<NewAutomation>(DEFAULT_NEW);

  const set = <K extends keyof NewAutomation>(key: K, value: NewAutomation[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const createMut = useMutation({
    mutationFn: () => api.create(form),
    onSuccess: () => {
      toast({ title: "Automation created", variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["automations"] });
      onClose();
    },
    onError: (err) =>
      toast({ title: "Failed to create", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const actionMeta = ACTION_META[form.action_type];
  const valid =
    form.name.trim().length > 0 &&
    (form.trigger_type !== "service_down" || (form.service_name ?? "").trim().length > 0) &&
    (!actionMeta.needsTarget || (form.action_target ?? "").trim().length > 0);

  return (
    <div className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="page-transition w-full max-w-lg rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> New Automation
          </h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Name</p>
            <Input placeholder="High CPU alert" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          {/* WHEN */}
          <div className="rounded-xl border border-border/70 p-3.5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">When</p>
            <div className="flex gap-2">
              {(["metric", "service_down"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set("trigger_type", t)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                    form.trigger_type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {t === "metric" ? "A metric crosses a threshold" : "A service goes down"}
                </button>
              ))}
            </div>

            {form.trigger_type === "metric" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Metric</p>
                  <select
                    className="w-full h-9 rounded-lg border border-border bg-input px-2 text-sm"
                    value={form.metric ?? "cpu"}
                    onChange={(e) => set("metric", e.target.value)}
                  >
                    {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Condition</p>
                  <div className="flex gap-1.5">
                    <select
                      className="h-9 rounded-lg border border-border bg-input px-2 text-sm"
                      value={form.operator}
                      onChange={(e) => set("operator", e.target.value as ">" | "<")}
                    >
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                    </select>
                    <Input
                      type="number"
                      value={form.threshold}
                      onChange={(e) => set("threshold", Number(e.target.value))}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-muted-foreground mb-1">Sustained for (seconds)</p>
                  <Input
                    type="number"
                    value={form.duration_sec}
                    onChange={(e) => set("duration_sec", Number(e.target.value))}
                    className="font-mono"
                  />
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Service name</p>
                <Input
                  placeholder="docker"
                  value={form.service_name ?? ""}
                  onChange={(e) => set("service_name", e.target.value)}
                  className="font-mono"
                />
              </div>
            )}
          </div>

          {/* THEN */}
          <div className="rounded-xl border border-border/70 p-3.5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Then</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ACTION_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    onClick={() => set("action_type", key as NewAutomation["action_type"])}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                      form.action_type === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" /> {meta.label}
                  </button>
                );
              })}
            </div>
            {actionMeta.needsTarget && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{actionMeta.targetLabel}</p>
                <Input
                  placeholder={actionMeta.targetPlaceholder}
                  value={form.action_target ?? ""}
                  onChange={(e) => set("action_target", e.target.value)}
                  className="font-mono"
                />
              </div>
            )}
          </div>

          {/* Cooldown */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Cooldown between firings (seconds)</p>
            <Input
              type="number"
              value={form.cooldown_sec}
              onChange={(e) => set("cooldown_sec", Number(e.target.value))}
              className="font-mono"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!valid} loading={createMut.isPending} onClick={() => createMut.mutate()}>
              Create automation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Automation Card ──────────────────────────────────────────────────────────

function AutomationCard({ auto }: { auto: Automation }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const actionMeta = ACTION_META[auto.action_type];
  const ActionIcon = actionMeta.icon;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["automations"] });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => api.update(auto.id, { enabled }),
    onSuccess: invalidate,
  });

  const testMut = useMutation({
    mutationFn: () => api.test(auto.id),
    onSuccess: () => {
      toast({ title: `Ran "${auto.name}"`, variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["automation-events"] });
    },
    onError: (err) =>
      toast({ title: "Test failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: () => api.remove(auto.id),
    onSuccess: () => {
      toast({ title: "Automation deleted", variant: "success" } as { title: string; variant: "success" });
      invalidate();
    },
  });

  const requestDelete = async () => {
    const ok = await confirm({
      title: `Delete "${auto.name}"?`,
      description: "This automation and its rule will be removed. Past events stay in the history.",
      confirmLabel: "Delete",
      severity: "danger",
    });
    if (ok) delMut.mutate();
  };

  const requestTest = async () => {
    if (auto.action_type === "reboot" || auto.action_type === "run_command") {
      const ok = await confirm({
        title: `Run this action now?`,
        description: auto.action_type === "reboot"
          ? "This will reboot the Pi in 1 minute."
          : `This will run: ${auto.action_target}`,
        confirmLabel: "Run action",
        severity: auto.action_type === "reboot" ? "critical" : "danger",
        typeToConfirm: auto.action_type === "reboot" ? "CONFIRM" : undefined,
      });
      if (!ok) return;
    }
    testMut.mutate();
  };

  return (
    <div className={cn("rounded-xl border p-4", auto.enabled ? "border-border/70" : "border-border/40 opacity-60")}>
      {dialog}
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
          auto.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
        )}>
          <Zap className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{auto.name}</p>
            {auto.trigger_count > 0 && (
              <Badge variant="outline" className="text-[10px]">{auto.trigger_count}×</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
            <Cpu className="w-3 h-3" />
            <span>{triggerText(auto)}</span>
            <ChevronRight className="w-3 h-3" />
            <ActionIcon className="w-3 h-3" />
            <span>{actionMeta.label}{actionMeta.needsTarget && auto.action_target ? `: ${auto.action_target}` : ""}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Last fired: {fmtDate(auto.last_triggered_at)}
          </p>
        </div>
        <Switch checked={auto.enabled} onCheckedChange={(c) => toggleMut.mutate(c)} />
      </div>

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50">
        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" loading={testMut.isPending} onClick={requestTest}>
          <Play className="w-3 h-3" /> Test
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
          loading={delMut.isPending}
          onClick={requestDelete}
        >
          <Trash2 className="w-3 h-3" /> Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Events Feed ──────────────────────────────────────────────────────────────

function EventsFeed() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["automation-events"],
    queryFn: api.events,
    refetchInterval: 15000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <SkeletonList count={3} />
        ) : events.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet" description="Automation firings will appear here." />
        ) : (
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-secondary/30">
                {e.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{e.automation_name}</p>
                  <p className="text-[11px] text-muted-foreground">{e.detail}</p>
                  {e.action_result && (
                    <p className="text-[11px] text-muted-foreground/70 font-mono truncate">{e.action_result}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">{fmtDate(e.fired_at)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [showBuilder, setShowBuilder] = useState(false);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: api.list,
    refetchInterval: 20000,
  });

  const activeCount = automations.filter((a) => a.enabled).length;

  return (
    <div className="p-6 space-y-5">
      {showBuilder && <BuilderModal onClose={() => setShowBuilder(false)} />}

      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Automations</h2>
          <PageHelp
            title="Automations"
            points={[
              "Rules that watch a metric or service and react",
              "Actions: notify, restart a service, run a command, reboot",
              "Metric rules fire only after the condition holds",
              "Cooldown stops repeated firings while a condition lasts",
            ]}
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowBuilder(true)}>
          <Plus className="w-3.5 h-3.5" />
          New automation
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Total rules</p>
          <p className="text-2xl font-bold tabular-nums">{automations.length}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-2xl font-bold tabular-nums text-success">{activeCount}</p>
        </div>
      </div>

      {/* Rules */}
      {isLoading ? (
        <SkeletonList count={3} />
      ) : automations.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automations yet"
          description="Create your first rule — e.g. notify you when CPU stays above 85%, or restart a service when it goes down."
          action={{ label: "New automation", onClick: () => setShowBuilder(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {automations.map((a) => (
            <AutomationCard key={a.id} auto={a} />
          ))}
        </div>
      )}

      <EventsFeed />
    </div>
  );
}
