import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  RefreshCw,
  Clock,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

interface CronJob {
  id: string;
  schedule: string;
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
  user: string;
  command: string;
  enabled: boolean;
  source: string;
  comment: string;
  read_only: boolean;
}

interface JobForm {
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
  user: string;
  command: string;
  comment: string;
}

const EMPTY_FORM: JobForm = {
  minute: "*",
  hour: "*",
  dom: "*",
  month: "*",
  dow: "*",
  user: "root",
  command: "",
  comment: "",
};

const SCHEDULE_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 10 minutes", value: "*/10 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every day at noon", value: "0 12 * * *" },
  { label: "Every week (Sunday midnight)", value: "0 0 * * 0" },
  { label: "Every month (1st at midnight)", value: "0 0 1 * *" },
  { label: "Custom", value: "custom" },
];

function humanizeSchedule(schedule: string): string {
  const [minute, hour, dom, month, dow] = schedule.trim().split(/\s+/);
  if (!minute) return schedule;

  if (schedule === "* * * * *") return "Every minute";
  if (minute.startsWith("*/") && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const n = minute.slice(2);
    return `Every ${n} minute${n === "1" ? "" : "s"}`;
  }
  if (minute === "0" && hour.startsWith("*/") && dom === "*" && month === "*" && dow === "*") {
    const n = hour.slice(2);
    return `Every ${n} hour${n === "1" ? "" : "s"}`;
  }
  if (minute === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return "Every hour (at :00)";
  }
  if (minute === "0" && dom === "*" && month === "*" && dow === "*") {
    return `Daily at ${hour.padStart(2, "0")}:00`;
  }
  if (minute === "0" && hour === "0" && dom === "*" && month === "*") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const d = parseInt(dow);
    if (!isNaN(d) && d >= 0 && d <= 6) return `Weekly on ${days[d]}`;
    if (dow === "*") return "Daily at midnight";
  }
  if (minute === "0" && hour === "0" && dow === "*" && month === "*") {
    if (!isNaN(parseInt(dom))) return `Monthly on the ${dom}`;
  }
  return schedule;
}

function schedulePresetValue(form: JobForm): string {
  const s = `${form.minute} ${form.hour} ${form.dom} ${form.month} ${form.dow}`;
  const match = SCHEDULE_PRESETS.find((p) => p.value === s);
  return match ? match.value : "custom";
}

function applyPreset(preset: string, setForm: (f: JobForm) => void, current: JobForm) {
  if (preset === "custom") return;
  const parts = preset.split(" ");
  if (parts.length === 5) {
    setForm({
      ...current,
      minute: parts[0],
      hour: parts[1],
      dom: parts[2],
      month: parts[3],
      dow: parts[4],
    });
  }
}

function SourceBadge({ source }: { source: string }) {
  if (source === "managed") {
    return <Badge variant="default" className="text-[10px]">Managed</Badge>;
  }
  const name = source.startsWith("system:") ? source.slice(7) : source;
  return (
    <Badge variant="secondary" className="text-[10px] max-w-[120px] truncate" title={name}>
      System: {name}
    </Badge>
  );
}

