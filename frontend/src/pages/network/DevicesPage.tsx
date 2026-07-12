import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Monitor, MonitorSmartphone, Wifi } from "lucide-react";
import { apiClient } from "@/api/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelative } from "@/lib/utils";
import { DeviceDrawer } from "@/components/layout/DeviceDrawer";
import type { DrawerDevice } from "@/components/layout/DeviceDrawer";
import { cn } from "@/lib/utils";

interface ConnectedDevice {
  mac_address:    string;
  ip_address:     string | null;
  hostname:       string | null;
  vendor:         string | null;
  interface:      string;
  signal_dbm:     number | null;
  connected_since:string | null;
  last_seen:      string | null;
  is_ap_client:   boolean;
}

function signalBars(dbm: number | null): JSX.Element {
  if (dbm === null) return <span className="text-muted-foreground/30">—</span>;
  const pct = dbm >= -50 ? 4 : dbm >= -65 ? 3 : dbm >= -75 ? 2 : 1;
  const color = pct >= 3 ? "bg-success" : pct === 2 ? "bg-warning" : "bg-destructive";
  return (
    <span className="flex items-end gap-0.5 h-3.5" title={`${dbm} dBm`}>
      {[1,2,3,4].map((n) => (
        <span
          key={n}
          className={cn("w-1 rounded-sm transition-colors", n <= pct ? color : "bg-muted-foreground/15")}
          style={{ height: `${n * 25}%` }}
        />
      ))}
    </span>
  );
}

export default function DevicesPage() {
  const [search,        setSearch]        = useState("");
  const [activeDevice,  setActiveDevice]  = useState<DrawerDevice | null>(null);

  const { data: apClients, isLoading: loadingAp, refetch: refetchAp } = useQuery({
    queryKey: ["ap-clients"],
    queryFn: async () => {
      const { data } = await apiClient.get<ConnectedDevice[]>("/network/ap/clients");
      return data;
    },
    refetchInterval: 8_000,
  });

  const { data: arpTable, isLoading: loadingArp, refetch: refetchArp } = useQuery({
    queryKey: ["arp-table"],
    queryFn: async () => {
      const { data } = await apiClient.get<ConnectedDevice[]>("/network/arp");
      return data;
    },
    refetchInterval: 20_000,
  });

  const allDevices: ConnectedDevice[] = [
    ...(apClients ?? []).map((d) => ({ ...d, is_ap_client: true })),
    ...(arpTable ?? [])
      .filter((d) => !(apClients ?? []).some((c) => c.mac_address === d.mac_address))
      .map((d) => ({ ...d, is_ap_client: false })),
  ];

  const filtered = allDevices.filter((d) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      d.mac_address.toLowerCase().includes(term) ||
      (d.ip_address ?? "").toLowerCase().includes(term) ||
      (d.hostname   ?? "").toLowerCase().includes(term) ||
      (d.vendor     ?? "").toLowerCase().includes(term)
    );
  });

  const refresh   = () => { refetchAp(); refetchArp(); };
  const isLoading = loadingAp || loadingArp;

  return (
    <>
      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Input
              placeholder="Search by IP, MAC, hostname…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-3"
            />
          </div>
          <Button variant="outline" size="sm" onClick={refresh} loading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} device{filtered.length !== 1 ? "s" : ""}
          </span>
          <PageHelp
            title="Connected Devices"
            points={[
              "Click any row to open the device inspector",
              "Ping, port-scan, SSH, and Wake-on-LAN from the drawer",
              "AP clients refresh every 8 s · ARP table every 20 s",
            ]}
          />
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                  <Wifi className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{apClients?.length ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">AP Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{allDevices.length}</p>
                  <p className="text-xs text-muted-foreground">Total Devices</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Devices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <SkeletonTable rows={6} cols={6} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MonitorSmartphone}
                title={search ? "No devices match the search" : "No devices connected"}
                description={
                  search
                    ? "Try a different IP, MAC, hostname or vendor."
                    : "Devices that join the SUDO-Pi network will appear here."
                }
              />
            ) : (
              <ScrollArea className="h-[calc(100vh-340px)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Device</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">IP Address</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden md:table-cell">MAC Address</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden lg:table-cell">Interface</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden lg:table-cell">Last Seen</th>
                      <th className="text-center px-4 py-2 text-muted-foreground font-medium text-xs hidden sm:table-cell">Signal</th>
                      <th className="text-center px-4 py-2 text-muted-foreground font-medium text-xs">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((device) => (
                      <tr
                        key={device.mac_address}
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          activeDevice?.mac_address === device.mac_address
                            ? "bg-primary/[0.06] border-primary/20"
                            : "hover:bg-secondary/30",
                        )}
                        onClick={() => setActiveDevice(device)}
                        data-ctx="device"
                        data-ctx-value={device.ip_address ?? device.mac_address}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Monitor className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{device.hostname || "Unknown"}</p>
                              {device.vendor && (
                                <p className="text-xs text-muted-foreground">{device.vendor}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm" data-ctx="ip" data-ctx-value={device.ip_address ?? ""}>
                          {device.ip_address || "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell"
                          data-ctx="mac" data-ctx-value={device.mac_address}
                        >
                          {device.mac_address}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {device.interface}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {device.last_seen
                            ? formatRelative(device.last_seen)
                            : device.connected_since
                            ? formatRelative(device.connected_since)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="flex justify-center">
                            {signalBars(device.signal_dbm)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={device.is_ap_client ? "success" : "muted"}
                            className="text-[10px]"
                          >
                            {device.is_ap_client ? "Wi-Fi AP" : "Network"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Device Inspector Drawer */}
      <DeviceDrawer
        device={activeDevice}
        onClose={() => setActiveDevice(null)}
      />
    </>
  );
}
