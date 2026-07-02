import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play, Square, RefreshCw, Trash2, Terminal,
  X, Cpu, MemoryStick, AlertCircle, Box, Layers,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/use-toast";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string;
}

interface ContainerResources {
  cpu_cores: number;
  memory_limit_mb: number;
  memory_limit_bytes: number;
}

interface LogLine {
  id: number;
  line: string;
  stream: "stdout" | "stderr";
  ts: string;
}

const MAX_LOG_LINES = 500;

function createWsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1${path}`;
}

// ─── Live Logs Panel ─────────────────────────────────────────────────────────

function LiveLogsPanel({
  containerId,
  containerName,
  onClose,
}: {
  containerId: string;
  containerName: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineId = useRef(0);

  const connect = useCallback(() => {
    setStatus("connecting");
    setLines([]);
    const ws = new WebSocket(createWsUrl(`/docker/containers/${containerId}/logs/stream`));
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "log") {
          setLines((prev) => {
            const next = [
              ...prev,
              {
                id: lineId.current++,
                line: msg.line as string,
                stream: (msg.stream ?? "stdout") as "stdout" | "stderr",
                ts: msg.ts as string,
              },
            ];
            return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
          });
          setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }, 10);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => setStatus("disconnected");
    ws.onclose = () => setStatus("disconnected");
  }, [containerId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const stop = () => {
    wsRef.current?.close();
    setStatus("disconnected");
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-[#0a0f1e] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-mono text-foreground">{containerName}</span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              status === "connected"
                ? "bg-green-500/20 text-green-400"
                : status === "connecting"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            {status === "connecting" ? "Connecting..." : status === "connected" ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {status === "connected" ? (
            <Button variant="ghost" size="icon-sm" onClick={stop} className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Stop">
              <Square className="w-3 h-3" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={connect} className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Reconnect">
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="h-6 w-6 text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto font-mono text-xs leading-relaxed p-3 space-y-0.5"
        style={{ height: "280px" }}
      >
        {lines.length === 0 && status === "connecting" && (
          <span className="text-muted-foreground animate-pulse">Connecting to log stream...</span>
        )}
        {lines.length === 0 && status === "connected" && (
          <span className="text-muted-foreground italic">No output yet.</span>
        )}
        {lines.length === 0 && status === "disconnected" && (
          <span className="text-red-400">Disconnected. Click reconnect to try again.</span>
        )}
        {lines.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0 tabular-nums select-none" style={{ fontSize: "10px" }}>
              {l.ts.slice(11, 19)}
            </span>
            <span
              className={cn(
                l.stream === "stderr" ? "text-orange-400" : "text-[#e2e8f0]"
              )}
            >
              {l.line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Resource Limits Panel ────────────────────────────────────────────────────

function ResourcesPanel({ containerId }: { containerId: string }) {
  const queryClient = useQueryClient();
  const [cpuCores, setCpuCores] = useState(0);
  const [memoryMb, setMemoryMb] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const { data: resources, isLoading } = useQuery<ContainerResources>({
    queryKey: ["container-resources", containerId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/docker/containers/${containerId}/resources`);
      return data;
    },
    enabled: !!containerId,
  });

  useEffect(() => {
    if (resources && !loaded) {
      setCpuCores(resources.cpu_cores);
      setMemoryMb(resources.memory_limit_mb);
      setLoaded(true);
    }
  }, [resources, loaded]);

  // Reset when container changes
  useEffect(() => {
    setLoaded(false);
  }, [containerId]);

  const applyMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/docker/containers/${containerId}/resources`, {
        cpu_cores: cpuCores,
        memory_mb: Math.round(memoryMb),
      }),
    onSuccess: () => {
      toast({ title: "Resource limits applied", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["container-resources", containerId] });
    },
    onError: (err) =>
      toast({ title: "Failed to apply limits", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
        <div className="h-4 bg-muted rounded animate-pulse" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
      </div>
    );
  }

  return (
    <div className="space-y-5 py-1">
      <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-md px-3 py-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        Changes take effect immediately without restarting the container.
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <span>CPU Limit</span>
          </div>
          <span className="text-sm font-mono font-medium">
            {cpuCores === 0 ? "Unlimited" : `${cpuCores} core${cpuCores !== 1 ? "s" : ""}`}
          </span>
        </div>
        <Slider
          value={[cpuCores]}
          onValueChange={([v]) => setCpuCores(v)}
          min={0}
          max={4}
          step={0.25}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Unlimited</span>
          <span>4 cores</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm">
            <MemoryStick className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Memory Limit</span>
          </div>
          <span className="text-sm font-mono font-medium">
            {memoryMb === 0 ? "Unlimited" : `${Math.round(memoryMb)} MB`}
          </span>
        </div>
        <Slider
          value={[memoryMb]}
          onValueChange={([v]) => setMemoryMb(v)}
          min={0}
          max={2048}
          step={64}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Unlimited</span>
          <span>2048 MB</span>
        </div>
      </div>

      <Button
        size="sm"
        onClick={() => applyMutation.mutate()}
        disabled={applyMutation.isPending}
        className="w-full"
      >
        {applyMutation.isPending ? "Applying..." : "Apply Limits"}
      </Button>
    </div>
  );
}

// ─── Container Row ────────────────────────────────────────────────────────────

function ContainerRow({ c }: { c: Container }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<"logs" | "resources" | null>(null);

  const containerAction = useMutation({
    mutationFn: ({ action }: { action: string }) =>
      apiClient.post(`/docker/containers/${c.id}/${action}`),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["docker-containers"] });
      toast({ title: `Container ${action}ed`, variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const togglePanel = (panel: "logs" | "resources") => {
    if (!expanded) setExpanded(true);
    setActivePanel((prev) => {
      if (prev === panel) {
        return null;
      }
      return panel;
    });
  };

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-secondary/20">
        <td className="px-4 py-2 font-mono font-medium">{c.name.replace("/", "")}</td>
        <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[120px]">{c.image}</td>
        <td className="px-4 py-2 text-center">
          <Badge
            variant={c.state === "running" ? "success" : c.state === "exited" ? "muted" : "warning"}
            className="text-[10px]"
          >
            {c.state}
          </Badge>
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell font-mono">{c.ports}</td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1">
            {c.state !== "running" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-success hover:text-success hover:bg-success/10 h-7 w-7"
                onClick={() => containerAction.mutate({ action: "start" })}
              >
                <Play className="w-3 h-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-warning hover:text-warning hover:bg-warning/10 h-7 w-7"
                onClick={() => containerAction.mutate({ action: "stop" })}
              >
                <Square className="w-3 h-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => containerAction.mutate({ action: "restart" })}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("h-7 w-7", activePanel === "logs" && "text-primary bg-primary/10")}
              title="Live Logs"
              onClick={() => togglePanel("logs")}
            >
              <Terminal className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("h-7 w-7", activePanel === "resources" && "text-primary bg-primary/10")}
              title="Resource Limits"
              onClick={() => togglePanel("resources")}
            >
              <Cpu className="w-3 h-3" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && activePanel && (
        <tr className="border-b border-border/50 bg-secondary/5">
          <td colSpan={5} className="px-4 py-3">
            {activePanel === "logs" && (
              <LiveLogsPanel
                containerId={c.id}
                containerName={c.name.replace("/", "")}
                onClose={() => { setActivePanel(null); setExpanded(false); }}
              />
            )}
            {activePanel === "resources" && (
              <div className="max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Resource Limits
                  </h4>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6"
                    onClick={() => { setActivePanel(null); setExpanded(false); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <ResourcesPanel containerId={c.id} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DockerPage() {
  const navigate = useNavigate();
  const { data: containers, isLoading: loadingContainers, refetch: refetchContainers } = useQuery({
    queryKey: ["docker-containers"],
    queryFn: async () => {
      const { data } = await apiClient.get("/docker/containers");
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 10000,
  });

  const { data: images, isLoading: loadingImages, refetch: refetchImages } = useQuery({
    queryKey: ["docker-images"],
    queryFn: async () => {
      const { data } = await apiClient.get("/docker/images");
      return Array.isArray(data) ? data : [];
    },
  });

  return (
    <div className="p-6 space-y-4">
      <Tabs defaultValue="containers">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="containers">Containers</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
          </TabsList>
          <PageHelp
            title="Docker"
            points={[
              "Start, stop and restart containers",
              "Stream live logs from any container",
              "Set CPU and memory limits per container",
              "Remove unused containers and images",
            ]}
          />
        </div>

        <TabsContent value="containers" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => refetchContainers()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {loadingContainers ? (
                <SkeletonTable rows={6} cols={5} />
              ) : !containers?.length ? (
                <EmptyState
                  icon={Box}
                  title="No containers yet"
                  description="Install an app from the App Store or create a compose stack."
                  action={{ label: "Open App Store", onClick: () => navigate("/app-store") }}
                />
              ) : (
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Name</th>
                        <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Image</th>
                        <th className="text-center px-4 py-2 text-muted-foreground font-medium text-xs">Status</th>
                        <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden md:table-cell">Ports</th>
                        <th className="w-36 px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map((c: Container) => (
                        <ContainerRow key={c.id} c={c} />
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => refetchImages()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {loadingImages ? (
                <SkeletonTable rows={6} cols={4} />
              ) : !images?.length ? (
                <EmptyState icon={Layers} title="No images pulled" />
              ) : (
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Repository</th>
                        <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Tag</th>
                        <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs">Size</th>
                        <th className="w-12 px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {images.map((img: { id: string; repo_tags: string[]; size: number }) => {
                          const tag = img.repo_tags?.[0] ?? "<none>";
                          const [repo, tagPart] = tag.split(":");
                          return (
                            <tr key={img.id} className="border-b border-border/50 hover:bg-secondary/20">
                              <td className="px-4 py-2 font-mono">{repo}</td>
                              <td className="px-4 py-2 text-muted-foreground text-xs">{tagPart ?? "latest"}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground text-xs tabular-nums">
                                {formatBytes(img.size)}
                              </td>
                              <td className="px-4 py-2">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7"
                                  onClick={() =>
                                    confirm("Remove this image?") &&
                                    apiClient.delete(`/docker/images/${img.id}`).then(() => refetchImages())
                                  }
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
