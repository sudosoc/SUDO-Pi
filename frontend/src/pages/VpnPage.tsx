import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, ShieldCheck, ShieldOff, Plus, Trash2,
  ChevronUp, ChevronDown, RefreshCw, Upload, X,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatBytes } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WgTunnel {
  name: string;
  interface: string;
  public_key: string | null;
  listen_port: string | null;
  endpoint: string | null;
  allowed_ips: string | null;
  status: "up" | "down";
  rx_bytes: number;
  tx_bytes: number;
  last_handshake: number;
}

interface OvpnConfig {
  name: string;
  path: string;
  status: "active" | "inactive";
}

interface VpnIp {
  ip: string | null;
  connected: boolean;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const vpnApi = {
  getWireguard: async (): Promise<WgTunnel[]> => {
    const { data } = await apiClient.get("/vpn/wireguard");
    return data;
  },
  wgUp: async (name: string): Promise<void> => {
    await apiClient.post(`/vpn/wireguard/${encodeURIComponent(name)}/up`);
  },
  wgDown: async (name: string): Promise<void> => {
    await apiClient.post(`/vpn/wireguard/${encodeURIComponent(name)}/down`);
  },
  saveWgConfig: async (name: string, content: string): Promise<void> => {
    await apiClient.post(`/vpn/wireguard/${encodeURIComponent(name)}/config`, { name, content });
  },
  deleteWgConfig: async (name: string): Promise<void> => {
    await apiClient.delete(`/vpn/wireguard/${encodeURIComponent(name)}`);
  },
  getOpenvpn: async (): Promise<OvpnConfig[]> => {
    const { data } = await apiClient.get("/vpn/openvpn");
    return data;
  },
  ovpnConnect: async (name: string): Promise<void> => {
    await apiClient.post(`/vpn/openvpn/${encodeURIComponent(name)}/connect`);
  },
  ovpnDisconnect: async (name: string): Promise<void> => {
    await apiClient.post(`/vpn/openvpn/${encodeURIComponent(name)}/disconnect`);
  },
  saveOvpnConfig: async (name: string, content: string): Promise<void> => {
    await apiClient.post(`/vpn/openvpn/${encodeURIComponent(name)}/config`, { name, content });
  },
  deleteOvpnConfig: async (name: string): Promise<void> => {
    await apiClient.delete(`/vpn/openvpn/${encodeURIComponent(name)}`);
  },
  getVpnIp: async (): Promise<VpnIp> => {
    const { data } = await apiClient.get("/vpn/ip");
    return data;
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function VpnIpBanner({
  vpnIp,
  wgTunnels,
  onQuickConnect,
}: {
  vpnIp: VpnIp | undefined;
  wgTunnels: WgTunnel[] | undefined;
  onQuickConnect: (name: string) => void;
}) {
  const tunnelsUp = wgTunnels?.filter((t) => t.status === "up") ?? [];
  const tunnelsDown = wgTunnels?.filter((t) => t.status === "down") ?? [];

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 space-y-3",
        vpnIp?.connected
          ? "border-green-500/30 bg-green-500/10"
          : "border-border bg-card/60",
      )}
    >
      <div className="flex items-center gap-3">
        {vpnIp?.connected ? (
          <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" />
        ) : (
          <ShieldOff className="w-5 h-5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {vpnIp?.connected ? "VPN Protected" : "VPN Disconnected"}
          </p>
          {vpnIp?.ip ? (
            <p className="text-xs text-green-400/80 font-mono">{vpnIp.ip}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No VPN IP detected</p>
          )}
        </div>
        {tunnelsUp.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">
              {tunnelsUp.length} tunnel{tunnelsUp.length > 1 ? "s" : ""} active
            </span>
          </div>
        )}
      </div>

      {/* Quick-connect row: show stopped tunnels as one-click buttons */}
      {!vpnIp?.connected && tunnelsDown.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
          <span className="text-xs text-muted-foreground self-center">Quick connect:</span>
          {tunnelsDown.map((t) => (
            <button
              key={t.name}
              onClick={() => onQuickConnect(t.name)}
              className="h-6 px-2.5 rounded-md border border-primary/40 text-xs text-primary bg-primary/5 hover:bg-primary/15 transition-colors font-mono"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportModal({
  type,
  onClose,
  onSave,
}: {
  type: "wireguard" | "openvpn";
  onClose: () => void;
  onSave: (name: string, content: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const placeholder =
    type === "wireguard"
      ? "[Interface]\nPrivateKey = ...\nAddress = 10.0.0.2/24\n\n[Peer]\nPublicKey = ...\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0"
      : "client\ndev tun\nproto udp\nremote vpn.example.com 1194\n...";

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ title: "Config content required", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), content);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            Import {type === "wireguard" ? "WireGuard" : "OpenVPN"} Config
          </h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Config Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === "wireguard" ? "wg0" : "myvpn"}
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">
            Configuration Content
          </label>
          <textarea
            className="w-full h-52 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} loading={saving}>
            <Upload className="w-4 h-4 mr-1.5" />
            Save Config
          </Button>
        </div>
      </div>
    </div>
  );
}

function WgTunnelRow({
  tunnel,
  onToggle,
  onDelete,
}: {
  tunnel: WgTunnel;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isUp = tunnel.status === "up";
  const lastHandshakeDate =
    tunnel.last_handshake > 0
      ? new Date(tunnel.last_handshake * 1000).toLocaleString()
      : "Never";

  const truncKey = (key: string | null) =>
    key ? key.slice(0, 12) + "…" + key.slice(-6) : "—";

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full shrink-0",
              isUp ? "bg-green-400" : "bg-muted-foreground/50",
            )}
          />
          <span className="font-mono font-semibold text-sm">{tunnel.name}</span>
          <Badge variant={isUp ? "success" : "muted"} className="text-[10px]">
            {isUp ? "Running" : "Stopped"}
          </Badge>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant={isUp ? "outline" : "default"}
            className={cn("h-7 text-xs", isUp && "text-destructive border-destructive/40 hover:bg-destructive/10")}
            onClick={onToggle}
          >
            {isUp ? (
              <>
                <ChevronDown className="w-3 h-3 mr-1" /> Down
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3 mr-1" /> Up
              </>
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Public Key</span>
          <span className="font-mono">{truncKey(tunnel.public_key)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Endpoint</span>
          <span className="font-mono">{tunnel.endpoint ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Allowed IPs</span>
          <span className="font-mono">{tunnel.allowed_ips ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Handshake</span>
          <span>{lastHandshakeDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">RX</span>
          <span className="text-green-400">{formatBytes(tunnel.rx_bytes)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TX</span>
          <span className="text-blue-400">{formatBytes(tunnel.tx_bytes)}</span>
        </div>
      </div>
    </div>
  );
}

function OvpnConfigRow({
  config,
  onConnect,
  onDisconnect,
  onDelete,
}: {
  config: OvpnConfig;
  onConnect: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}) {
  const isActive = config.status === "active";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "inline-block w-2 h-2 rounded-full shrink-0",
            isActive ? "bg-green-400" : "bg-muted-foreground/50",
          )}
        />
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium truncate">{config.name}</p>
          <p className="text-xs text-muted-foreground truncate">{config.path}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant={isActive ? "success" : "muted"} className="text-[10px]">
          {isActive ? "Active" : "Inactive"}
        </Badge>
        {isActive ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        ) : (
          <Button size="sm" className="h-7 text-xs" onClick={onConnect}>
            Connect
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VpnPage() {
  const queryClient = useQueryClient();
  const [importModal, setImportModal] = useState<"wireguard" | "openvpn" | null>(null);

  const { data: vpnIp } = useQuery({
    queryKey: ["vpn-ip"],
    queryFn: vpnApi.getVpnIp,
    refetchInterval: 5000,
  });

  const { data: wgTunnels, isLoading: wgLoading } = useQuery({
    queryKey: ["wg-tunnels"],
    queryFn: vpnApi.getWireguard,
    refetchInterval: 5000,
  });

  const { data: ovpnConfigs, isLoading: ovpnLoading } = useQuery({
    queryKey: ["ovpn-configs"],
    queryFn: vpnApi.getOpenvpn,
    refetchInterval: 5000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["wg-tunnels"] });
    queryClient.invalidateQueries({ queryKey: ["ovpn-configs"] });
    queryClient.invalidateQueries({ queryKey: ["vpn-ip"] });
  };

  const wgToggle = useMutation({
    mutationFn: async ({ name, status }: { name: string; status: "up" | "down" }) => {
      if (status === "up") {
        await vpnApi.wgDown(name);
      } else {
        await vpnApi.wgUp(name);
      }
    },
    onSuccess: (_data, { name, status }) => {
      toast({
        title: `WireGuard ${status === "up" ? "stopped" : "started"}`,
        description: `Tunnel ${name} is now ${status === "up" ? "down" : "up"}`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: (_err, { name }) => {
      toast({ title: "Error", description: `Failed to toggle tunnel ${name}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const wgDelete = useMutation({
    mutationFn: vpnApi.deleteWgConfig,
    onSuccess: (_, name) => {
      toast({ title: "Deleted", description: `WireGuard config ${name} deleted`, variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: (_, name) => {
      toast({ title: "Error", description: `Failed to delete ${name}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const wgSave = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      vpnApi.saveWgConfig(name, content),
    onSuccess: (_, { name }) => {
      toast({ title: "Saved", description: `WireGuard config ${name} saved`, variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save WireGuard config", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const ovpnConnect = useMutation({
    mutationFn: vpnApi.ovpnConnect,
    onSuccess: (_, name) => {
      toast({ title: "Connected", description: `OpenVPN ${name} started`, variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: (_, name) => {
      toast({ title: "Error", description: `Failed to connect ${name}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const ovpnDisconnect = useMutation({
    mutationFn: vpnApi.ovpnDisconnect,
    onSuccess: (_, name) => {
      toast({ title: "Disconnected", description: `OpenVPN ${name} stopped`, variant: "default" } as { title: string; description: string; variant: "default" });
      invalidate();
    },
    onError: (_, name) => {
      toast({ title: "Error", description: `Failed to disconnect ${name}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const ovpnDelete = useMutation({
    mutationFn: vpnApi.deleteOvpnConfig,
    onSuccess: (_, name) => {
      toast({ title: "Deleted", description: `OpenVPN config ${name} deleted`, variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: (_, name) => {
      toast({ title: "Error", description: `Failed to delete ${name}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const ovpnSave = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      vpnApi.saveOvpnConfig(name, content),
    onSuccess: (_, { name }) => {
      toast({ title: "Saved", description: `OpenVPN config ${name} saved`, variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save OpenVPN config", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      {importModal && (
        <ImportModal
          type={importModal}
          onClose={() => setImportModal(null)}
          onSave={async (name, content) => {
            if (importModal === "wireguard") {
              await wgSave.mutateAsync({ name, content });
            } else {
              await ovpnSave.mutateAsync({ name, content });
            }
            setImportModal(null);
          }}
        />
      )}

      {/* VPN IP Banner */}
      <VpnIpBanner
        vpnIp={vpnIp}
        wgTunnels={wgTunnels}
        onQuickConnect={(name) => wgToggle.mutate({ name, status: "down" })}
      />

      {/* Tabs */}
      <Tabs defaultValue="wireguard">
        <TabsList>
          <TabsTrigger value="wireguard">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            WireGuard
          </TabsTrigger>
          <TabsTrigger value="openvpn">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            OpenVPN
          </TabsTrigger>
        </TabsList>

        {/* ── WireGuard Tab ─────────────────────────────────────── */}
        <TabsContent value="wireguard" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>WireGuard Tunnels</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["wg-tunnels"] })}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" onClick={() => setImportModal("wireguard")}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Import Config
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {wgLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : !wgTunnels?.length ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Shield className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No WireGuard tunnels configured</p>
                  <p className="text-xs mt-1">Import a .conf file to get started</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[32rem]">
                  <div className="space-y-3 pr-1">
                    {wgTunnels.map((tunnel) => (
                      <WgTunnelRow
                        key={tunnel.name}
                        tunnel={tunnel}
                        onToggle={() =>
                          wgToggle.mutate({ name: tunnel.name, status: tunnel.status })
                        }
                        onDelete={() => {
                          if (confirm(`Delete WireGuard config "${tunnel.name}"?`)) {
                            wgDelete.mutate(tunnel.name);
                          }
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── OpenVPN Tab ───────────────────────────────────────── */}
        <TabsContent value="openvpn" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>OpenVPN Configurations</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["ovpn-configs"] })}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" onClick={() => setImportModal("openvpn")}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Import Config
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ovpnLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : !ovpnConfigs?.length ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ShieldCheck className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No OpenVPN configs found</p>
                  <p className="text-xs mt-1">Import a .ovpn file to get started</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[32rem]">
                  <div className="space-y-2 pr-1">
                    {ovpnConfigs.map((cfg) => (
                      <OvpnConfigRow
                        key={cfg.name}
                        config={cfg}
                        onConnect={() => ovpnConnect.mutate(cfg.name)}
                        onDisconnect={() => ovpnDisconnect.mutate(cfg.name)}
                        onDelete={() => {
                          if (confirm(`Delete OpenVPN config "${cfg.name}"?`)) {
                            ovpnDelete.mutate(cfg.name);
                          }
                        }}
                      />
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
