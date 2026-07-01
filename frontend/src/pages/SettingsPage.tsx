import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, RefreshCw, Save, Server } from "lucide-react";

export default function SettingsPage() {
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
    onSuccess: () => toast({ title: "Rebooting…", description: "System will restart in a few seconds", variant: "warning" } as { title: string; description: string; variant: "warning" }),
  });

  const shutdownM = useMutation({
    mutationFn: () => apiClient.post("/system/shutdown"),
    onSuccess: () => toast({ title: "Shutting down…", description: "System will power off", variant: "warning" } as { title: string; description: string; variant: "warning" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> System</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground mb-1 block">Hostname</label>
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
                  <label className="text-sm text-muted-foreground mb-1 block">Timezone</label>
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

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-destructive"><AlertTriangle className="w-3.5 h-3.5" /> Danger Zone</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded border border-border">
            <div>
              <p className="text-sm font-medium">Reboot System</p>
              <p className="text-xs text-muted-foreground">Restart the Raspberry Pi</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-warning text-warning hover:bg-warning/10"
              onClick={() => confirm("Reboot the system?") && rebootM.mutate()}
              loading={rebootM.isPending}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reboot
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 rounded border border-border">
            <div>
              <p className="text-sm font-medium">Shutdown System</p>
              <p className="text-xs text-muted-foreground">Power off the Raspberry Pi</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirm("Shut down the system? You will lose remote access.") && shutdownM.mutate()}
              loading={shutdownM.isPending}
            >
              Shutdown
            </Button>
          </div>
        </CardContent>
      </Card>

      {settings && (
        <Card>
          <CardHeader><CardTitle>Application</CardTitle></CardHeader>
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
