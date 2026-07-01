import { useQuery } from "@tanstack/react-query";
import { Play, RefreshCw, Square } from "lucide-react";
import { systemApi } from "@/api/system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "@/components/ui/use-toast";
import { useState } from "react";

export function ServiceStatus() {
  const { data: services, isLoading, refetch } = useQuery({
    queryKey: ["services"],
    queryFn: systemApi.getServices,
    refetchInterval: 15000,
  });
  const { user } = useAuthStore();
  const canControl = user?.role === "admin" || user?.role === "operator";
  const [controlling, setControlling] = useState<string | null>(null);

  const handleControl = async (name: string, action: "start" | "stop" | "restart") => {
    setControlling(name);
    try {
      await systemApi.controlService(name, action);
      toast({ title: "Success", description: `${name} ${action}ed`, variant: "success" } as { title: string; description: string; variant: "success" });
      refetch();
    } catch {
      toast({ title: "Error", description: `Failed to ${action} ${name}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    } finally {
      setControlling(null);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle>Services</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <ScrollArea className="h-64">
          <div className="divide-y divide-border">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                  </div>
                ))
              : (services ?? []).map((svc) => (
                  <div
                    key={svc.name}
                    className="px-4 py-2 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          "status-dot shrink-0",
                          svc.active_state === "active" ? "running" :
                          svc.active_state === "failed" ? "error" : "stopped"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">{svc.sub_state}</p>
                      </div>
                    </div>
                    {canControl && (
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {svc.active_state !== "active" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-success hover:text-success hover:bg-success/10"
                            onClick={() => handleControl(svc.name, "start")}
                            disabled={controlling === svc.name}
                          >
                            <Play className="w-3 h-3" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleControl(svc.name, "stop")}
                            disabled={controlling === svc.name}
                          >
                            <Square className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6"
                          onClick={() => handleControl(svc.name, "restart")}
                          disabled={controlling === svc.name}
                        >
                          <RefreshCw className={cn("w-3 h-3", controlling === svc.name && "animate-spin")} />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
