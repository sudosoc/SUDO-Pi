import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Radar, RefreshCw, Wifi, Smartphone, Laptop, Router, Cpu,
  HelpCircle, ChevronDown, ChevronUp, Search,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScannedDevice {
  ip: string;
  mac: string;
  hostname: string | null;
  vendor: string | null;
  source: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vendorIcon(vendor: string | null) {
  if (!vendor) return HelpCircle;
  const v = vendor.toLowerCase();
  if (v.includes("apple") || v.includes("iphone") || v.includes("ipad")) return Smartphone;
  if (v.includes("raspberry") || v.includes("espressif") || v.includes("arduino")) return Cpu;
  if (v.includes("tp-link") || v.includes("cisco") || v.includes("ubiquiti") || v.includes("mikrotik")) return Router;
  if (v.includes("samsung") || v.includes("google") || v.includes("huawei") || v.includes("xiaomi") || v.includes("oneplus")) return Smartphone;
  if (v.includes("intel") || v.includes("dell") || v.includes("lenovo") || v.includes("asus") || v.includes("hp ")) return Laptop;
  return Wifi;
}

function macToColor(mac: string): string {
  const hash = mac.replace(/:/g, "").slice(0, 6);
  const num = parseInt(hash, 16) % 360;
  return `hsl(${num}, 60%, 55%)`;
}

function sourceLabel(source: string) {
  switch (source) {
    case "dnsmasq":  return { label: "DHCP",   cls: "bg-blue-500/20 text-blue-400" };
    case "arp":      return { label: "ARP",    cls: "bg-violet-500/20 text-violet-400" };
    case "arp-scan": return { label: "Active", cls: "bg-amber-500/20 text-amber-400" };
    case "nmap":     return { label: "Nmap",   cls: "bg-orange-500/20 text-orange-400" };
    default:         return { label: source,   cls: "bg-muted text-muted-foreground" };
  }
}

// ─── DeviceRow ────────────────────────────────────────────────────────────────

function DeviceRow({ device }: { device: ScannedDevice }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = vendorIcon(device.vendor);
  const color = macToColor(device.mac);
  const src = sourceLabel(device.source);

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 transition-colors">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
          style={{ background: `${color}18`, borderColor: `${color}40` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium font-mono">{device.ip}</span>
            {device.hostname && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{device.hostname}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5">{device.mac}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {device.vendor ?? "Unknown vendor"}
          </span>
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", src.cls)}>
            {src.label}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">IP Address</p>
            <p className="font-mono text-xs">{device.ip}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">MAC Address</p>
            <p className="font-mono text-xs">{device.mac}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Hostname</p>
            <p className="font-mono text-xs">{device.hostname ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Manufacturer</p>
            <p className="text-xs">{device.vendor ?? "Unknown"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Discovered via</p>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", src.cls)}>
              {src.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NetworkScannerPage() {
  const [activeMode, setActiveMode] = useState(false);
  const [filter, setFilter] = useState("");

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<ScannedDevice[]>({
    queryKey: ["network-scan", activeMode],
    queryFn: async () => {
      const { data } = await apiClient.get<ScannedDevice[]>(
        `/network-scanner${activeMode ? "?active=true" : ""}`
      );
      return data;
    },
    staleTime: 30_000,
  });

  const devices = data ?? [];
  const filtered = filter
    ? devices.filter((d) =>
        d.ip.includes(filter) ||
        d.mac.toLowerCase().includes(filter.toLowerCase()) ||
        (d.hostname ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        (d.vendor ?? "").toLowerCase().includes(filter.toLowerCase())
      )
    : devices;

  const vendors = [...new Set(devices.map((d) => d.vendor ?? "Unknown"))].sort();
  const lastScan = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Network Scanner</h2>
            <p className="text-sm text-muted-foreground">
              Devices discovered on the access-point subnet.
              {lastScan && <span className="ml-2 text-xs">Last scan: {lastScan}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={activeMode}
              onChange={(e) => setActiveMode(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary"
            />
            Active scan <span className="text-xs text-muted-foreground">(arp-scan / nmap)</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            {isFetching ? "Scanning…" : "Scan Now"}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="py-3">
            <CardContent className="text-center p-0">
              <p className="text-2xl font-bold text-primary">{devices.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Devices</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="text-center p-0">
              <p className="text-2xl font-bold text-blue-400">
                {devices.filter((d) => d.source === "dnsmasq").length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">via DHCP</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="text-center p-0">
              <p className="text-2xl font-bold text-violet-400">
                {devices.filter((d) => d.source === "arp").length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">via ARP</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="text-center p-0">
              <p className="text-2xl font-bold text-green-400">{vendors.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Manufacturers</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter */}
      {data && devices.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by IP, MAC, hostname, vendor…"
            className="pl-8 text-sm"
          />
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Device list */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {filter ? "No devices match your filter." : "No devices found. Try enabling active scan or refresh."}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((device) => (
            <DeviceRow key={`${device.mac}-${device.ip}`} device={device} />
          ))}
        </div>
      )}

      {/* Vendor breakdown */}
      {data && vendors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Manufacturers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {vendors.map((vendor) => {
              const count = devices.filter((d) => (d.vendor ?? "Unknown") === vendor).length;
              return (
                <button
                  key={vendor}
                  onClick={() => setFilter(vendor === "Unknown" ? "" : vendor)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-secondary/40 hover:bg-secondary/70 transition-colors text-xs"
                >
                  <span>{vendor}</span>
                  <span className="text-muted-foreground">×{count}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
