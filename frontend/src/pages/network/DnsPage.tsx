import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Plus, Trash2, Server, Tag, Network,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DnsRecord {
  hostname: string;
  ip: string;
}

interface StaticLease {
  mac: string;
  ip: string;
  hostname: string | null;
}

interface DnsData {
  records: DnsRecord[];
  leases: StaticLease[];
  upstream: string[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

const dnsApi = {
  getAll: async (): Promise<DnsData> => {
    const { data } = await apiClient.get("/dns");
    return {
      records: Array.isArray(data?.records) ? data.records : [],
      leases: Array.isArray(data?.leases) ? data.leases : [],
      upstream: Array.isArray(data?.upstream) ? data.upstream : [],
    };
  },
  addRecord: async (hostname: string, ip: string) => {
    const { data } = await apiClient.post("/dns/records", { hostname, ip });
    return data;
  },
  deleteRecord: async (hostname: string) => {
    await apiClient.delete(`/dns/records/${encodeURIComponent(hostname)}`);
  },
  addLease: async (mac: string, ip: string, hostname: string | null) => {
    const { data } = await apiClient.post("/dns/leases", { mac, ip, hostname });
    return data;
  },
  deleteLease: async (mac: string) => {
    await apiClient.delete(`/dns/leases/${encodeURIComponent(mac)}`);
  },
};

// ─── DNS Records Card ─────────────────────────────────────────────────────────

function RecordsCard({ records, loading }: { records: DnsRecord[]; loading: boolean }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [hostname, setHostname] = useState("");
  const [ip, setIp] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dns"] });

  const addMut = useMutation({
    mutationFn: () => dnsApi.addRecord(hostname.trim(), ip.trim()),
    onSuccess: () => {
      toast({ title: "DNS record added", variant: "success" } as { title: string; variant: "success" });
      setHostname("");
      setIp("");
      invalidate();
    },
    onError: (err) =>
      toast({ title: "Failed to add record", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (h: string) => dnsApi.deleteRecord(h),
    onSuccess: () => {
      toast({ title: "Record removed", variant: "success" } as { title: string; variant: "success" });
      invalidate();
    },
    onError: (err) =>
      toast({ title: "Failed to remove", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const requestDelete = async (h: string) => {
    const ok = await confirm({
      title: `Delete ${h}?`,
      description: "Clients will no longer resolve this hostname on the local network.",
      confirmLabel: "Delete",
      severity: "danger",
    });
    if (ok) delMut.mutate(h);
  };

  const canAdd = hostname.trim().length > 0 && ip.trim().length > 0;

  return (
    <Card>
      {dialog}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5" />
          Local DNS Records
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <p className="text-xs text-muted-foreground mb-1">Hostname</p>
            <Input
              placeholder="nas.local"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-1">IP address</p>
            <Input
              placeholder="192.168.4.50"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button
            className="gap-1.5"
            disabled={!canAdd}
            loading={addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <SkeletonList count={3} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No local DNS records"
            description="Map a friendly hostname to any IP on your network — e.g. nas.local → 192.168.4.50."
          />
        ) : (
          <div className="space-y-1.5">
            {records.map((r) => (
              <div
                key={r.hostname}
                className="group flex items-center gap-3 rounded-xl border border-border/70 px-4 py-2.5"
              >
                <Globe className="w-4 h-4 text-info shrink-0" />
                <span className="font-mono text-sm">{r.hostname}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="font-mono text-sm text-muted-foreground">{r.ip}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => requestDelete(r.hostname)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Static Leases Card ───────────────────────────────────────────────────────

function LeasesCard({ leases, loading }: { leases: StaticLease[]; loading: boolean }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [mac, setMac] = useState("");
  const [ip, setIp] = useState("");
  const [hostname, setHostname] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dns"] });

  const addMut = useMutation({
    mutationFn: () => dnsApi.addLease(mac.trim(), ip.trim(), hostname.trim() || null),
    onSuccess: () => {
      toast({ title: "Static lease added", variant: "success" } as { title: string; variant: "success" });
      setMac(""); setIp(""); setHostname("");
      invalidate();
    },
    onError: (err) =>
      toast({ title: "Failed to add lease", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (m: string) => dnsApi.deleteLease(m),
    onSuccess: () => {
      toast({ title: "Lease removed", variant: "success" } as { title: string; variant: "success" });
      invalidate();
    },
    onError: (err) =>
      toast({ title: "Failed to remove", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const requestDelete = async (m: string) => {
    const ok = await confirm({
      title: "Remove static reservation?",
      description: "This device will get a dynamic IP from the DHCP pool on its next lease.",
      confirmLabel: "Remove",
      severity: "danger",
    });
    if (ok) delMut.mutate(m);
  };

  const canAdd = mac.trim().length === 17 && ip.trim().length > 0;

  return (
    <Card>
      {dialog}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Network className="w-3.5 h-3.5" />
          Static IP Reservations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[150px]">
            <p className="text-xs text-muted-foreground mb-1">MAC address</p>
            <Input
              placeholder="aa:bb:cc:dd:ee:ff"
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <p className="text-xs text-muted-foreground mb-1">IP address</p>
            <Input
              placeholder="192.168.4.50"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <p className="text-xs text-muted-foreground mb-1">Hostname (optional)</p>
            <Input
              placeholder="printer"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button
            className="gap-1.5"
            disabled={!canAdd}
            loading={addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            <Plus className="w-3.5 h-3.5" />
            Reserve
          </Button>
        </div>

        {loading ? (
          <SkeletonList count={2} />
        ) : leases.length === 0 ? (
          <EmptyState
            icon={Network}
            title="No static reservations"
            description="Pin a device to a fixed IP so it's always reachable at the same address."
          />
        ) : (
          <div className="space-y-1.5">
            {leases.map((l) => (
              <div
                key={l.mac}
                className="group flex items-center gap-3 rounded-xl border border-border/70 px-4 py-2.5"
              >
                <Network className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-sm">
                    {l.ip}
                    {l.hostname && <span className="text-muted-foreground"> · {l.hostname}</span>}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">{l.mac}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => requestDelete(l.mac)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DnsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dns"],
    queryFn: dnsApi.getAll,
    refetchInterval: 30000,
  });

  return (
    <div className="p-6 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">DNS &amp; DHCP</h2>
          <PageHelp
            title="DNS & DHCP"
            points={[
              "Map local hostnames to IPs (nas.local → 192.168.4.50)",
              "Reserve a fixed IP for a device by MAC",
              "Records apply to every client on the SUDO-Pi network",
              "Backed by dnsmasq — changes reload instantly",
            ]}
          />
        </div>
        {data?.upstream && data.upstream.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server className="w-3.5 h-3.5" />
            Upstream:
            {data.upstream.slice(0, 3).map((s) => (
              <Badge key={s} variant="outline" className="font-mono text-[10px]">{s}</Badge>
            ))}
          </div>
        )}
      </div>

      <RecordsCard records={data?.records ?? []} loading={isLoading} />
      <LeasesCard leases={data?.leases ?? []} loading={isLoading} />
    </div>
  );
}
