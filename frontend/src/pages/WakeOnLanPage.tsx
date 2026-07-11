import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Power, Plus, Trash2, Pencil, RefreshCw, Zap, Wifi, WifiOff, X, CheckCircle2,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface WolDevice {
  id: number;
  name: string;
  mac: string;
  ip: string;
  broadcast: string;
  online?: boolean | null;
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }
  return { msg, toast };
}

function DeviceForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial?: Partial<WolDevice>;
  onSave: (d: { name: string; mac: string; ip: string; broadcast: string }) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mac, setMac] = useState(initial?.mac ?? "");
  const [ip, setIp] = useState(initial?.ip ?? "");
  const [broadcast, setBroadcast] = useState(initial?.broadcast ?? "255.255.255.255");

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Power className="w-4 h-4 text-primary" />
          {initial?.id ? "Edit Device" : "Add Device"}
          <Button variant="ghost" size="icon-sm" onClick={onCancel} className="ml-auto">
            <X className="w-3.5 h-3.5" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-sm px-3 py-2 rounded-lg border border-red-500/30 text-red-400 bg-red-500/5">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Device name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Living Room PC" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">MAC address</Label>
            <Input
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">IP address <span className="text-muted-foreground">(for ping check, optional)</span></Label>
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.100" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Broadcast address</Label>
            <Input value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="255.255.255.255" className="font-mono" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onSave({ name, mac, ip, broadcast })}
            disabled={saving || !name.trim() || !mac.trim()}
            className="gap-1.5"
          >
            {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WakeOnLanPage() {
  const qc = useQueryClient();
  const { msg, toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState<WolDevice | null>(null);
  const [formError, setFormError] = useState("");
  const [wakingId, setWakingId] = useState<number | null>(null);

  const { data: devices = [], isLoading, refetch, isFetching } = useQuery<WolDevice[]>({
    queryKey: ["wol-devices"],
    queryFn: async () => {
      const { data } = await apiClient.get<WolDevice[]>("/wol/devices");
      return data;
    },
    refetchInterval: 15_000,
  });

  const addMut = useMutation({
    mutationFn: async (d: { name: string; mac: string; ip: string; broadcast: string }) => {
      await apiClient.post("/wol/devices", d, {});
    },
    onSuccess: () => {
      toast("Device added.");
      setShowForm(false);
      setFormError("");
      qc.invalidateQueries({ queryKey: ["wol-devices"] });
    },
    onError: (e) => setFormError(getApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: async (d: { id: number; name: string; mac: string; ip: string; broadcast: string }) => {
      await apiClient.put(`/wol/devices/${d.id}`, d, {});
    },
    onSuccess: () => {
      toast("Device updated.");
      setEditDevice(null);
      setFormError("");
      qc.invalidateQueries({ queryKey: ["wol-devices"] });
    },
    onError: (e) => setFormError(getApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/wol/devices/${id}`);
    },
    onSuccess: () => {
      toast("Device removed.");
      qc.invalidateQueries({ queryKey: ["wol-devices"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const wakeMut = useMutation({
    mutationFn: async (id: number) => {
      setWakingId(id);
      const { data } = await apiClient.post<{ status: string; name: string }>(`/wol/devices/${id}/wake`, {}, {});
      return data;
    },
    onSuccess: (data) => {
      toast(`Magic packet sent to ${data.name}!`);
      setWakingId(null);
    },
    onError: (e) => {
      toast(getApiError(e), false);
      setWakingId(null);
    },
  });

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Power className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Wake-on-LAN</h2>
            <p className="text-sm text-muted-foreground">
              Send magic packets to wake sleeping devices on your network.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => { setShowForm(true); setEditDevice(null); setFormError(""); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Device
          </Button>
        </div>
      </div>

      {msg && (
        <div className={cn(
          "text-sm px-3 py-2 rounded-lg border",
          msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5",
        )}>
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saved Devices</p>
          <p className="text-xl font-bold mt-1">{devices.length}</p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Online</p>
          <p className="text-xl font-bold mt-1 text-green-400">
            {devices.filter((d) => d.online === true).length}
          </p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Offline</p>
          <p className="text-xl font-bold mt-1 text-muted-foreground/60">
            {devices.filter((d) => d.online === false).length}
          </p>
        </div>
      </div>

      {/* Add form */}
      {showForm && !editDevice && (
        <DeviceForm
          onSave={(d) => addMut.mutate(d)}
          onCancel={() => { setShowForm(false); setFormError(""); }}
          saving={addMut.isPending}
          error={formError}
        />
      )}

      {/* Device cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Power className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No devices saved yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add a device's MAC address to wake it with one click.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {devices.map((device) =>
            editDevice?.id === device.id ? (
              <div key={device.id} className="sm:col-span-2">
                <DeviceForm
                  initial={device}
                  onSave={(d) => updateMut.mutate({ id: device.id, ...d })}
                  onCancel={() => { setEditDevice(null); setFormError(""); }}
                  saving={updateMut.isPending}
                  error={formError}
                />
              </div>
            ) : (
              <Card key={device.id} className="border-border/60 card-interactive">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative mt-0.5">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        device.online === true
                          ? "bg-green-500/10 border border-green-500/25"
                          : device.online === false
                          ? "bg-muted/60 border border-border/50"
                          : "bg-muted/40 border border-border/30",
                      )}>
                        {device.online === true
                          ? <Wifi className="w-4 h-4 text-green-400" />
                          : device.online === false
                          ? <WifiOff className="w-4 h-4 text-muted-foreground/40" />
                          : <Power className="w-4 h-4 text-muted-foreground/40" />
                        }
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{device.name}</p>
                      <p className="text-xs font-mono text-primary/70 mt-0.5">{device.mac}</p>
                      {device.ip && (
                        <p className="text-[11px] font-mono text-muted-foreground/60">{device.ip}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => wakeMut.mutate(device.id)}
                        disabled={wakeMut.isPending && wakingId === device.id}
                        className="gap-1.5 h-7 px-2.5 text-xs"
                      >
                        {wakeMut.isPending && wakingId === device.id
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <Zap className="w-3 h-3" />
                        }
                        Wake
                      </Button>
                      <div className="flex gap-0.5 justify-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6"
                          onClick={() => { setEditDevice(device); setShowForm(false); setFormError(""); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 text-destructive/60 hover:text-destructive hover:bg-destructive/8"
                          onClick={() => {
                            if (confirm(`Remove ${device.name}?`)) deleteMut.mutate(device.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground/50">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Wake-on-LAN requires the target device to have WoL enabled in its BIOS/firmware and to be
          on the same broadcast domain. Magic packets are sent to ports 7 and 9.
        </p>
      </div>
    </div>
  );
}
