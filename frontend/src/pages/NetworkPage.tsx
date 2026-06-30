import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, Router, Signal, RefreshCw,
  Trash2, Users, Lock, Unlock, Plus, Save,
} from "lucide-react";
import { networkApi } from "@/api/network";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { WifiScanResult } from "@/types";

function SignalBars({ percent }: { percent: number }) {
  const bars = 4;
  const active = Math.ceil((percent / 100) * bars);
  return (
    <div className="flex items-end gap-0.5 h-4">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 rounded-sm transition-colors",
            i < active
              ? percent >= 75 ? "bg-success" : percent >= 40 ? "bg-warning" : "bg-destructive"
              : "bg-muted"
          )}
          style={{ height: `${((i + 1) / bars) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ConnectDialog({
  network,
  onClose,
}: {
  network: WifiScanResult;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const queryClient = useQueryClient();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await networkApi.connectWifi({ ssid: network.ssid, password: password || undefined, save: true });
      toast({ title: "Connected", description: `Connected to ${network.ssid}`, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["wifi-status"] });
      queryClient.invalidateQueries({ queryKey: ["saved-networks"] });
      onClose();
    } catch {
      toast({ title: "Failed", description: `Could not connect to ${network.ssid}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold mb-1">Connect to {network.ssid}</h3>
        <p className="text-sm text-muted-foreground mb-4">{network.security} · {network.signal_percent}% signal</p>
        {network.security !== "OPEN" && (
          <div className="mb-4">
            <label className="text-sm text-muted-foreground mb-1 block">Password</label>
            <Input
              type="password"
              placeholder="Wi-Fi password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleConnect} loading={connecting}>Connect</Button>
        </div>
      </div>
    </div>
  );
}

export default function NetworkPage() {
  const queryClient = useQueryClient();
  const [connectTarget, setConnectTarget] = useState<WifiScanResult | null>(null);
  const [apEdit, setApEdit] = useState(false);
  const [apForm, setApForm] = useState({ ssid: "", password: "", channel: 6, country_code: "EG", hide_ssid: false, max_clients: 20 });

  const { data: apStatus, isLoading: apLoading, refetch: refetchAp } = useQuery({
    queryKey: ["ap-status"],
    queryFn: networkApi.getApStatus,
    refetchInterval: 10000,
  });

  const { data: wifiStatus, isLoading: wifiLoading, refetch: refetchWifi } = useQuery({
    queryKey: ["wifi-status"],
    queryFn: networkApi.getWifiStatus,
    refetchInterval: 5000,
  });

  const { data: scanResults, isFetching: scanning, refetch: startScan } = useQuery({
    queryKey: ["wifi-scan"],
    queryFn: networkApi.scanWifi,
    enabled: false,
  });

  const { data: savedNetworks, refetch: refetchSaved } = useQuery({
    queryKey: ["saved-networks"],
    queryFn: networkApi.getSavedNetworks,
  });

  const disconnectMutation = useMutation({
    mutationFn: networkApi.disconnectWifi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wifi-status"] });
      toast({ title: "Disconnected", description: "Wi-Fi disconnected", variant: "default" } as { title: string; description: string; variant: "default" });
    },
  });

  const updateApMutation = useMutation({
    mutationFn: networkApi.updateAp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ap-status"] });
      setApEdit(false);
      toast({ title: "AP Updated", description: "Access point restarted with new settings", variant: "success" } as { title: string; description: string; variant: "success" });
    },
  });

  const initApEdit = () => {
    if (apStatus) {
      setApForm({
        ssid: apStatus.config.ssid,
        password: "",
        channel: apStatus.config.channel,
        country_code: apStatus.config.country_code,
        hide_ssid: apStatus.config.hide_ssid,
        max_clients: apStatus.config.max_clients,
      });
    }
    setApEdit(true);
  };

  return (
    <div className="p-6 space-y-6">
      {connectTarget && (
        <ConnectDialog network={connectTarget} onClose={() => setConnectTarget(null)} />
      )}

      <Tabs defaultValue="ap">
        <TabsList>
          <TabsTrigger value="ap">
            <Router className="w-3.5 h-3.5 mr-1.5" />
            Management Network (wlan0)
          </TabsTrigger>
          <TabsTrigger value="client">
            <Wifi className="w-3.5 h-3.5 mr-1.5" />
            Internet Network (wlan1)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ap" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Access Point Status</CardTitle>
                <div className="flex items-center gap-2">
                  <span className={cn("status-dot", apStatus?.is_running ? "running" : "stopped")} />
                  <Badge variant={apStatus?.is_running ? "success" : "destructive"}>
                    {apStatus?.is_running ? "Running" : "Stopped"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {apLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : apStatus ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SSID</span>
                      <span className="font-medium">{apStatus.config.ssid}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interface</span>
                      <span className="font-mono">{apStatus.interface}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IP Address</span>
                      <span className="font-mono">{apStatus.ip_address}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Channel</span>
                      <span>{apStatus.config.channel} ({apStatus.config.band})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clients</span>
                      <span>{apStatus.client_count} / {apStatus.config.max_clients}</span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={initApEdit}>
                      Edit Configuration
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center">No AP data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Connected Clients ({apStatus?.client_count ?? 0})</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => refetchAp()}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  {apStatus?.clients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <Users className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">No clients connected</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(apStatus?.clients ?? []).map((client, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-secondary/30 text-sm">
                          <div>
                            <p className="font-mono text-xs">{client.mac_address}</p>
                            {client.hostname && <p className="text-xs text-muted-foreground">{client.hostname}</p>}
                          </div>
                          <div className="text-right">
                            {client.ip_address && <p className="font-mono text-xs">{client.ip_address}</p>}
                            {client.signal_dbm && (
                              <p className="text-xs text-muted-foreground">{client.signal_dbm} dBm</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {apEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Edit AP Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">SSID</label>
                    <Input value={apForm.ssid} onChange={(e) => setApForm({ ...apForm, ssid: e.target.value })} placeholder="Network name" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Password (min 8 chars)</label>
                    <Input type="password" value={apForm.password} onChange={(e) => setApForm({ ...apForm, password: e.target.value })} placeholder="New password (leave blank to keep)" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Channel (1-13)</label>
                    <Input type="number" min={1} max={13} value={apForm.channel} onChange={(e) => setApForm({ ...apForm, channel: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Country Code</label>
                    <Input maxLength={2} value={apForm.country_code} onChange={(e) => setApForm({ ...apForm, country_code: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={() => setApEdit(false)}>Cancel</Button>
                  <Button
                    onClick={() => updateApMutation.mutate({ ...apForm, password: apForm.password || (apStatus?.config.ssid ?? "sudopi2024") })}
                    loading={updateApMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-1" /> Save & Restart AP
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="client" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Connection Status</CardTitle>
                <div className="flex items-center gap-2">
                  {wifiStatus?.is_connected ? (
                    <Wifi className="w-4 h-4 text-success" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Badge variant={wifiStatus?.is_connected ? "success" : "muted"}>
                    {wifiStatus?.is_connected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {wifiLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : wifiStatus ? (
                  <>
                    {wifiStatus.ssid && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SSID</span>
                        <span className="font-medium">{wifiStatus.ssid}</span>
                      </div>
                    )}
                    {wifiStatus.ip_address && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IP Address</span>
                        <span className="font-mono">{wifiStatus.ip_address}</span>
                      </div>
                    )}
                    {wifiStatus.gateway && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gateway</span>
                        <span className="font-mono">{wifiStatus.gateway}</span>
                      </div>
                    )}
                    {wifiStatus.signal_percent !== null && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Signal</span>
                        <div className="flex items-center gap-2">
                          <SignalBars percent={wifiStatus.signal_percent ?? 0} />
                          <span>{wifiStatus.signal_percent}% ({wifiStatus.signal_dbm} dBm)</span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interface</span>
                      <span className="font-mono">{wifiStatus.interface}</span>
                    </div>
                    {wifiStatus.is_connected && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive mt-2"
                        onClick={() => disconnectMutation.mutate()}
                        loading={disconnectMutation.isPending}
                      >
                        Disconnect
                      </Button>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saved Networks</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  {!savedNetworks?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No saved networks</p>
                  ) : (
                    <div className="space-y-2">
                      {savedNetworks.map((profile) => (
                        <div key={profile.id} className="flex items-center justify-between p-2 rounded bg-secondary/30 text-sm">
                          <div className="flex items-center gap-2">
                            {profile.security !== "open" ? <Lock className="w-3 h-3 text-muted-foreground" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                            <div>
                              <p className="font-medium">{profile.ssid}</p>
                              <p className="text-xs text-muted-foreground">Priority: {profile.priority}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {profile.is_active && <Badge variant="success" className="text-[10px]">Active</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Wi-Fi Scanner</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => startScan()}
                loading={scanning}
              >
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", scanning && "animate-spin")} />
                {scanning ? "Scanning…" : "Scan"}
              </Button>
            </CardHeader>
            <CardContent>
              {!scanResults ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Wifi className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">Click Scan to find networks</p>
                </div>
              ) : (
                <ScrollArea className="h-64">
                  <div className="space-y-1">
                    {scanResults.map((net) => (
                      <div
                        key={net.bssid}
                        className="flex items-center justify-between p-3 rounded hover:bg-secondary/30 transition-colors cursor-pointer"
                        onClick={() => !net.is_connected && setConnectTarget(net)}
                      >
                        <div className="flex items-center gap-3">
                          <SignalBars percent={net.signal_percent} />
                          <div>
                            <p className="text-sm font-medium">{net.ssid}</p>
                            <p className="text-xs text-muted-foreground">{net.security} · Ch {net.channel}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {net.is_saved && <Badge variant="info" className="text-[10px]">Saved</Badge>}
                          {net.is_connected ? (
                            <Badge variant="success" className="text-[10px]">Connected</Badge>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs">Connect</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
