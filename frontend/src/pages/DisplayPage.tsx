import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor, Power, PowerOff, RotateCcw, RefreshCw, Cpu,
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
  getGpuMemory: async (): Promise<{ gpu_memory_mb: number }> => {
    const { data } = await apiClient.get("/display/gpu-memory");
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

// ─── GPU Memory Values ────────────────────────────────────────────────────────

const GPU_MEMORY_OPTIONS = [16, 32, 64, 128, 256, 512];

const ROTATION_OPTIONS = [
  { value: "normal", label: "Normal (0°)" },
  { value: "left", label: "Left (90°)" },
  { value: "right", label: "Right (270°)" },
  { value: "inverted", label: "Inverted (180°)" },
];

// ─── Display Card ─────────────────────────────────────────────────────────────

function DisplayCard({
  display,
  resolutions,
  onSetResolution,
  onRotate,
}: {
  display: DisplayInfo;
  resolutions: string[];
  onSetResolution: (display: string, resolution: string, rate: string) => void;
  onRotate: (display: string, rotation: string) => void;
}) {
  const [resolution, setResolution] = useState(display.resolution ?? "");
  const [rotation, setRotation] = useState(display.rotation ?? "normal");
  const refreshRate = display.refresh_rate ?? "";

  return (
    <div className={cn("rounded-xl border p-5 space-y-4", display.connected ? "border-border" : "border-border/40 opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Monitor
            className={cn("w-5 h-5 shrink-0", display.connected ? "text-primary" : "text-muted-foreground")}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-sm">{display.name}</span>
              {display.primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
            </div>
            <Badge
              variant={display.connected ? "success" : "muted"}
              className="text-[10px] mt-0.5"
            >
              {display.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </div>
        {display.resolution && (
          <div className="text-right">
            <p className="text-sm font-mono font-medium">{display.resolution}</p>
            {display.refresh_rate && (
              <p className="text-xs text-muted-foreground">{display.refresh_rate} Hz</p>
            )}
          </div>
        )}
      </div>

      {display.connected && (
        <>
          {/* Resolution */}
          {resolutions.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Resolution</label>
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
                  size="sm"
                  variant="outline"
                  onClick={() => onSetResolution(display.name, resolution, refreshRate)}
                  disabled={!resolution}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* Rotation */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Rotation</label>
            <div className="flex gap-2">
              <Select value={rotation} onValueChange={setRotation}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROTATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRotate(display.name, rotation)}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Rotate
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisplayPage() {
  const queryClient = useQueryClient();
  const [newGpuMem, setNewGpuMem] = useState<number | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["display-status"],
    queryFn: displayApi.getStatus,
    refetchInterval: 15000,
  });

  const { data: resolutions } = useQuery({
    queryKey: ["display-resolutions"],
    queryFn: displayApi.getResolutions,
  });

  const { data: gpuMem } = useQuery({
    queryKey: ["gpu-memory"],
    queryFn: displayApi.getGpuMemory,
  });

  const setPower = useMutation({
    mutationFn: (on: boolean) => displayApi.setPower(on),
    onSuccess: (_, on) => {
      toast({ title: `Display turned ${on ? "on" : "off"}`, variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["display-status"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Failed", description: err?.response?.data?.detail ?? "Power control failed", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
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
        description: `Set to ${mb}MB. Reboot required to take effect.`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["gpu-memory"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Failed to set GPU memory", description: err?.response?.data?.detail, variant: "destructive" } as { title: string; description?: string; variant: "destructive" });
    },
  });

  const currentGpuMem = gpuMem?.gpu_memory_mb ?? null;
  const connectedDisplays = status?.displays?.filter((d) => d.connected) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* HDMI Power Banner */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
          status?.hdmi_power !== false
            ? "border-green-500/30 bg-green-500/10"
            : "border-border bg-card/60",
        )}
      >
        <div className="flex items-center gap-3">
          <Monitor
            className={cn("w-5 h-5 shrink-0", status?.hdmi_power !== false ? "text-green-400" : "text-muted-foreground")}
          />
          <div>
            <p className="text-sm font-medium">
              HDMI Output — {isLoading ? "…" : status?.hdmi_power !== false ? "On" : "Off"}
            </p>
            <p className="text-xs text-muted-foreground">
              {connectedDisplays.length} display{connectedDisplays.length !== 1 ? "s" : ""} connected
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setPower.mutate(true)}
            loading={setPower.isPending && setPower.variables === true}
          >
            <Power className="w-3.5 h-3.5 text-green-400" />
            On
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setPower.mutate(false)}
            loading={setPower.isPending && setPower.variables === false}
          >
            <PowerOff className="w-3.5 h-3.5 text-destructive" />
            Off
          </Button>
        </div>
      </div>

      {/* Display Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Displays</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["display-status"] });
              queryClient.invalidateQueries({ queryKey: ["display-resolutions"] });
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : !status?.displays?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <Monitor className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No display information available</p>
              <p className="text-xs mt-1">xrandr may not be installed or DISPLAY not set</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {status.displays.map((display) => (
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

      {/* GPU Memory */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            GPU Memory Split
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Allocates RAM to the GPU. More memory improves display performance but reduces RAM available for the OS.
            Changes require a reboot.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground mb-1">Current allocation</p>
              <p className="text-2xl font-bold">
                {currentGpuMem != null ? `${currentGpuMem} MB` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={newGpuMem?.toString() ?? ""}
                onValueChange={(v: string) => setNewGpuMem(parseInt(v))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {GPU_MEMORY_OPTIONS.map((mb) => (
                    <SelectItem key={mb} value={mb.toString()}>
                      {mb} MB
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => newGpuMem != null && setGpuMemory.mutate(newGpuMem)}
                disabled={newGpuMem == null || setGpuMemory.isPending}
                loading={setGpuMemory.isPending}
              >
                Apply
              </Button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mt-4">
            {GPU_MEMORY_OPTIONS.map((mb) => (
              <button
                key={mb}
                onClick={() => setNewGpuMem(mb)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium border transition-colors",
                  newGpuMem === mb
                    ? "border-primary bg-primary/10 text-primary"
                    : currentGpuMem === mb
                    ? "border-green-500/40 bg-green-500/10 text-green-400"
                    : "border-border text-muted-foreground hover:border-muted-foreground",
                )}
              >
                {mb} MB
                {currentGpuMem === mb && <span className="ml-1 text-[10px]">(current)</span>}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
