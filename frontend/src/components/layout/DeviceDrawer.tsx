import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Clipboard, Globe, HardDrive, Laptop, Network,
  Power, Radio, Search, Shield, Star, Terminal, Timer, Wifi, X,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { useWatchlistStore } from "@/stores/watchlistStore";

// ── types ─────────────────────────────────────────────────────────────────────

export interface DrawerDevice {
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

interface PingResult { success: boolean; time_ms: number | null; host: string }
interface WolResult  { success: boolean }

// ── helpers ───────────────────────────────────────────────────────────────────

function signalQuality(dbm: number | null): { label: string; color: string } {
  if (dbm === null) return { label: "—",        color: "text-muted-foreground/40" };
  if (dbm >= -50)   return { label: "Excellent", color: "text-success" };
  if (dbm >= -65)   return { label: "Good",      color: "text-success/70" };
  if (dbm >= -75)   return { label: "Fair",      color: "text-warning" };
  return              { label: "Weak",       color: "text-destructive" };
}

function Row({ icon: Icon, label, value, mono = false, action }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground/50 leading-none mb-0.5">{label}</p>
        <p className={cn("text-[12.5px] text-foreground/90 truncate", mono && "font-mono")}>{value}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── drawer ────────────────────────────────────────────────────────────────────

interface DeviceDrawerProps {
  device:  DrawerDevice | null;
  onClose: () => void;
}

export function DeviceDrawer({ device, onClose }: DeviceDrawerProps) {
  const navigate = useNavigate();
  const { toggle, isWatched } = useWatchlistStore();
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [wolSent,    setWolSent]    = useState(false);

  const watched = device ? isWatched(device.mac_address) : false;

  const pingMut = useMutation<PingResult>({
    mutationFn: async () => {
      const { data } = await apiClient.post<PingResult>("/network/ping", {
        host: device?.ip_address ?? device?.mac_address,
      });
      return data;
    },
    onSuccess: (d) => setPingResult(d),
  });

  const wolMut = useMutation<WolResult>({
    mutationFn: async () => {
      const { data } = await apiClient.post<WolResult>("/network/wol", {
        mac: device?.mac_address,
      });
      return data;
    },
    onSuccess: () => setWolSent(true),
  });

  const open = !!device;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col",
          "bg-background/95 backdrop-blur-2xl border-l border-border/50",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ boxShadow: open ? "-20px 0 60px hsl(260 50% 3%/0.5)" : "none" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border/40 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            {device?.is_ap_client ? (
              <Wifi className="w-5 h-5 text-primary" />
            ) : (
              <Laptop className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[13px] truncate">{device?.hostname || "Unknown device"}</p>
            <p className="text-[11px] text-muted-foreground/60 truncate">{device?.vendor ?? device?.mac_address}</p>
          </div>
          <button
            onClick={() => device && toggle(device.mac_address)}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
              watched
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-muted-foreground/25 hover:text-yellow-400/60",
            )}
            title={watched ? "Remove from watchlist" : "Add to watchlist"}
          >
            <Star className={cn("w-4 h-4", watched && "fill-current")} />
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {device && (
            <>
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <Badge variant={device.is_ap_client ? "success" : "muted"} className="text-[10px]">
                  {device.is_ap_client ? "● Wi-Fi AP Client" : "Network Device"}
                </Badge>
                {device.signal_dbm !== null && (
                  <Badge variant="outline" className={cn("text-[10px]", signalQuality(device.signal_dbm).color)}>
                    <Radio className="w-2.5 h-2.5 mr-1" />
                    {device.signal_dbm} dBm · {signalQuality(device.signal_dbm).label}
                  </Badge>
                )}
              </div>

              {/* Info rows */}
              <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-1">
                <Row
                  icon={Globe}
                  label="IP Address"
                  value={device.ip_address ?? "—"}
                  mono
                  action={
                    device.ip_address && (
                      <button
                        onClick={() => navigator.clipboard.writeText(device.ip_address!)}
                        className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors"
                        title="Copy IP"
                      >
                        <Clipboard className="w-3 h-3" />
                      </button>
                    )
                  }
                />
                <Row
                  icon={HardDrive}
                  label="MAC Address"
                  value={device.mac_address}
                  mono
                  action={
                    <button
                      onClick={() => navigator.clipboard.writeText(device.mac_address)}
                      className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors"
                      title="Copy MAC"
                    >
                      <Clipboard className="w-3 h-3" />
                    </button>
                  }
                />
                <Row icon={Laptop}   label="Hostname"  value={device.hostname  ?? "—"} />
                <Row icon={Shield}   label="Vendor"    value={device.vendor    ?? "—"} />
                <Row icon={Network}  label="Interface" value={device.interface} mono />
                {device.connected_since && (
                  <Row icon={Timer} label="Connected since" value={formatRelative(device.connected_since)} />
                )}
                {device.last_seen && (
                  <Row icon={Activity} label="Last seen" value={formatRelative(device.last_seen)} />
                )}
              </div>

              {/* Ping */}
              <div className="rounded-xl border border-border/40 bg-card/50 p-3 space-y-2.5">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50">Actions</p>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] flex-1"
                    onClick={() => { setPingResult(null); pingMut.mutate(); }}
                    loading={pingMut.isPending}
                    disabled={!device.ip_address}
                  >
                    <Activity className="w-3 h-3 mr-1.5" /> Ping
                  </Button>
                  {pingResult && (
                    <span className={cn(
                      "text-[11px] tabular-nums font-medium px-2 py-1 rounded-lg",
                      pingResult.success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                    )}>
                      {pingResult.success ? `${pingResult.time_ms?.toFixed(1)} ms` : "Unreachable"}
                    </span>
                  )}
                  {pingMut.isError && (
                    <span className="text-[11px] text-destructive/70">Error</span>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] w-full"
                  onClick={() => navigate(`/network?tab=scanner&host=${device.ip_address}`)}
                  disabled={!device.ip_address}
                >
                  <Search className="w-3 h-3 mr-1.5" /> Port Scan
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] w-full"
                  onClick={() => navigate(`/terminal?cmd=ssh ${device.ip_address}`)}
                  disabled={!device.ip_address}
                >
                  <Terminal className="w-3 h-3 mr-1.5" /> Open SSH
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-8 text-[11px] w-full",
                    wolSent && "border-success/30 text-success",
                  )}
                  onClick={() => wolMut.mutate()}
                  loading={wolMut.isPending}
                  disabled={wolSent}
                >
                  <Power className="w-3 h-3 mr-1.5" />
                  {wolSent ? "Wake-on-LAN sent ✓" : "Wake-on-LAN"}
                </Button>
              </div>

              {/* Fingerprint / OS hint from vendor */}
              {device.vendor && (
                <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50 mb-2">Device Identity</p>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    MAC OUI registered to <span className="text-foreground font-medium">{device.vendor}</span>.
                    {device.is_ap_client && device.signal_dbm && (
                      <> Signal strength {device.signal_dbm} dBm ({signalQuality(device.signal_dbm).label.toLowerCase()}).</>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
