import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  AlertTriangle, RefreshCw, Save, Server, Sun, Moon, Monitor, Palette,
  Rows3, Rows4, DownloadCloud, CheckCircle2, XCircle, Loader2, Terminal as TerminalIcon,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

// ─── Software update ────────────────────────────────────────────────────────

interface UpdateStatus {
  status: "idle" | "running" | "success" | "failed";
  log: string;
}

function SoftwareUpdateCard() {
  const { confirm, dialog } = useConfirm();
  const [polling, setPolling] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const { data } = useQuery<UpdateStatus>({
    queryKey: ["software-update-status"],
    queryFn: async () => {
      const res = await apiClient.get("/system/update/status");
      return res.data as UpdateStatus;
    },
    // Poll quickly while an update is running, otherwise stay quiet
    refetchInterval: polling ? 2000 : false,
  });

  // Start/stop polling based on the reported status
  useEffect(() => {
    if (data?.status === "running") setPolling(true);
    else if (data?.status === "success" || data?.status === "failed") {
      // one more tick, then stop
      const t = setTimeout(() => setPolling(false), 2500);
      return () => clearTimeout(t);
    }
  }, [data?.status]);

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
              {running ? "Update in progress…"
                : status === "success" ? "Up to date"
                : status === "failed" ? "Last update failed"
                : "Pull the latest version from GitHub"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rebuilds the app, installs new dependencies, migrates the database, and restarts services.
            </p>
          </div>
          {status === "success" && <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Success</Badge>}
          {status === "failed" && <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>}
          {running && <Badge variant="info" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Running</Badge>}
          <Button
            className="gap-1.5"
            loading={startMut.isPending || running}
            disabled={running}
            onClick={requestUpdate}
          >
            <DownloadCloud className="w-4 h-4" />
            {running ? "Updating…" : "Check for updates"}
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

const themes = [
  { value: "dark" as const,   label: "Dark",   icon: Moon },
  { value: "light" as const,  label: "Light",  icon: Sun },
  { value: "system" as const, label: "System", icon: Monitor },
];

const densities = [
  { value: "comfortable" as const, label: "Comfortable", icon: Rows3 },
  { value: "compact" as const,     label: "Compact",     icon: Rows4 },
];

const accents = [
  { value: "cyan" as const,   hex: "#22d3ee" },
  { value: "purple" as const, hex: "#a78bfa" },
  { value: "green" as const,  hex: "#4ade80" },
  { value: "orange" as const, hex: "#fb923c" },
  { value: "blue" as const,   hex: "#60a5fa" },
  { value: "rose" as const,   hex: "#fb7185" },
];

export default function SettingsPage() {
  const { theme, accentColor, density, setTheme, setAccentColor, setDensity } = useTheme();
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
          <CardTitle className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Theme selector */}
          <div>
            <p className="text-sm text-muted-foreground mb-3">Theme</p>
            <div className="grid grid-cols-3 gap-3">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    theme === value
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Accent color picker */}
          <div>
            <p className="text-sm text-muted-foreground mb-3">Accent color</p>
            <div className="flex items-center gap-3">
              {accents.map(({ value, hex }) => (
                <button
                  key={value}
                  onClick={() => setAccentColor(value)}
                  title={value.charAt(0).toUpperCase() + value.slice(1)}
                  className={cn(
                    "w-6 h-6 rounded-full transition-all",
                    accentColor === value ? "scale-110" : "hover:scale-110"
                  )}
                  style={{
                    backgroundColor: hex,
                    outline: accentColor === value
                      ? `2px solid ${hex}`
                      : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Density selector */}
          <div>
            <p className="text-sm text-muted-foreground mb-3">Density</p>
            <div className="grid grid-cols-2 gap-3">
              {densities.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setDensity(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    density === value
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
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
                    defaultValue={settings?.hostname}
                    value={hostname || settings?.hostname || ""}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder={settings?.hostname}
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
