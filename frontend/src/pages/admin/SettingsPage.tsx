import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  AlertTriangle, RefreshCw, Save, Server, Palette, Wand2,
  Rows3, Rows4, DownloadCloud, CheckCircle2, XCircle, Loader2, Terminal as TerminalIcon,
  Check, ChevronDown, Globe2, Clock, Cpu, Zap, CircuitBoard,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

// ─── Software update ────────────────────────────────────────────────────────

interface UpdateStatus {
  status: "idle" | "running" | "success" | "failed";
  log: string;
}

function SoftwareUpdateCard() {
  const { confirm, dialog } = useConfirm();
  const [polling, setPolling] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const didSucceedRef = useRef(false);
  // True only if "running" was seen in THIS session — prevents stale success from triggering reload on page load
  const wasRunningRef = useRef(false);

  const { data } = useQuery<UpdateStatus>({
    queryKey: ["software-update-status"],
    queryFn: async () => {
      const res = await apiClient.get("/system/update/status");
      return res.data as UpdateStatus;
    },
    refetchInterval: polling ? 2000 : false,
  });

  // Start/stop polling + trigger reload countdown on success
  useEffect(() => {
    if (data?.status === "running") {
      setPolling(true);
      wasRunningRef.current = true;
      didSucceedRef.current = false;
    } else if (data?.status === "success") {
      const t = setTimeout(() => setPolling(false), 2500);
      // Only count down if this session actually triggered an update
      if (!didSucceedRef.current && wasRunningRef.current) {
        didSucceedRef.current = true;
        setCountdown(5);
      }
      return () => clearTimeout(t);
    } else if (data?.status === "failed") {
      const t = setTimeout(() => setPolling(false), 2500);
      return () => clearTimeout(t);
    }
  }, [data?.status]);

  // Tick the countdown and reload when it hits 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      window.location.reload();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Auto-scroll the log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [data?.log]);

  const startMut = useMutation({
    mutationFn: () => apiClient.post("/system/update"),
    onSuccess: () => {
      setPolling(true);
      toast({
        title: "Update started",
        description: "Pulling the latest version and rebuilding…",
        variant: "success",
      } as { title: string; description: string; variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Could not start update",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const requestUpdate = async () => {
    const ok = await confirm({
      title: "Update SUDO-Pi to the latest version?",
      description:
        "Pulls the latest code, rebuilds the dashboard, and restarts services. The dashboard may be briefly unavailable — this page keeps following progress and reconnects automatically.",
      confirmLabel: "Update now",
      severity: "danger",
    });
    if (ok) startMut.mutate();
  };

  const status = data?.status ?? "idle";
  const running = status === "running";

  return (
    <Card>
      {dialog}
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <DownloadCloud className="w-3.5 h-3.5" /> Software Update
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              {running
                ? "Update in progress…"
                : status === "success" && countdown !== null
                ? `Update complete — reloading in ${countdown}s`
                : status === "success"
                ? "Up to date"
                : status === "failed"
                ? "Last update failed"
                : "Pull the latest version from GitHub"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rebuilds the app, installs new dependencies, migrates the database, and restarts services.
            </p>
          </div>

          {status === "success" && countdown !== null && (
            <Badge variant="info" className="gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Reloading in {countdown}s
            </Badge>
          )}
          {status === "success" && countdown === null && (
            <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Success</Badge>
          )}
          {status === "failed" && <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>}
          {running && <Badge variant="info" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Running</Badge>}

          <Button
            className="gap-1.5"
            loading={startMut.isPending || running}
            disabled={running || countdown !== null}
            onClick={requestUpdate}
          >
            <DownloadCloud className="w-4 h-4" />
            {running ? "Updating…" : countdown !== null ? `Reloading in ${countdown}s…` : "Check for updates"}
          </Button>
        </div>

        {(running || data?.log) && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <TerminalIcon className="w-3 h-3" /> Update log
            </p>
            <pre
              ref={logRef}
              className="max-h-56 overflow-y-auto rounded-lg bg-background border border-border/70 p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap"
            >
              {data?.log?.trim() || "Waiting for output…"}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const densities = [
  { value: "comfortable" as const, label: "Comfortable", icon: Rows3 },
  { value: "compact" as const,     label: "Compact",     icon: Rows4 },
];

const CATEGORY_LABELS = { dark: "Dark", light: "Light", special: "Special" } as const;

// ─── Pi System Configuration ──────────────────────────────────────────────────

interface SystemConfig {
  hostname: string;
  timezone: string;
  ntp_service: string;
  ntp_enabled: boolean;
}

function PiSystemCard() {
  const qc = useQueryClient();
  const [hostnameInput, setHostnameInput] = useState("");
  const [timezoneInput, setTimezoneInput] = useState("");

  const { data: config, isLoading: configLoading } = useQuery<SystemConfig>({
    queryKey: ["system-config"],
    queryFn: async () => {
      const { data } = await apiClient.get<SystemConfig>("/system/config");
      return data;
    },
    staleTime: 30_000,
  });

  const hostnameMut = useMutation({
    mutationFn: (hostname: string) => apiClient.post("/system/hostname", { hostname }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-config"] });
      setHostnameInput("");
      toast({ title: "Hostname updated", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (e) => toast({ title: "Failed", description: getApiError(e), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const timezoneMut = useMutation({
    mutationFn: (timezone: string) => apiClient.post("/system/timezone", { timezone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-config"] });
      setTimezoneInput("");
      toast({ title: "Timezone updated", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (e) => toast({ title: "Failed", description: getApiError(e), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const ntpMut = useMutation({
    mutationFn: (enabled: boolean) => apiClient.post("/system/ntp", { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system-config"] }),
    onError: (e) => toast({ title: "Failed", description: getApiError(e), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 justify-between">
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> Pi System Configuration
          </div>
          <button
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            onClick={() => qc.invalidateQueries({ queryKey: ["system-config"] })}
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", configLoading && "animate-spin")} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {configLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Hostname */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Server className="w-3 h-3" /> Hostname
                <span className="font-mono text-foreground/70 ml-1">{config?.hostname}</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={hostnameInput}
                  onChange={(e) => setHostnameInput(e.target.value)}
                  placeholder={config?.hostname ?? "raspberry"}
                  className="h-8 text-sm font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hostnameInput.trim() || hostnameMut.isPending}
                  loading={hostnameMut.isPending}
                  onClick={() => hostnameMut.mutate(hostnameInput.trim())}
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Apply
                </Button>
              </div>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Globe2 className="w-3 h-3" /> Timezone
                <span className="font-mono text-foreground/70 ml-1">{config?.timezone}</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={timezoneInput}
                  onChange={(e) => setTimezoneInput(e.target.value)}
                  placeholder={config?.timezone ?? "UTC"}
                  className="h-8 text-sm font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!timezoneInput.trim() || timezoneMut.isPending}
                  loading={timezoneMut.isPending}
                  onClick={() => timezoneMut.mutate(timezoneInput.trim())}
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Apply
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/60">e.g. Europe/London, America/New_York, Asia/Dubai</p>
            </div>

            {/* NTP */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/20">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">NTP Time Sync</p>
                  <p className="text-xs text-muted-foreground">
                    {config?.ntp_service ? `via ${config.ntp_service}` : "Network time synchronization"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={config?.ntp_enabled ? "success" : "muted"}>
                  {config?.ntp_enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  loading={ntpMut.isPending}
                  onClick={() => ntpMut.mutate(!config?.ntp_enabled)}
                >
                  {config?.ntp_enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


// ─── CPU Governor Card ────────────────────────────────────────────────────────

interface CpuFreqInfo {
  governor: string;
  available_governors: string[];
  cur_mhz: number | null;
  max_mhz: number | null;
  min_mhz: number | null;
  supported: boolean;
}

const GOVERNOR_META: Record<string, { label: string; desc: string; color: string }> = {
  performance:  { label: "Performance",  desc: "Maximum frequency, highest power draw",      color: "text-red-400" },
  ondemand:     { label: "On-demand",    desc: "Scales up dynamically based on CPU load",    color: "text-amber-400" },
  schedutil:    { label: "Schedutil",    desc: "Kernel scheduler-aware dynamic scaling",      color: "text-cyan-400" },
  conservative: { label: "Conservative", desc: "Gradual frequency scaling, power-efficient", color: "text-green-400" },
  powersave:    { label: "Powersave",    desc: "Minimum frequency, lowest power draw",       color: "text-blue-400" },
  userspace:    { label: "Userspace",    desc: "Manual frequency control",                   color: "text-violet-400" },
};

function CpuGovernorCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<CpuFreqInfo>({
    queryKey: ["cpu-freq"],
    queryFn: async () => {
      const { data } = await apiClient.get<CpuFreqInfo>("/system/cpu-freq");
      return data;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const setGovernorMut = useMutation({
    mutationFn: (governor: string) => apiClient.post("/system/cpu-governor", { governor }),
    onSuccess: (_, governor) => {
      toast({ title: `CPU governor set to "${governor}"`, variant: "success" } as { title: string; variant: "success" });
      qc.invalidateQueries({ queryKey: ["cpu-freq"] });
    },
    onError: (err) => toast({ title: "Failed to set governor", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-muted rounded animate-pulse" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data?.supported) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="w-4 h-4 text-primary" /> CPU Governor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">CPU frequency scaling is not available on this system.</p>
        </CardContent>
      </Card>
    );
  }

  const governors = data?.available_governors ?? [];
  const current = data?.governor ?? "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Cpu className="w-4 h-4 text-primary" /> CPU Governor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Current", value: data?.cur_mhz != null ? `${data.cur_mhz} MHz` : "—", icon: Zap },
            { label: "Max",     value: data?.max_mhz != null ? `${data.max_mhz} MHz` : "—", icon: Cpu },
            { label: "Min",     value: data?.min_mhz != null ? `${data.min_mhz} MHz` : "—", icon: Cpu },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-secondary/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-bold font-mono tabular-nums mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Governor buttons */}
        <div className="space-y-1.5">
          {governors.map((gov) => {
            const meta = GOVERNOR_META[gov] ?? { label: gov, desc: "", color: "text-foreground" };
            const isActive = gov === current;
            return (
              <button
                key={gov}
                onClick={() => !isActive && setGovernorMut.mutate(gov)}
                disabled={isActive || setGovernorMut.isPending}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors",
                  isActive
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30 hover:bg-secondary/30"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-primary" : "bg-muted-foreground/30")} />
                <div className="flex-1 min-w-0">
                  <span className={cn("text-sm font-medium", meta.color)}>{meta.label}</span>
                  {meta.desc && (
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{meta.desc}</p>
                  )}
                </div>
                {isActive && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Active</Badge>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pi Hardware Identity Card ────────────────────────────────────────────────

interface HardwareInfo {
  hardware?: string;
  revision?: string;
  serial?: string;
  model?: string;
  temperature?: string;
  gpu_mem_mb?: number;
  firmware?: string;
  arch?: string;
  cpu_count?: number;
  cpu_cores?: number;
  throttled?: boolean;
  throttle_flags?: Record<string, boolean>;
}

function PiHardwareCard() {
  const { data, isLoading } = useQuery<HardwareInfo>({
    queryKey: ["pi-hardware"],
    queryFn: async () => {
      const { data } = await apiClient.get<HardwareInfo>("/system/hardware");
      return data;
    },
    staleTime: 60_000,
  });

  const throttleWarnings = data?.throttle_flags
    ? Object.entries(data.throttle_flags).filter(([, v]) => v).map(([k]) =>
        k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      )
    : [];

  const rows: { label: string; value: string | undefined }[] = [
    { label: "Model",        value: data?.model },
    { label: "Hardware",     value: data?.hardware },
    { label: "Revision",     value: data?.revision },
    { label: "Serial",       value: data?.serial },
    { label: "Architecture", value: data?.arch },
    { label: "CPU Cores",    value: data?.cpu_count != null ? `${data.cpu_cores} cores (${data.cpu_count} threads)` : undefined },
    { label: "GPU Memory",   value: data?.gpu_mem_mb != null ? `${data.gpu_mem_mb} MB` : undefined },
    { label: "Temperature",  value: data?.temperature },
    { label: "Firmware",     value: data?.firmware ? data.firmware.slice(0, 80) : undefined },
  ].filter((r) => r.value);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CircuitBoard className="w-4 h-4 text-primary" /> Pi Hardware Identity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-4 bg-muted rounded animate-pulse" />)}
          </div>
        ) : (
          <>
            {throttleWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-400">Throttling detected</p>
                  <p className="text-xs text-amber-300/70 mt-0.5">{throttleWarnings.join(", ")}</p>
                </div>
              </div>
            )}
            <div className="divide-y divide-border/40">
              {rows.map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4 py-2 text-sm">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <span className="font-mono text-xs text-right truncate">{value}</span>
                </div>
              ))}
            </div>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Hardware info not available on this system.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { themeId, customThemes, density, setThemeId, setDensity } = useTheme();
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [expandCategories, setExpandCategories] = useState<Record<string, boolean>>({ dark: true, light: false, special: false });
  const { confirm: confirmAct, dialog: confirmDlg } = useConfirm();

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await apiClient.get("/settings");
      return data;
    },
  });

  const [hostname, setHostname] = useState("");
  const [timezone, setTimezone] = useState("");

  const hostnameM = useMutation({
    mutationFn: (h: string) => apiClient.put("/settings/hostname", { hostname: h }),
    onSuccess: () => {
      refetch();
      toast({ title: "Hostname updated", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Failed to update hostname", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const timezoneM = useMutation({
    mutationFn: (tz: string) => apiClient.put("/settings/timezone", { timezone: tz }),
    onSuccess: () => {
      refetch();
      toast({ title: "Timezone updated", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Failed to update timezone", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const sshM = useMutation({
    mutationFn: (enabled: boolean) => apiClient.put("/settings/ssh", { enabled }),
    onSuccess: (_, enabled) => {
      refetch();
      toast({ title: `SSH ${enabled ? "enabled" : "disabled"}`, variant: "success" } as { title: string; variant: "success" });
    },
  });

  const rebootM = useMutation({
    mutationFn: () => apiClient.post("/system/reboot"),
    onSuccess: () =>
      toast({
        title: "Rebooting…",
        description: "System will restart in a few seconds",
        variant: "warning",
      } as { title: string; description: string; variant: "warning" }),
  });

  const shutdownM = useMutation({
    mutationFn: () => apiClient.post("/system/shutdown"),
    onSuccess: () =>
      toast({
        title: "Shutting down…",
        description: "System will power off",
        variant: "warning",
      } as { title: string; description: string; variant: "warning" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {confirmDlg}
      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 justify-between">
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" /> Appearance
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => setShowCustomizer((v) => !v)}
            >
              <Wand2 className="w-3 h-3" />
              {showCustomizer ? "Close customizer" : "Customize theme"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ── Customizer panel ──────────────────────────────────────────── */}
          {showCustomizer && (
            <div className="rounded-xl border border-primary/25 bg-primary/4 p-4">
              <ThemeCustomizer onClose={() => setShowCustomizer(false)} />
            </div>
          )}

          {/* ── Theme grid grouped by category ──────────────────────────── */}
          {!showCustomizer && (
            <div className="space-y-5">
              {(["dark", "light", "special"] as const).map((cat) => {
                const group = [...THEMES, ...customThemes].filter((t) => t.category === cat);
                if (group.length === 0) return null;
                const expanded = expandCategories[cat] !== false;
                return (
                  <div key={cat}>
                    <button
                      className="flex items-center gap-2 w-full mb-3 group"
                      onClick={() => setExpandCategories((prev) => ({ ...prev, [cat]: !expanded }))}
                    >
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">{group.length}</span>
                      <ChevronDown className={cn(
                        "w-3 h-3 text-muted-foreground/40 ml-auto transition-transform",
                        !expanded && "-rotate-90",
                      )} />
                    </button>

                    {expanded && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {group.map((t) => {
                          const active = themeId === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setThemeId(t.id)}
                              className={cn(
                                "relative rounded-xl border p-3 text-left transition-all group",
                                active
                                  ? "border-primary/60 ring-2 ring-primary/20"
                                  : "border-border/60 hover:border-primary/30",
                              )}
                            >
                              {/* Color swatches */}
                              <div className="flex gap-1 mb-2">
                                <div className="w-full h-8 rounded-md overflow-hidden flex">
                                  <div className="w-2/3" style={{ background: t.preview.bg }} />
                                  <div className="w-1/3" style={{ background: t.preview.card }} />
                                </div>
                              </div>
                              <div className="flex gap-1 mb-2.5">
                                <div className="h-2 w-4 rounded-full" style={{ background: t.preview.primary }} />
                                <div className="h-2 flex-1 rounded-full" style={{ background: t.preview.text, opacity: 0.4 }} />
                              </div>

                              {/* Name */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px]">{t.emoji}</span>
                                <span className={cn(
                                  "text-[11px] font-semibold truncate",
                                  active ? "text-primary" : "text-foreground/80",
                                )}>
                                  {t.name}
                                </span>
                                {active && (
                                  <Check className="w-3 h-3 text-primary ml-auto shrink-0" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Density ──────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">Density</p>
            <div className="grid grid-cols-2 gap-3">
              {densities.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setDensity(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    density === value
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border hover:bg-secondary/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Software Update ────────────────────────────────────────────────── */}
      <SoftwareUpdateCard />

      {/* ── System ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Hostname
                  </label>
                  <Input
                    value={hostname !== "" ? hostname : (settings?.hostname ?? "")}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder={settings?.hostname ?? "raspberry"}
                  />
                </div>
                <Button
                  className="mt-5"
                  variant="outline"
                  onClick={() => hostnameM.mutate(hostname || settings?.hostname)}
                  loading={hostnameM.isPending}
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Apply
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Timezone
                  </label>
                  <Input
                    value={timezone || settings?.timezone || ""}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder={settings?.timezone}
                  />
                </div>
                <Button
                  className="mt-5"
                  variant="outline"
                  onClick={() => timezoneM.mutate(timezone || settings?.timezone)}
                  loading={timezoneM.isPending}
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Apply
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded bg-secondary/30">
                <div>
                  <p className="text-sm font-medium">SSH Server</p>
                  <p className="text-xs text-muted-foreground">Remote shell access</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={settings?.ssh?.is_active ? "success" : "muted"}>
                    {settings?.ssh?.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sshM.mutate(!settings?.ssh?.is_active)}
                    loading={sshM.isPending}
                  >
                    {settings?.ssh?.is_active ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Pi System Configuration ────────────────────────────────────────── */}
      <PiSystemCard />

      {/* ── CPU Governor ───────────────────────────────────────────────────── */}
      <CpuGovernorCard />

      {/* ── Pi Hardware Identity ───────────────────────────────────────────── */}
      <PiHardwareCard />

      {/* ── Danger Zone ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded border border-border">
            <div>
              <p className="text-sm font-medium">Reboot System</p>
              <p className="text-xs text-muted-foreground">
                Restart the Raspberry Pi
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-warning text-warning hover:bg-warning/10"
              onClick={async () => {
                const ok = await confirmAct({
                  title: "Reboot the system?",
                  description: "The Pi will restart. The dashboard will reconnect automatically in ~30 seconds.",
                  confirmLabel: "Reboot",
                  severity: "danger",
                });
                if (ok) rebootM.mutate();
              }}
              loading={rebootM.isPending}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reboot
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 rounded border border-border">
            <div>
              <p className="text-sm font-medium">Shutdown System</p>
              <p className="text-xs text-muted-foreground">
                Power off the Raspberry Pi
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const ok = await confirmAct({
                  title: "Shut down the system?",
                  description: "You will lose all remote access. A physical power cycle is required to turn it back on.",
                  confirmLabel: "Shut down",
                  severity: "critical",
                });
                if (ok) shutdownM.mutate();
              }}
              loading={shutdownM.isPending}
            >
              Shutdown
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Application info ───────────────────────────────────────────────── */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>Application</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {[
              ["Name", settings.app?.name],
              ["Version", settings.app?.version],
              ["Environment", settings.app?.env],
              ["AP Interface", settings.ap?.interface],
              ["AP IP", settings.ap?.ip],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