export default function CronPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [form, setForm] = useState<JobForm>(EMPTY_FORM);
  const [runOutput, setRunOutput] = useState<{ jobId: string; output: string; success: boolean } | null>(null);

  const { data: jobs = [], isLoading, refetch } = useQuery<CronJob[]>({
    queryKey: ["cron-jobs"],
    queryFn: async () => {
      const { data } = await apiClient.get("/cron/jobs");
      return data;
    },
    refetchInterval: 30_000,
  });

  const openAdd = () => {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (job: CronJob) => {
    setEditingJob(job);
    setForm({
      minute: job.minute,
      hour: job.hour,
      dom: job.dom,
      month: job.month,
      dow: job.dow,
      user: job.user,
      command: job.command,
      comment: job.comment,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (f: JobForm) => {
      if (editingJob) {
        const { data } = await apiClient.put(`/cron/jobs/${encodeURIComponent(editingJob.id)}`, f);
        return data;
      } else {
        const { data } = await apiClient.post("/cron/jobs", f);
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cron-jobs"] });
      setModalOpen(false);
      toast({ title: editingJob ? "Job updated" : "Job added", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to save job";
      toast({ title: msg, variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cron/jobs/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cron-jobs"] });
      toast({ title: "Job deleted", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Failed to delete job", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/cron/jobs/${encodeURIComponent(id)}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cron-jobs"] }),
    onError: () => toast({ title: "Failed to toggle job", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: async (job: CronJob) => {
      const { data } = await apiClient.post(`/cron/jobs/${encodeURIComponent(job.id)}/run`);
      return { jobId: job.id, data };
    },
    onSuccess: ({ jobId, data }) => {
      const output = [
        data.stdout ? `stdout:\n${data.stdout}` : "",
        data.stderr ? `stderr:\n${data.stderr}` : "",
        `exit code: ${data.returncode}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      setRunOutput({ jobId, output, success: data.success });
    },
    onError: () => toast({ title: "Failed to run job", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.command.trim()) {
      toast({ title: "Command is required", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    saveMutation.mutate(form);
  };

  const setField = useCallback(
    (key: keyof JobForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
    []
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Cron Job Manager</h1>
          <p className="text-sm text-muted-foreground">
            Manage scheduled tasks via <code className="text-xs">/etc/cron.d/sudo-pi-managed</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} loading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Job
          </Button>
        </div>
      </div>

      {runOutput && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                Run output
                <Badge variant={runOutput.success ? "success" : "destructive"} className="text-[10px]">
                  {runOutput.success ? "Success" : "Failed"}
                </Badge>
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setRunOutput(null)}>
                ×
              </Button>
            </div>
            <pre className="text-xs bg-black/80 text-green-400 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
              {runOutput.output || "(no output)"}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="w-12 px-3 py-2 text-left text-muted-foreground font-medium text-xs">
                    On
                  </th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium text-xs">
                    Schedule
                  </th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium text-xs hidden sm:table-cell">
                    User
                  </th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium text-xs">
                    Command
                  </th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium text-xs hidden md:table-cell">
                    Comment
                  </th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium text-xs">
                    Source
                  </th>
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-4 bg-muted rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : jobs.map((job) => (
                      <tr
                        key={job.id}
                        className={`border-b border-border/50 hover:bg-secondary/20 ${!job.enabled ? "opacity-50" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <Switch
                            checked={job.enabled}
                            disabled={job.read_only || toggleMutation.isPending}
                            onCheckedChange={() => toggleMutation.mutate(job.id)}
                            aria-label="Toggle job"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-xs">
                              {humanizeSchedule(job.schedule)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {job.schedule}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <span className="text-xs font-mono text-muted-foreground">{job.user}</span>
                        </td>
                        <td className="px-3 py-2 max-w-xs">
                          <span
                            className="text-xs font-mono truncate block"
                            title={job.command}
                          >
                            {job.command}
                          </span>
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell max-w-[140px]">
                          <span className="text-xs text-muted-foreground truncate block" title={job.comment}>
                            {job.comment}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <SourceBadge source={job.source} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Run now"
                              onClick={() => runMutation.mutate(job)}
                              loading={
                                runMutation.isPending &&
                                (runMutation.variables as CronJob)?.id === job.id
                              }
                            >
                              <Play className="w-3.5 h-3.5" />
                            </Button>
                            {!job.read_only && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="Edit"
                                  onClick={() => openEdit(job)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="Delete"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    confirm("Delete this cron job?") &&
                                    deleteMutation.mutate(job.id)
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                {!isLoading && jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No cron jobs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit Cron Job" : "Add Cron Job"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick preset */}
            <div className="space-y-1">
              <Label>Quick schedule</Label>
              <Select
                value={schedulePresetValue(form)}
                onValueChange={(v) => applyPreset(v, setForm, form)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a preset…" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cron fields */}
            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  ["minute", "Minute"],
                  ["hour", "Hour"],
                  ["dom", "Day/Mo"],
                  ["month", "Month"],
                  ["dow", "Day/Wk"],
                ] as [keyof JobForm, string][]
              ).map(([key, lbl]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{lbl}</Label>
                  <Input
                    value={form[key] as string}
                    onChange={setField(key)}
                    className="font-mono text-xs h-8"
                    placeholder="*"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Current: <code className="font-mono">{`${form.minute} ${form.hour} ${form.dom} ${form.month} ${form.dow}`}</code>{" "}
              — {humanizeSchedule(`${form.minute} ${form.hour} ${form.dom} ${form.month} ${form.dow}`)}
            </p>

            {/* User */}
            <div className="space-y-1">
              <Label>Run as user</Label>
              <Input
                value={form.user}
                onChange={setField("user")}
                placeholder="root"
                className="font-mono text-sm"
              />
            </div>

            {/* Command */}
            <div className="space-y-1">
              <Label>Command</Label>
              <Input
                value={form.command}
                onChange={setField("command")}
                placeholder="/usr/local/bin/my-script.sh"
                className="font-mono text-sm"
              />
            </div>

            {/* Comment */}
            <div className="space-y-1">
              <Label>Comment (optional)</Label>
              <Input
                value={form.comment}
                onChange={setField("comment")}
                placeholder="What does this job do?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saveMutation.isPending}>
              {editingJob ? "Update" : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
