import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, Square, Trash2, RefreshCw, Plus, FileText,
  Download, Layers, ChevronDown, ChevronRight, X,
  Circle,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ComposeService {
  name: string;
  image: string;
  status: string;
  ports: string[];
}

interface ComposeStack {
  name: string;
  path: string;
  services: ComposeService[];
  running: number;
  total: number;
}

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
`;


function LogsPanel({
  stackName,
  onClose,
}: {
  stackName: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/compose/stacks/${stackName}/logs?lines=200`);
      setLines(data.logs ?? "");
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    } catch {
      // silent
    }
  }, [stackName]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  return (
    <div className="flex flex-col h-full bg-[#0f172a] rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-mono text-foreground">{stackName} logs</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={autoRefresh}
              onCheckedChange={(v) => setAutoRefresh(!!v)}
              className="h-3 w-3"
            />
            Auto-refresh
          </label>
          <Button variant="ghost" size="icon-sm" onClick={fetchLogs} className="h-6 w-6">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="h-6 w-6">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs text-[#e2e8f0] leading-relaxed whitespace-pre-wrap break-all"
        style={{ maxHeight: "360px" }}
      >
        {lines || (
          <span className="text-muted-foreground italic">No log output yet.</span>
        )}
      </div>
    </div>
  );
}

