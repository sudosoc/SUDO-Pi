import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X } from "lucide-react";
import { systemApi } from "@/api/system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { useAuthStore } from "@/stores/authStore";

export function ProcessTable() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canKill = user?.role === "admin" || user?.role === "operator";

  const { data: processes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["processes"],
    queryFn: () => systemApi.getProcesses(20),
    refetchInterval: 5000,
  });

  const killMutation = useMutation({
    mutationFn: (pid: number) => systemApi.killProcess(pid),
    onSuccess: (_, pid) => {
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      toast({ title: `Process ${pid} killed`, variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Failed to kill process", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle>Top Processes</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <ScrollArea className="h-64">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">PID</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Name</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">CPU%</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">MEM%</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">RSS</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Status</th>
                {canKill && <th className="w-8 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: canKill ? 7 : 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-2">
                          <div className="h-3 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (processes ?? []).map((proc) => (
                    <tr
                      key={proc.pid}
                      className="group border-b border-border/50 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-4 py-1.5 font-mono text-muted-foreground">{proc.pid}</td>
                      <td className="px-4 py-1.5 font-medium max-w-[120px]">
                        <span className="truncate block">{proc.name}</span>
                      </td>
                      <td className={cn(
                        "px-4 py-1.5 text-right tabular-nums",
                        proc.cpu_percent > 50 ? "text-destructive" :
                        proc.cpu_percent > 20 ? "text-warning" : "text-foreground"
                      )}>
                        {proc.cpu_percent.toFixed(1)}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-foreground">
                        {proc.memory_percent.toFixed(1)}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatBytes(proc.memory_rss_bytes)}
                      </td>
                      <td className="px-4 py-1.5">
                        <Badge
                          variant={proc.status === "running" ? "success" : "muted"}
                          className="text-[10px] py-0"
                        >
                          {proc.status}
                        </Badge>
                      </td>
                      {canKill && (
                        <td className="px-2 py-1.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              if (window.confirm(`Kill PID ${proc.pid} (${proc.name})?`)) {
                                killMutation.mutate(proc.pid);
                              }
                            }}
                            disabled={killMutation.isPending && killMutation.variables === proc.pid}
                            title={`Kill ${proc.name} (PID ${proc.pid})`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
