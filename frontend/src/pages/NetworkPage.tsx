import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, Router, RefreshCw,
  Users, Lock, Unlock, Save, Network,
  ShieldOff, Shield, ScanLine, Globe,
} from "lucide-react";
import { networkApi } from "@/api/network";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { WifiScanResult } from "@/types";
import { apiClient } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";

// ─── Open Ports Types ─────────────────────────────────────────────────────────

interface OpenPort {
  proto:   "tcp" | "udp";
  port:    number;
  address: string;
  state:   string;
  process: string | null;
  pid:     number | null;
}

const WELL_KNOWN_PORTS: Record<number, string> = {
  22: "SSH", 80: "HTTP", 443: "HTTPS", 3000: "Node.js",
  5000: "Flask", 8000: "HTTP-alt", 8080: "HTTP-proxy",
  8443: "HTTPS-alt", 3306: "MySQL", 5432: "PostgreSQL",
  6379: "Redis", 27017: "MongoDB", 51820: "WireGuard",
  1194: "OpenVPN", 53: "DNS", 67: "DHCP", 68: "DHCP",
  111: "RPC", 2049: "NFS", 445: "SMB", 139: "NetBIOS",
};

// ─── Open Ports Tab ───────────────────────────────────────────────────────────

function OpenPortsTab() {
  const queryClient = useQueryClient();
  const { data: ports = [], isLoading } = useQuery({
    queryKey:       ["open-ports"],
    queryFn:        async () => {
      const { data } = await apiClient.get<OpenPort[]>("/processes/ports");
      return data;
    },
    refetchInterval: 15000,
    staleTime:       10000,
  });

  const tcp = ports.filter((p) => p.proto === "tcp");
  const udp = ports.filter((p) => p.proto === "udp");

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {ports.length} listening {ports.length === 1 ? "port" : "ports"} —
          {" "}{tcp.length} TCP · {udp.length} UDP
        </p>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["open-ports"] })}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && !ports.length ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : !ports.length ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Network className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No listening ports found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">Proto</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">Port</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">Service</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2">Address</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2 hidden sm:table-cell">Process</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2">
                        <span className={cn(
                          "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
                          p.proto === "tcp" ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"
                        )}>
                          {p.proto.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono font-bold text-foreground">{p.port}</td>
                      <td className="px-4 py-2">
                        {WELL_KNOWN_PORTS[p.port] ? (
                          <span className="text-xs text-cyan-400 font-medium">{WELL_KNOWN_PORTS[p.port]}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.address}</td>
                      <td className="px-4 py-2 hidden sm:table-cell">
                        {p.process ? (
                          <span className="text-xs font-mono">
                            {p.process}
                            {p.pid != null && (
                              <span className="text-muted-foreground ml-1">({p.pid})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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

// ─── Ad Blocker Types ─────────────────────────────────────────────────────────

interface AdBlockerStatus {
  enabled: boolean;
  domain_count: number;
  last_updated: string | null;
  active_lists: string[];
}

interface BlocklistSource {
  name: string;
  url: string;
  description: string;
}

// ─── Ad Blocker Tab ───────────────────────────────────────────────────────────

function AdBlockerTab() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const [selectedLists, setSelectedLists] = useState<string[]>([]);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["ad-blocker-status"],
    queryFn: async () => {
      const { data } = await apiClient.get<AdBlockerStatus>("/ad-blocker/status");
      return data;
    },
    refetchInterval: 10000,
  });

  const { data: availableLists = [] } = useQuery({
    queryKey: ["ad-blocker-lists"],
    queryFn: async () => {
      const { data } = await apiClient.get<BlocklistSource[]>("/ad-blocker/lists");
      return data;
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (lists: string[]) => {
      await apiClient.post("/ad-blocker/enable", { lists });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-blocker-status"] });
      toast({ title: "Ad Blocker Enabled", description: "DNS blocklist is active", variant: "success" } as { title: string; description: string; variant: "success" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not enable ad blocker", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/ad-blocker/disable");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-blocker-status"] });
      toast({ title: "Ad Blocker Disabled", description: "DNS blocking has been removed", variant: "default" } as { title: string; description: string; variant: "default" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not disable ad blocker", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/ad-blocker/update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-blocker-status"] });
      toast({ title: "Blocklist Updated", description: "Domain lists re-downloaded and applied", variant: "success" } as { title: string; description: string; variant: "success" });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Could not update blocklists", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const toggleList = (name: string) => {
    setSelectedLists((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const isBusy = enableMutation.isPending || disableMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Card */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle>Status</CardTitle>
            <div className="flex items-center gap-2">
              <span className={cn("status-dot", status?.enabled ? "running" : "stopped")} />
              <Badge variant={status?.enabled ? "success" : "muted"}>
                {status?.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {statusLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Domains Blocked</span>
                  <span className="font-mono font-bold text-green-400">
                    {status?.domain_count.toLocaleString() ?? 0}
                  </span>
                </div>
                {status?.last_updated && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-xs">{new Date(status.last_updated).toLocaleString()}</span>
                  </div>
                )}
                {status?.active_lists && status.active_lists.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1">Active Lists</p>
                    <div className="flex flex-wrap gap-1">
                      {status.active_lists.map((l) => (
                        <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {isAdmin && status?.enabled && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => updateMutation.mutate()}
                      loading={updateMutation.isPending}
                      disabled={isBusy}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Update Lists
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => disableMutation.mutate()}
                      loading={disableMutation.isPending}
                      disabled={isBusy}
                    >
                      <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                      Disable
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Blocklist Selector */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Blocklist Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {availableLists.map((list) => (
                <label
                  key={list.name}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    selectedLists.includes(list.name)
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/50 hover:border-border hover:bg-secondary/30"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedLists.includes(list.name)}
                    onChange={() => toggleList(list.name)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{list.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{list.description}</p>
                  </div>
                </label>
              ))}
              <Button
                className="w-full mt-2"
                disabled={selectedLists.length === 0 || isBusy}
                loading={enableMutation.isPending}
                onClick={() => enableMutation.mutate(selectedLists)}
              >
                <Shield className="w-4 h-4 mr-1.5" />
                Enable with {selectedLists.length || "selected"} list{selectedLists.length !== 1 ? "s" : ""}
              </Button>
              {enableMutation.isPending && (
                <p className="text-xs text-muted-foreground text-center animate-pulse">
                  Downloading and parsing blocklists — this may take a minute…
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Port Scanner Types ───────────────────────────────────────────────────────

interface ScannedPort {
  port: number;
  service: string;
}

interface ScannedDevice {
  ip: string;
  hostname: string | null;
  mac: string;
  open_ports: ScannedPort[];
  scan_time_ms: number;
}

// ─── Port Scanner Tab ─────────────────────────────────────────────────────────

const SERVICE_BADGE_COLOR: Record<string, string> = {
  SSH: "bg-red-500/15 text-red-400 border-red-500/20",
  HTTP: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  HTTPS: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "HTTP Alt": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "HTTPS Alt": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  MySQL: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  PostgreSQL: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  Redis: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  MongoDB: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

function serviceBadgeClass(service: string): string {
  return (
    SERVICE_BADGE_COLOR[service] ?? "bg-secondary text-muted-foreground border-border"
  );
}

function PortScannerTab() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const { data: devices = [], isFetching } = useQuery({
    queryKey: ["port-scan-cached"],
    queryFn: async () => {
      const { data } = await apiClient.get<ScannedDevice[]>("/port-scanner/cached");
      return data;
    },
    enabled: false,
    staleTime: 55000,
  });

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data } = await apiClient.get<ScannedDevice[]>("/port-scanner/scan");
      queryClient.setQueryData(["port-scan-cached"], data);
    } catch {
      toast({ title: "Scan Failed", description: "Could not complete port scan", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const isLoading = scanning || isFetching;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Scans all AP clients ({devices.length} device{devices.length !== 1 ? "s" : ""} found)
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleScan}
          disabled={isLoading}
        >
          <ScanLine className={cn("w-3.5 h-3.5 mr-1.5", isLoading && "animate-pulse")} />
          {isLoading ? "Scanning…" : "Scan Network"}
        </Button>
      </div>

      {isLoading && devices.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-48 bg-muted rounded animate-pulse" />
                  <div className="flex gap-2 mt-3">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="h-5 w-16 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <ScanLine className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No devices found on AP network</p>
            <p className="text-xs mt-1 opacity-70">Click "Scan Network" to discover devices</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => (
            <Card key={device.ip}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {device.hostname ?? device.ip}
                    </CardTitle>
                    {device.hostname && (
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        {device.ip}
                      </p>
                    )}
                    <p className="text-xs font-mono text-muted-foreground">
                      {device.mac}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-[10px]">
                      {device.open_ports.length} port{device.open_ports.length !== 1 ? "s" : ""}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {device.scan_time_ms}ms
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {device.open_ports.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open ports found</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {device.open_ports.map(({ port, service }) => (
                      <span
                        key={port}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium",
                          serviceBadgeClass(service)
                        )}
                      >
                        <span className="font-mono">{port}</span>
                        <span className="opacity-70">{service}</span>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Captive Portal Tab ───────────────────────────────────────────────────────

interface PortalStatus {
  enabled: boolean;
  allowed_macs: string[];
  title: string;
  message: string;
}

function CaptivePortalTab() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const [portalTitle, setPortalTitle] = useState("Welcome to SUDO-Pi");
  const [portalMessage, setPortalMessage] = useState(
    "Please accept the terms to connect to the internet."
  );

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["captive-portal-status"],
    queryFn: async () => {
      const { data } = await apiClient.get<PortalStatus>("/captive-portal/status");
      return data;
    },
    refetchInterval: 10000,
  });

  const enableMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/captive-portal/enable", { title: portalTitle, message: portalMessage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captive-portal-status"] });
      toast({ title: "Captive Portal Enabled", description: "HTTP traffic will be redirected", variant: "success" } as { title: string; description: string; variant: "success" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not enable captive portal", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/captive-portal/disable");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captive-portal-status"] });
      toast({ title: "Captive Portal Disabled", description: "Traffic redirect removed", variant: "default" } as { title: string; description: string; variant: "default" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not disable captive portal", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/captive-portal/clear-allowed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captive-portal-status"] });
      toast({ title: "Cleared", description: "All allowed devices removed", variant: "success" } as { title: string; description: string; variant: "success" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not clear allowed devices", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const isBusy = enableMutation.isPending || disableMutation.isPending || clearMutation.isPending;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status + Controls */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle>Portal Status</CardTitle>
            <div className="flex items-center gap-2">
              <span className={cn("status-dot", status?.enabled ? "running" : "stopped")} />
              <Badge variant={status?.enabled ? "success" : "muted"}>
                {status?.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {status?.enabled && (
                  <p className="text-xs text-muted-foreground">
                    New AP clients are redirected to the captive portal on port 80.
                  </p>
                )}
                {isAdmin && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Portal Title</label>
                      <Input
                        value={portalTitle}
                        onChange={(e) => setPortalTitle(e.target.value)}
                        placeholder="Welcome title"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Message</label>
                      <textarea
                        value={portalMessage}
                        onChange={(e) => setPortalMessage(e.target.value)}
                        placeholder="Message shown to users"
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => enableMutation.mutate()}
                        loading={enableMutation.isPending}
                        disabled={isBusy}
                      >
                        <Globe className="w-3.5 h-3.5 mr-1.5" />
                        {status?.enabled ? "Update & Re-enable" : "Enable Portal"}
                      </Button>
                      {status?.enabled && (
                        <Button
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => disableMutation.mutate()}
                          loading={disableMutation.isPending}
                          disabled={isBusy}
                        >
                          Disable
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Allowed Devices */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle>Allowed Devices ({status?.allowed_macs.length ?? 0})</CardTitle>
            {isAdmin && (status?.allowed_macs.length ?? 0) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-7 text-xs"
                onClick={() => clearMutation.mutate()}
                loading={clearMutation.isPending}
                disabled={isBusy}
              >
                Clear All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              {!status?.allowed_macs.length ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Users className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">No devices have accepted the portal yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {status.allowed_macs.map((mac) => (
                    <div
                      key={mac}
                      className="flex items-center gap-2 px-3 py-2 rounded bg-secondary/30"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      <span className="font-mono text-xs">{mac}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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

  const { data: wifiStatus, isLoading: wifiLoading } = useQuery({
    queryKey: ["wifi-status"],
    queryFn: networkApi.getWifiStatus,
    refetchInterval: 5000,
  });

  const { data: scanResults, isFetching: scanning, refetch: startScan } = useQuery({
    queryKey: ["wifi-scan"],
    queryFn: networkApi.scanWifi,
    enabled: false,
  });

  const { data: savedNetworks } = useQuery({
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
          <TabsTrigger value="ports">
            <Network className="w-3.5 h-3.5 mr-1.5" />
            Open Ports
          </TabsTrigger>
          <TabsTrigger value="adblocker">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Ad Blocker
          </TabsTrigger>
          <TabsTrigger value="scanner">
            <ScanLine className="w-3.5 h-3.5 mr-1.5" />
            Port Scanner
          </TabsTrigger>
          <TabsTrigger value="portal">
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Captive Portal
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
                    onClick={() =>
                      updateApMutation.mutate({
                        ...apForm,
                        // null tells the backend to keep the existing password
                        password: apForm.password || null,
                      })
                    }
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

        {/* Gift 6: Open ports tab */}
        <TabsContent value="ports">
          <OpenPortsTab />
        </TabsContent>

        <TabsContent value="adblocker">
          <AdBlockerTab />
        </TabsContent>

        <TabsContent value="scanner">
          <PortScannerTab />
        </TabsContent>

        <TabsContent value="portal">
          <CaptivePortalTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
