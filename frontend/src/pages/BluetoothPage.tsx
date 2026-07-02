import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bluetooth, RefreshCw, Link2, Link2Off, Trash2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function BluetoothPage() {
  const queryClient = useQueryClient();

  const { data: devices, isLoading, refetch } = useQuery({
    queryKey: ["bluetooth-devices"],
    queryFn: async () => {
      const { data } = await apiClient.get("/bluetooth/devices");
      return data;
    },
  });

  const { data: scanResults, isFetching: scanning, refetch: startScan } = useQuery({
    queryKey: ["bluetooth-scan"],
    queryFn: async () => {
      const { data } = await apiClient.get("/bluetooth/scan");
      return data;
    },
    enabled: false,
  });

  const pairMutation = useMutation({
    mutationFn: (mac: string) => apiClient.post("/bluetooth/pair", { mac }),
    onSuccess: (_, mac) => {
      queryClient.invalidateQueries({ queryKey: ["bluetooth-devices"] });
      toast({ title: `Paired with ${mac}`, variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Pairing failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (mac: string) => apiClient.post("/bluetooth/disconnect", { mac }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bluetooth-devices"] });
      toast({ title: "Disconnected", variant: "success" } as { title: string; variant: "success" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (mac: string) => apiClient.delete(`/bluetooth/devices/${mac}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bluetooth-devices"] });
      toast({ title: "Device removed", variant: "success" } as { title: string; variant: "success" });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <Tabs defaultValue="paired">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="paired">Paired Devices</TabsTrigger>
            <TabsTrigger value="scan">Scan</TabsTrigger>
          </TabsList>
          <PageHelp
            title="Bluetooth"
            points={[
              "Scan for nearby Bluetooth devices",
              "Pair, connect and remove devices",
              "See signal strength and device type",
            ]}
          />
        </div>

        <TabsContent value="paired" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <SkeletonList count={4} />
              ) : !devices?.length ? (
                <EmptyState
                  icon={Bluetooth}
                  title="No devices found"
                  description="Run a scan to discover nearby Bluetooth devices."
                  action={{ label: "Scan now", onClick: () => startScan() }}
                />
              ) : (
              <ScrollArea className="h-96">
                <div className="divide-y divide-border">
                  {devices.map((dev: { mac: string; name: string; connected: boolean; rssi: number; type: string }) => (
                        <div key={dev.mac} className="px-4 py-3 flex items-center justify-between hover:bg-secondary/20">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center",
                              dev.connected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              <Bluetooth className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{dev.name || "Unknown Device"}</p>
                              <p className="text-xs text-muted-foreground font-mono">{dev.mac}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {dev.rssi && (
                              <span className="text-xs text-muted-foreground">{dev.rssi} dBm</span>
                            )}
                            <Badge variant={dev.connected ? "success" : "muted"} className="text-[10px]">
                              {dev.connected ? "Connected" : "Paired"}
                            </Badge>
                            {dev.connected ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7"
                                onClick={() => disconnectMutation.mutate(dev.mac)}
                              >
                                <Link2Off className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 text-primary"
                                onClick={() => pairMutation.mutate(dev.mac)}
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => confirm("Remove device?") && removeMutation.mutate(dev.mac)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                </div>
              </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="mt-4 space-y-4">
          <Button onClick={() => startScan()} loading={scanning}>
            <Bluetooth className="w-4 h-4 mr-1.5" />
            {scanning ? "Scanning (10s)…" : "Start Scan"}
          </Button>

          {scanResults && (
            <Card>
              <CardHeader><CardTitle>Discovered Devices ({scanResults.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {(scanResults ?? []).map((dev: { mac: string; name: string; rssi: number; paired: boolean }) => (
                    <div key={dev.mac} className="px-4 py-3 flex items-center justify-between hover:bg-secondary/20">
                      <div>
                        <p className="text-sm font-medium">{dev.name || "Unknown Device"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{dev.mac} · {dev.rssi} dBm</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {dev.paired ? (
                          <Badge variant="success" className="text-[10px]">Paired</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => pairMutation.mutate(dev.mac)}
                            loading={pairMutation.isPending && pairMutation.variables === dev.mac}
                          >
                            Pair
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