function StackCard({
  stack,
  onRefresh,
}: {
  stack: ComposeStack;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeVolumes, setRemoveVolumes] = useState(false);

  const isRunning = stack.running > 0;

  const startMutation = useMutation({
    mutationFn: () => apiClient.post(`/compose/stacks/${stack.name}/start`),
    onSuccess: () => {
      toast({ title: `Stack "${stack.name}" started`, variant: "success" } as { title: string; variant: "success" });
      onRefresh();
    },
    onError: (err) => toast({ title: "Start failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiClient.post(`/compose/stacks/${stack.name}/stop`),
    onSuccess: () => {
      toast({ title: `Stack "${stack.name}" stopped` });
      onRefresh();
    },
    onError: (err) => toast({ title: "Stop failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const pullMutation = useMutation({
    mutationFn: () => apiClient.post(`/compose/stacks/${stack.name}/pull`),
    onSuccess: () => toast({ title: `Images pulled for "${stack.name}"` }),
    onError: (err) => toast({ title: "Pull failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiClient.delete(`/compose/stacks/${stack.name}?remove_volumes=${removeVolumes}`),
    onSuccess: () => {
      toast({ title: `Stack "${stack.name}" removed` });
      queryClient.invalidateQueries({ queryKey: ["compose-stacks"] });
    },
    onError: (err) => toast({ title: "Delete failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const busy =
    startMutation.isPending ||
    stopMutation.isPending ||
    pullMutation.isPending ||
    deleteMutation.isPending;

  return (
    <>
      <Card className="border border-border">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Circle
                className={cn(
                  "w-2.5 h-2.5 shrink-0",
                  isRunning ? "text-green-500 fill-green-500" : "text-muted-foreground fill-muted-foreground"
                )}
              />
              <CardTitle className="text-sm font-mono truncate">{stack.name}</CardTitle>
              <Badge
                variant={isRunning ? "success" : "muted"}
                className="text-[10px] shrink-0"
              >
                {stack.running}/{stack.total} running
              </Badge>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors ml-2"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-3 space-y-3">
          {expanded && stack.services.length > 0 && (
            <div className="border border-border/50 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-secondary/30">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Service</th>
                    <th className="text-left px-3 py-1.5 text-muted-foreground font-medium hidden sm:table-cell">Image</th>
                    <th className="text-center px-3 py-1.5 text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-3 py-1.5 text-muted-foreground font-medium hidden md:table-cell">Ports</th>
                  </tr>
                </thead>
                <tbody>
                  {stack.services.map((svc) => (
                    <tr key={svc.name} className="border-t border-border/30">
                      <td className="px-3 py-1.5 font-mono">{svc.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px] hidden sm:table-cell">
                        {svc.image}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <Badge
                          variant={
                            svc.status === "running" || svc.status === "Up"
                              ? "success"
                              : svc.status === "exited"
                              ? "muted"
                              : "warning"
                          }
                          className="text-[10px]"
                        >
                          {svc.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground font-mono hidden md:table-cell">
                        {svc.ports.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expanded && stack.services.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No services running. Start the stack to see service details.
            </p>
          )}

          {showLogs && (
            <LogsPanel stackName={stack.name} onClose={() => setShowLogs(false)} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!isRunning ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
                onClick={() => startMutation.mutate()}
                disabled={busy}
              >
                <Play className="w-3 h-3 mr-1" /> Start
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-orange-400 border-orange-400/30 hover:bg-orange-400/10"
                onClick={() => stopMutation.mutate()}
                disabled={busy}
              >
                <Square className="w-3 h-3 mr-1" /> Stop
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowLogs((v) => !v)}
            >
              <FileText className="w-3 h-3 mr-1" /> Logs
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => pullMutation.mutate()}
              disabled={busy}
            >
              <Download className="w-3 h-3 mr-1" /> Pull
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 ml-auto"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
            >
              <Trash2 className="w-3 h-3 mr-1" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stack &quot;{stack.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will run <code className="font-mono text-xs bg-secondary px-1 py-0.5 rounded">docker compose down</code> and
              delete the stack directory. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-1 py-2">
            <Checkbox
              id="remove-vols"
              checked={removeVolumes}
              onCheckedChange={(v) => setRemoveVolumes(!!v)}
            />
            <label htmlFor="remove-vols" className="text-sm cursor-pointer select-none">
              Also remove named volumes (data will be lost)
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function DockerComposePage() {
  const queryClient = useQueryClient();
  const [newStackOpen, setNewStackOpen] = useState(false);
  const [stackName, setStackName] = useState("");
  const [composeContent, setComposeContent] = useState(DEFAULT_COMPOSE);
  const [nameError, setNameError] = useState("");

  const { data: stacks, isLoading, refetch } = useQuery<ComposeStack[]>({
    queryKey: ["compose-stacks"],
    queryFn: async () => {
      const { data } = await apiClient.get("/compose/stacks");
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/compose/stacks", { name: stackName.trim(), content: composeContent }),
    onSuccess: () => {
      toast({ title: `Stack "${stackName}" created`, variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["compose-stacks"] });
      setNewStackOpen(false);
      setStackName("");
      setComposeContent(DEFAULT_COMPOSE);
    },
    onError: (err) =>
      toast({ title: "Create failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const handleNameChange = (value: string) => {
    setStackName(value);
    if (value && !/^[a-z0-9][a-z0-9\-]*$/.test(value)) {
      setNameError("Lowercase letters, numbers, and hyphens only. Must start with a letter or digit.");
    } else {
      setNameError("");
    }
  };

  const canCreate = stackName.trim().length > 0 && !nameError && composeContent.trim().length > 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Compose Stacks</h1>
          {stacks && (
            <Badge variant="secondary" className="text-xs">
              {stacks.length} stack{stacks.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setNewStackOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Stack
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border border-border">
              <CardContent className="p-4 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stacks && stacks.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {stacks.map((stack) => (
            <StackCard key={stack.name} stack={stack} onRefresh={() => refetch()} />
          ))}
        </div>
      ) : (
        <Card className="border border-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No compose stacks</p>
            <p className="text-muted-foreground/60 text-sm mt-1 mb-4">
              Create your first stack to get started.
            </p>
            <Button size="sm" onClick={() => setNewStackOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New Stack
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={newStackOpen} onOpenChange={setNewStackOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Compose Stack</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="stack-name">Stack Name</Label>
              <Input
                id="stack-name"
                placeholder="my-app"
                value={stackName}
                onChange={(e) => handleNameChange(e.target.value)}
                className={cn(nameError && "border-destructive")}
                autoFocus
              />
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-content">docker-compose.yml</Label>
              <textarea
                id="compose-content"
                value={composeContent}
                onChange={(e) => setComposeContent(e.target.value)}
                rows={16}
                spellCheck={false}
                className={cn(
                  "w-full font-mono text-xs p-3 rounded-md border border-border bg-[#0f172a] text-[#e2e8f0]",
                  "focus:outline-none focus:ring-2 focus:ring-ring resize-y",
                  "placeholder:text-muted-foreground leading-relaxed"
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewStackOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Stack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
