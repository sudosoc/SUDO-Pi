import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cloud, Tv, Shield, LayoutDashboard, Home,
  BarChart2, Activity, Lock, GitBranch, Workflow,
  Store, Search, Download, Trash2, RefreshCw, CheckCircle2,
  Circle, AlertCircle,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface AppEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  ports: number[];
  requires_volumes: boolean;
  ram_mb: number;
  notes: string;
  installed: boolean;
}

const CATEGORIES = ["All", "Storage", "Media", "Network", "Development", "IoT", "Security"];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  cloud: Cloud,
  tv: Tv,
  shield: Shield,
  "layout-dashboard": LayoutDashboard,
  home: Home,
  "bar-chart-2": BarChart2,
  activity: Activity,
  lock: Lock,
  "git-branch": GitBranch,
  workflow: Workflow,
};

function AppIcon({ icon, className }: { icon: string; className?: string }) {
  const IconComp = ICON_MAP[icon] ?? Store;
  return <IconComp className={className} />;
}

function InstallDialog({
  app,
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  app: AppEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon icon={app.icon} className="w-5 h-5 text-primary" />
            Install {app.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">{app.description}</p>
          <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ports</span>
              <span className="font-mono text-xs">{app.ports.join(", ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RAM requirement</span>
              <span>{app.ram_mb} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Persistent volumes</span>
              <span>{app.requires_volumes ? "Yes" : "No"}</span>
            </div>
          </div>
          {app.notes && (
            <div className="flex gap-2 text-xs text-muted-foreground bg-secondary/20 rounded-md p-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
              <span>{app.notes}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Installing..." : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UninstallDialog({
  app,
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  app: AppEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (removeData: boolean) => void;
  loading: boolean;
}) {
  const [removeData, setRemoveData] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Uninstall {app.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop and remove the compose stack for {app.name}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 px-1 py-2">
          <Checkbox
            id="remove-data"
            checked={removeData}
            onCheckedChange={(v) => setRemoveData(!!v)}
          />
          <label htmlFor="remove-data" className="text-sm cursor-pointer select-none">
            Also delete all data volumes (irreversible)
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(removeData)}
            disabled={loading}
          >
            {loading ? "Uninstalling..." : "Uninstall"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AppCard({
  app,
  onInstall,
  onUninstall,
  installing,
  uninstalling,
}: {
  app: AppEntry;
  onInstall: () => void;
  onUninstall: () => void;
  installing: boolean;
  uninstalling: boolean;
}) {
  return (
    <Card className={cn("border border-border transition-colors", app.installed && "border-green-500/20")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
              app.installed ? "bg-green-500/10" : "bg-secondary"
            )}>
              <AppIcon icon={app.icon} className={cn("w-5 h-5", app.installed ? "text-green-400" : "text-muted-foreground")} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{app.name}</h3>
              <Badge variant="secondary" className="text-[10px] mt-0.5">{app.category}</Badge>
            </div>
          </div>
          {app.installed ? (
            <Badge variant="success" className="text-[10px] shrink-0 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> Installed
            </Badge>
          ) : (
            <Badge variant="muted" className="text-[10px] shrink-0 flex items-center gap-1">
              <Circle className="w-2.5 h-2.5" /> Not installed
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {app.description}
        </p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="text-foreground/60">Ports: </span>
            <span className="font-mono">{app.ports.join(", ")}</span>
          </span>
          <span>
            <span className="text-foreground/60">RAM: </span>
            {app.ram_mb} MB
          </span>
        </div>

        {app.installed ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={onUninstall}
            disabled={uninstalling}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            {uninstalling ? "Uninstalling..." : "Uninstall"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={onInstall}
            disabled={installing}
          >
            <Download className="w-3 h-3 mr-1" />
            {installing ? "Installing..." : "Install"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function AppStorePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [installTarget, setInstallTarget] = useState<AppEntry | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<AppEntry | null>(null);
  const [pendingOps, setPendingOps] = useState<Set<string>>(new Set());

  const { data: apps, isLoading, refetch } = useQuery<AppEntry[]>({
    queryKey: ["app-store-apps"],
    queryFn: async () => {
      const { data } = await apiClient.get("/app-store/apps");
      return data;
    },
    refetchInterval: 30000,
  });

  const installMutation = useMutation({
    mutationFn: (appId: string) => apiClient.post(`/app-store/apps/${appId}/install`),
    onMutate: (appId) => setPendingOps((s) => new Set(s).add(appId)),
    onSuccess: (_, appId) => {
      const app = apps?.find((a) => a.id === appId);
      toast({ title: `${app?.name ?? appId} installed successfully`, variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["app-store-apps"] });
      queryClient.invalidateQueries({ queryKey: ["compose-stacks"] });
      setInstallTarget(null);
    },
    onError: (err, appId) => {
      const app = apps?.find((a) => a.id === appId);
      toast({ title: `Failed to install ${app?.name ?? appId}`, description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
    onSettled: (_, __, appId) => setPendingOps((s) => { const n = new Set(s); n.delete(appId); return n; }),
  });

  const uninstallMutation = useMutation({
    mutationFn: ({ appId, removeData }: { appId: string; removeData: boolean }) =>
      apiClient.post(`/app-store/apps/${appId}/uninstall`, { remove_data: removeData }),
    onMutate: ({ appId }) => setPendingOps((s) => new Set(s).add(appId)),
    onSuccess: (_, { appId }) => {
      const app = apps?.find((a) => a.id === appId);
      toast({ title: `${app?.name ?? appId} uninstalled` });
      queryClient.invalidateQueries({ queryKey: ["app-store-apps"] });
      queryClient.invalidateQueries({ queryKey: ["compose-stacks"] });
      setUninstallTarget(null);
    },
    onError: (err, { appId }) => {
      const app = apps?.find((a) => a.id === appId);
      toast({ title: `Failed to uninstall ${app?.name ?? appId}`, description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
    onSettled: (_, __, { appId }) => setPendingOps((s) => { const n = new Set(s); n.delete(appId); return n; }),
  });

  const filtered = (apps ?? []).filter((app) => {
    const matchesCategory = category === "All" || app.category === category;
    const matchesSearch =
      !search ||
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const installedCount = (apps ?? []).filter((a) => a.installed).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">App Store</h1>
          {apps && (
            <Badge variant="secondary" className="text-xs">
              {installedCount}/{apps.length} installed
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    <div className="h-3 bg-muted rounded animate-pulse w-16" />
                  </div>
                </div>
                <div className="h-3 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-7 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onInstall={() => setInstallTarget(app)}
              onUninstall={() => setUninstallTarget(app)}
              installing={pendingOps.has(app.id) && installMutation.isPending}
              uninstalling={pendingOps.has(app.id) && uninstallMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Store className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground font-medium">No apps found</p>
          <p className="text-muted-foreground/60 text-sm mt-1">
            {search ? `No results for "${search}"` : "No apps in this category."}
          </p>
        </div>
      )}

      {installTarget && (
        <InstallDialog
          app={installTarget}
          open={!!installTarget}
          onOpenChange={(v) => !v && setInstallTarget(null)}
          onConfirm={() => installMutation.mutate(installTarget.id)}
          loading={pendingOps.has(installTarget.id) && installMutation.isPending}
        />
      )}

      {uninstallTarget && (
        <UninstallDialog
          app={uninstallTarget}
          open={!!uninstallTarget}
          onOpenChange={(v) => !v && setUninstallTarget(null)}
          onConfirm={(removeData) =>
            uninstallMutation.mutate({ appId: uninstallTarget.id, removeData })
          }
          loading={pendingOps.has(uninstallTarget.id) && uninstallMutation.isPending}
        />
      )}
    </div>
  );
}
