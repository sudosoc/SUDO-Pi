import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive, Usb, BarChart3, RefreshCw, LogOut, MountainSnow,
  Unplug, Trash2,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockDevice {
  name: string;
  path: string;
  fstype: string | null;
  size: string;
  mountpoint: string | null;
  label: string | null;
  uuid: string | null;
  type: string;
  ro: boolean;
  children?: BlockDevice[];
}

interface UsbDevice {
  bus: string;
  device: string;
  id: string;
  name: string;
}

interface DiskUsage {
  device: string;
  size_bytes: number;
  used_bytes: number;
  avail_bytes: number;
  percent: number;
  mountpoint: string;
}

function fmtBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
  if (b >= 1e9)  return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6)  return `${(b / 1e6).toFixed(0)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const storageApi = {
  getDevices: async (): Promise<BlockDevice[]> => {
    const { data } = await apiClient.get("/storage/devices");
    return data;
  },
  getUsb: async (): Promise<UsbDevice[]> => {
    const { data } = await apiClient.get("/storage/usb");
    return data;
  },
  getUsage: async (): Promise<DiskUsage[]> => {
    const { data } = await apiClient.get("/storage/usage");
    return data;
  },
  mount: async (device: string, mountpoint: string, fstype?: string): Promise<void> => {
    await apiClient.post("/storage/mount", { device, mountpoint, fstype });
  },
  unmount: async (path: string): Promise<void> => {
    await apiClient.post("/storage/unmount", { path });
  },
  format: async (device: string, fstype: string, label: string): Promise<void> => {
    await apiClient.post("/storage/format", { device, fstype, label });
  },
  eject: async (device: string): Promise<void> => {
    await apiClient.post("/storage/eject", { device });
  },
};

// ─── Mount Modal ──────────────────────────────────────────────────────────────

function MountModal({
  device,
  onClose,
  onMount,
}: {
  device: string;
  onClose: () => void;
  onMount: (device: string, mountpoint: string, fstype?: string) => Promise<void>;
}) {
  const [mountpoint, setMountpoint] = useState(`/mnt/${device.replace(/\//g, "").replace(/dev/, "")}`);
  const [fstype, setFstype] = useState("");
  const [saving, setSaving] = useState(false);

  const handleMount = async () => {
    if (!mountpoint.trim()) {
      toast({ title: "Mountpoint required", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onMount(device, mountpoint.trim(), fstype.trim() || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
        <h3 className="font-semibold">Mount Device</h3>
        <p className="text-sm text-muted-foreground font-mono">{device}</p>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Mountpoint</label>
          <Input value={mountpoint} onChange={(e) => setMountpoint(e.target.value)} placeholder="/mnt/usb" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Filesystem Type (optional)</label>
          <Select value={fstype} onValueChange={setFstype}>
            <SelectTrigger>
              <SelectValue placeholder="Auto-detect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto-detect</SelectItem>
              <SelectItem value="ext4">ext4</SelectItem>
              <SelectItem value="ext3">ext3</SelectItem>
              <SelectItem value="ntfs">ntfs</SelectItem>
              <SelectItem value="vfat">vfat (FAT32)</SelectItem>
              <SelectItem value="exfat">exfat</SelectItem>
              <SelectItem value="xfs">xfs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleMount} loading={saving}>
            <MountainSnow className="w-3.5 h-3.5 mr-1.5" />
            Mount
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Format Modal ─────────────────────────────────────────────────────────────

function FormatModal({
  device,
  onClose,
  onFormat,
}: {
  device: string;
  onClose: () => void;
  onFormat: (device: string, fstype: string, label: string) => Promise<void>;
}) {
  const [fstype, setFstype] = useState("ext4");
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFormat = async () => {
    if (confirm !== device) {
      toast({ title: "Type the device path to confirm", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onFormat(device, fstype, label);
      toast({ title: "Format complete", variant: "success" } as { title: string; variant: "success" });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
        <h3 className="font-semibold text-destructive">Format Device</h3>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          This will permanently erase all data on <span className="font-mono font-bold">{device}</span>.
          This cannot be undone.
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Filesystem</label>
          <Select value={fstype} onValueChange={setFstype}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ext4">ext4</SelectItem>
              <SelectItem value="ext3">ext3</SelectItem>
              <SelectItem value="vfat">vfat (FAT32)</SelectItem>
              <SelectItem value="exfat">exfat</SelectItem>
              <SelectItem value="ntfs">ntfs</SelectItem>
              <SelectItem value="xfs">xfs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Label (optional)</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="DATA" maxLength={16} />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Type <span className="font-mono text-destructive">{device}</span> to confirm
          </label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={device}
            className="font-mono border-destructive/50 focus:border-destructive"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleFormat}
            loading={saving}
            disabled={confirm !== device}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Format
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Block Device Row ─────────────────────────────────────────────────────────

function BlockDeviceRow({
  device,
  depth,
  onMount,
  onUnmount,
  onFormat,
  onEject,
}: {
  device: BlockDevice;
  depth: number;
  onMount: (dev: string) => void;
  onUnmount: (path: string) => void;
  onFormat: (dev: string) => void;
  onEject: (dev: string) => void;
}) {
  const isDisk = device.type === "disk";

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0 text-sm",
          depth > 0 && "pl-6",
        )}
      >
        <HardDrive className={cn("w-4 h-4 shrink-0", isDisk ? "text-primary" : "text-muted-foreground")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-medium">{device.name}</span>
            {device.label && <Badge variant="secondary" className="text-[10px]">{device.label}</Badge>}
            {device.fstype && <Badge variant="outline" className="text-[10px] font-mono">{device.fstype}</Badge>}
            {device.ro && <Badge variant="destructive" className="text-[10px]">RO</Badge>}
          </div>
          {device.mountpoint && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">→ {device.mountpoint}</p>
          )}
          {device.uuid && (
            <p className="text-[10px] text-muted-foreground/50 font-mono">{device.uuid}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{device.size}</span>
        <div className="flex gap-1 shrink-0">
          {device.mountpoint ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() => onUnmount(device.mountpoint!)}
            >
              <Unplug className="w-3 h-3 mr-1" />
              Unmount
            </Button>
          ) : device.fstype ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() => onMount(device.path)}
            >
              <MountainSnow className="w-3 h-3 mr-1" />
              Mount
            </Button>
          ) : null}
          {!isDisk && device.fstype && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] text-destructive hover:bg-destructive/10"
              onClick={() => onFormat(device.path)}
            >
              Format
            </Button>
          )}
          {isDisk && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => onEject(device.path)}
              title="Eject"
            >
              <LogOut className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      {device.children?.map((child) => (
        <BlockDeviceRow
          key={child.name}
          device={child}
          depth={depth + 1}
          onMount={onMount}
          onUnmount={onUnmount}
          onFormat={onFormat}
          onEject={onEject}
        />
      ))}
    </>
  );
}

// ─── Disk Usage Bar ───────────────────────────────────────────────────────────

function UsageBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-yellow-400" : "bg-primary",
        )}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoragePage() {
  const queryClient = useQueryClient();
  const [mountTarget, setMountTarget] = useState<string | null>(null);
  const [formatTarget, setFormatTarget] = useState<string | null>(null);

  const { data: devices, isLoading: devLoading } = useQuery({
    queryKey: ["storage-devices"],
    queryFn: storageApi.getDevices,
    refetchInterval: 10000,
  });

  const { data: usbDevices, isLoading: usbLoading } = useQuery({
    queryKey: ["usb-devices"],
    queryFn: storageApi.getUsb,
    refetchInterval: 10000,
  });

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["disk-usage"],
    queryFn: storageApi.getUsage,
    refetchInterval: 15000,
  });

  const mountDevice = useMutation({
    mutationFn: ({ device, mountpoint, fstype }: { device: string; mountpoint: string; fstype?: string }) =>
      storageApi.mount(device, mountpoint, fstype),
    onSuccess: (_, { device }) => {
      toast({ title: "Device mounted", description: device, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
      queryClient.invalidateQueries({ queryKey: ["disk-usage"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Mount failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const unmountDevice = useMutation({
    mutationFn: (path: string) => storageApi.unmount(path),
    onSuccess: (_, path) => {
      toast({ title: "Device unmounted", description: path, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
      queryClient.invalidateQueries({ queryKey: ["disk-usage"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Unmount failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const formatDevice = useMutation({
    mutationFn: ({ device, fstype, label }: { device: string; fstype: string; label: string }) =>
      storageApi.format(device, fstype, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Format failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const ejectDevice = useMutation({
    mutationFn: (device: string) => storageApi.eject(device),
    onSuccess: (_, device) => {
      toast({ title: "Device ejected", description: device, variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({ title: "Eject failed", description: err?.response?.data?.detail ?? "Unknown error", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["storage-devices"] });
    queryClient.invalidateQueries({ queryKey: ["usb-devices"] });
    queryClient.invalidateQueries({ queryKey: ["disk-usage"] });
  };

  return (
    <div className="p-6 space-y-6">
      {mountTarget && (
        <MountModal
          device={mountTarget}
          onClose={() => setMountTarget(null)}
          onMount={async (device, mountpoint, fstype) => {
            await mountDevice.mutateAsync({ device, mountpoint, fstype });
          }}
        />
      )}
      {formatTarget && (
        <FormatModal
          device={formatTarget}
          onClose={() => setFormatTarget(null)}
          onFormat={async (device, fstype, label) => {
            await formatDevice.mutateAsync({ device, fstype, label });
            setFormatTarget(null);
          }}
        />
      )}

      <Tabs defaultValue="devices">
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="devices">
              <HardDrive className="w-3.5 h-3.5 mr-1.5" />
              Block Devices
            </TabsTrigger>
            <TabsTrigger value="usb">
              <Usb className="w-3.5 h-3.5 mr-1.5" />
              USB Devices
            </TabsTrigger>
            <TabsTrigger value="usage">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              Disk Usage
            </TabsTrigger>
          </TabsList>
          <Button size="icon-sm" variant="ghost" onClick={invalidateAll}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* ── Block Devices ─────────────────────────────────────── */}
        <TabsContent value="devices" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Block Devices</CardTitle>
            </CardHeader>
            <CardContent>
              {devLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : !devices?.length ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <HardDrive className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No block devices found</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[40rem]">
                  <div className="pr-1">
                    {devices.map((dev) => (
                      <BlockDeviceRow
                        key={dev.name}
                        device={dev}
                        depth={0}
                        onMount={(d) => setMountTarget(d)}
                        onUnmount={(path) => unmountDevice.mutate(path)}
                        onFormat={(d) => setFormatTarget(d)}
                        onEject={(d) => {
                          if (window.confirm(`Eject ${d}?`)) ejectDevice.mutate(d);
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USB Devices ───────────────────────────────────────── */}
        <TabsContent value="usb" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>USB Devices</CardTitle>
            </CardHeader>
            <CardContent>
              {usbLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : !usbDevices?.length ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Usb className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No USB devices detected</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[40rem]">
                  <div className="space-y-2 pr-1">
                    {usbDevices.map((usb, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3">
                        <Usb className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{usb.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            ID: {usb.id} · Bus {usb.bus}, Device {usb.device}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Disk Usage ────────────────────────────────────────── */}
        <TabsContent value="usage" className="mt-4">
          {/* Gift 3 — warning banner when any disk is critically full */}
          {usage && usage.some((fs) => fs.percent >= 85) && (
            <div className="mb-4 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-destructive mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-destructive">Disk Space Warning</p>
                <div className="mt-1 space-y-0.5">
                  {usage.filter((fs) => fs.percent >= 85).map((fs, i) => (
                    <p key={i} className="text-xs text-destructive/90">
                      <span className="font-mono font-bold">{fs.mountpoint}</span> is{" "}
                      <span className="font-bold">{fs.percent.toFixed(0)}% full</span>
                      {" "}— only {fmtBytes(fs.avail_bytes)} remaining
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Disk Usage</CardTitle>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : !usage?.length ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No filesystem data available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {usage.map((fs, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <span className="font-mono font-medium">{fs.mountpoint}</span>
                          <span className="text-muted-foreground text-xs ml-2 truncate hidden sm:inline">
                            {fs.device}
                          </span>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span
                            className={cn(
                              "font-bold text-sm",
                              fs.percent >= 90 ? "text-destructive" : fs.percent >= 75 ? "text-yellow-400" : "text-foreground",
                            )}
                          >
                            {fs.percent.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <UsageBar percent={fs.percent} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{fmtBytes(fs.used_bytes)} used</span>
                        <span>{fmtBytes(fs.avail_bytes)} free of {fmtBytes(fs.size_bytes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
