import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor, Power, PowerOff, RotateCcw, RefreshCw, Cpu,
  MonitorOff, Tv2, Info, ScanLine,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DisplayInfo {
  name: string;
  connected: boolean;
  resolution: string | null;
  refresh_rate: string | null;
  rotation: string | null;
  primary: boolean;
}

interface DisplayStatus {
  displays: DisplayInfo[];
  hdmi_power: boolean;
  gpu_memory_mb: number | null;
  tvservice_mode: string | null;
  hdmi_connected: boolean;
  xrandr_available: boolean;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const displayApi = {
  getStatus: async (): Promise<DisplayStatus> => {
    const { data } = await apiClient.get("/display/status");
    return data;
  },
  getResolutions: async (): Promise<string[]> => {
    const { data } = await apiClient.get("/display/resolutions");
    return data;
  },
  setPower: async (on: boolean): Promise<void> => {
    await apiClient.post("/display/power", { on });
  },
  setResolution: async (display: string, resolution: string, refresh_rate: string): Promise<void> => {
    await apiClient.post("/display/resolution", { display, resolution, refresh_rate });
  },
  rotate: async (display: string, rotation: string): Promise<void> => {
    await apiClient.post("/display/rotate", { display, rotation });
  },
  setGpuMemory: async (mb: number): Promise<void> => {
    await apiClient.post("/display/gpu-memory", { mb });
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GPU_MEMORY_OPTIONS = [16, 32, 64, 128, 256, 512];

const ROTATION_OPTIONS = [
  { value: "normal",   label: "Normal (0°)" },
  { value: "left",     label: "Left (90°)" },
  { value: "right",    label: "Right (270°)" },
  { value: "inverted", label: "Inverted (180°)" },
];

// ─── Display Card ─────────────────────────────────────────────────────────────

function DisplayCard({
  display, resolutions, onSetResolution, onRotate,
}: {
  display: DisplayInfo;
  resolutions: string[];
  onSetResolution: (display: string, resolution: string, rate: string) => void;
  onRotate: (display: string, rotation: string) => void;
}) {
  const [resolution, setResolution] = useState(display.resolution ?? "");
  const [rotation,   setRotation]   = useState(display.rotation ?? "normal");
  const refreshRate = display.refresh_rate ?? "";

  if (!display.connected) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/20 p-4 flex items-center gap-4">
        <div className="rounded-xl bg-muted/30 p-3">
          <MonitorOff className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-medium text-sm text-foreground">{display.name}</span>
            <Badge variant="secondary" className="text-[10px]">No Signal</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Output port available — connect a display cable to enable controls
          </p>
        </div>
        <div className="shrink-0 w-2 h-2 rounded-full bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-500/10 p-2">
            <Monitor className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-medium text-sm">{display.name}</span>
              {display.primary && (
                <Badge variant="secondary" className="text-[10px]">Primary</Badge>
              )}
              <Badge variant="success" className="text-[10px]">Connected</Badge>
            </div>
            {display.resolution && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {display.resolution}
                {display.refresh_rate && ` @ ${display.refresh_rate} Hz`}
                {display.rotation && display.rotation !== "normal" && ` · ${display.rotation}`}
              </p>
            )}
          </div>
        </div>
        <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
      </div>

      {/* Resolution Control */}
      {resolutions.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Change Resolution
          </label>
          <div className="flex gap-2">
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                {resolutions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm" variant="outline"
              onClick={() => onSetResolution(display.name, resolution, refreshRate)}
              disabled={!resolution}
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Rotation Control */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Rotation
        </label>
        <div className="flex gap-2">
          <Select value={rotation} onValueChange={setRotation}>
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROTATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => onRotate(display.name, rotation)}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Rotate
          </Button>
        </div>
      </div>

      {/* Quick rotation presets */}
      <div className="flex gap-2 flex-wrap">
        {ROTATION_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => { setRotation(o.value); onRotate(display.name, o.value); }}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs border transition-colors",
              rotation === o.value
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground",
            )}
          >
            {o.label.split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── GPU Memory Card ──────────────────────────────────────────────────────────

function GpuMemoryCard({
  currentMb, onSet, isPending,
}: {
  currentMb: number | null;
  onSet: (mb: number) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const activeMb = selected ?? currentMb;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          GPU Memory Split
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Allocates shared RAM to the GPU. Higher values improve display performance but reduce OS memory.
          Changes require a reboot to take effect.
        </p>

        {/* Current value display */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card/40 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Current allocation</p>
            <p className="text-2xl font-bold mt-0.5">
              {currentMb != null ? `${currentMb} MB` : "Unknown"}
            </p>
          </div>
          {selected != null && selected !== currentMb && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-bold text-primary">{selected} MB</p>
            </div>
          )}
        </div>

        {/* Preset buttons */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Select allocation</p>
          <div className="flex gap-2 flex-wrap">
            {GPU_MEMORY_OPTIONS.map((mb) => (
              <button
                key={mb}
                onClick={() => setSelected(mb)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                  activeMb === mb && currentMb !== mb
                    ? "border-primary bg-primary/15 text-primary"
                    : currentMb === mb
                    ? "border-green-500/50 bg-green-500/10 text-green-400"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                {mb} MB
                {currentMb === mb && (
                  <span className="ml-1 text-[9px] opacity-70">(active)</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* GPU usage visual */}
        {currentMb != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>GPU memory</span>
              <span>{currentMb} MB of 4096 MB total</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((currentMb / 512) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <Select
            value={selected?.toString() ?? ""}
            onValueChange={(v) => setSelected(parseInt(v))}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {GPU_MEMORY_OPTIONS.map((mb) => (
                <SelectItem key={mb} value={mb.toString()}>{mb} MB</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => selected != null && onSet(selected)}
            disabled={selected == null || selected === currentMb || isPending}
            loading={isPending}
          >
            Apply & Reboot Required
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisplayPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["display-status"],
    queryFn: displayApi.getStatus,
    refetchInterval: 15000,
  });

  const { data: resolutions } = useQuery({
    queryKey: ["display-resolutions"],
    queryFn: displayApi.getResolutions,
  });

  const setPower = useMutation({
    mutationFn: (on: boolean) => displayApi.setPower(on),
    onSuccess: (_, on) => {
      toast({
        title: `Display turned ${on ? "on" : "off"}`,
        variant: "success",
      } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["display-status"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Failed",
        description: err?.response?.data?.detail ?? "Power control failed",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
  });

  const setResolution = useMutation({
    mutationFn: ({ display, resolution, refresh_rate }: { display: string; resolution: string; refresh_rate: string }) =>
      displayApi.setResolution(display, resolution, refresh_rate),
    onSuccess: (_, { display, resolution }) => {
      toast({ title: "Resolution changed", description: `${display}: ${resolution}`, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["display-status"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Failed to set resolution", description: err?.response?.data?.detail, variant: "destructive" } as { title: string; description?: string; variant: "destructive" });
    },
  });

  const rotateDisplay = useMutation({
    mutationFn: ({ display, rotation }: { display: string; rotation: string }) =>
      displayApi.rotate(display, rotation),
    onSuccess: (_, { display, rotation }) => {
      toast({ title: "Display rotated", description: `${display}: ${rotation}`, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["display-status"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Failed to rotate", description: err?.response?.data?.detail, variant: "destructive" } as { title: string; description?: string; variant: "destructive" });
    },
  });

  const setGpuMemory = useMutation({
    mutationFn: (mb: number) => displayApi.setGpuMemory(mb),
    onSuccess: (_, mb) => {
      toast({
        title: "GPU memory updated",
        description: `Set to ${mb}MB. Reboot required.`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["display-status"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Failed to set GPU memory", description: err?.response?.data?.detail, variant: "destructive" } as { title: string; description?: string; variant: "destructive" });
    },
  });

  const connectedDisplays     = status?.displays?.filter((d) => d.connected) ?? [];
  const disconnectedDisplays  = status?.displays?.filter((d) => !d.connected) ?? [];
  const hdmiOn                = status?.hdmi_power !== false;

  return (
    <div className="p-6 space-y-5">
      {/* ── HDMI Power Banner ──────────────────────────────────── */}
      <div className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        hdmiOn ? "border-green-500/30 bg-green-500/8" : "border-border bg-card/60",
      )}>
        <div className="flex items-center gap-3">
          <Tv2 className={cn("w-5 h-5 shrink-0", hdmiOn ? "text-green-400" : "text-muted-foreground")} />
          <div>
            <p className="text-sm font-semibold">
              HDMI Output —{" "}
              <span className={hdmiOn ? "text-green-400" : "text-muted-foreground"}>
                {isLoading ? "…" : hdmiOn ? "On" : "Off"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {connectedDisplays.length
                ? `${connectedDisplays.length} display${connectedDisplays.length !== 1 ? "s" : ""} active`
                : "No active displays detected"}
              {status?.tvservice_mode && (
                <span className="ml-2 font-mono text-[10px] opacity-70">{status.tvservice_mode}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            className={cn("gap-1.5", hdmiOn && "border-green-500/40 text-green-400 bg-green-500/5")}
            onClick={() => setPower.mutate(true)}
            loading={setPower.isPending && setPower.variables === true}
          >
            <Power className="w-3.5 h-3.5" />
            On
          </Button>
          <Button
            size="sm" variant="outline"
            className="gap-1.5"
            onClick={() => setPower.mutate(false)}
            loading={setPower.isPending && setPower.variables === false}
          >
            <PowerOff className="w-3.5 h-3.5 text-destructive" />
            Off
          </Button>
          <Button
            size="icon-sm" variant="ghost"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["display-status"] });
              queryClient.invalidateQueries({ queryKey: ["display-resolutions"] });
            }}
            title="Refresh display info"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── System info chips ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs">
        <div className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1",
          status?.hdmi_connected ? "border-green-500/30 text-green-400" : "border-border text-muted-foreground",
        )}>
          <div className={cn("w-1.5 h-1.5 rounded-full", status?.hdmi_connected ? "bg-green-400" : "bg-muted-foreground")} />
          HDMI Cable: {status?.hdmi_connected ? "Detected" : "Not detected"}
        </div>
        <div className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1",
          status?.xrandr_available ? "border-blue-500/30 text-blue-400" : "border-border text-muted-foreground",
        )}>
          <ScanLine className="w-3 h-3" />
          xrandr: {status?.xrandr_available ? "Available" : "Unavailable"}
        </div>
        {status?.gpu_memory_mb != null && (
          <div className="flex items-center gap-1.5 rounded-full border border-purple-500/30 text-purple-400 px-3 py-1">
            <Cpu className="w-3 h-3" />
            GPU: {status.gpu_memory_mb} MB
          </div>
        )}
      </div>

      {/* ── Connected Displays ─────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5" />
          Active Displays
          {connectedDisplays.length > 0 && (
            <Badge variant="success" className="text-[10px]">{connectedDisplays.length}</Badge>
          )}
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : connectedDisplays.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/20 p-6 flex flex-col items-center text-center gap-2 text-muted-foreground">
            <MonitorOff className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No active displays</p>
            <p className="text-xs max-w-xs">
              {status?.xrandr_available
                ? "xrandr is available but no display is currently connected and active."
                : "xrandr is not available. Connect a monitor and ensure DISPLAY=:0 is accessible."}
            </p>
            {status?.hdmi_connected && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-1.5 mt-1">
                <Info className="w-3 h-3 shrink-0" />
                HDMI cable detected — try toggling HDMI power above
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {connectedDisplays.map((display) => (
              <DisplayCard
                key={display.name}
                display={display}
                resolutions={resolutions ?? []}
                onSetResolution={(d, r, rate) =>
                  setResolution.mutate({ display: d, resolution: r, refresh_rate: rate })
                }
                onRotate={(d, rot) => rotateDisplay.mutate({ display: d, rotation: rot })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Available (Disconnected) Ports ─────────────────────── */}
      {disconnectedDisplays.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <MonitorOff className="w-3.5 h-3.5" />
            Available Ports ({disconnectedDisplays.length})
          </h2>
          <div className="space-y-2">
            {disconnectedDisplays.map((display) => (
              <DisplayCard
                key={display.name}
                display={display}
                resolutions={resolutions ?? []}
                onSetResolution={(d, r, rate) =>
                  setResolution.mutate({ display: d, resolution: r, refresh_rate: rate })
                }
                onRotate={(d, rot) => rotateDisplay.mutate({ display: d, rotation: rot })}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── tvservice raw info ─────────────────────────────────── */}
      {status?.tvservice_mode && (
        <div className="rounded-xl border border-border/50 bg-card/20 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">tvservice Status</p>
            <p className="text-xs font-mono text-foreground">{status.tvservice_mode}</p>
          </div>
        </div>
      )}

      {/* ── GPU Memory ─────────────────────────────────────────── */}
      <GpuMemoryCard
        currentMb={status?.gpu_memory_mb ?? null}
        onSet={(mb) => setGpuMemory.mutate(mb)}
        isPending={setGpuMemory.isPending}
      />
    </div>
  );
}
