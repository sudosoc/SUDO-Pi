import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, Plus, Trash2, RefreshCw, Share2, Info,
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
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortForward {
  num: number;
  proto: string;
  src_port: string;
  dest_host: string;
  dest_port: string;
  comment: string;
}

interface NewForwardForm {
  proto: "tcp" | "udp";
  src_port: string;
  dest_host: string;
  dest_port: string;
  comment: string;
}

const EMPTY_FORM: NewForwardForm = {
  proto: "tcp",
  src_port: "",
  dest_host: "",
  dest_port: "",
  comment: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidIp(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s) &&
    s.split(".").every((p) => parseInt(p) <= 255);
}

function isValidPort(s: string): boolean {
  const n = parseInt(s, 10);
  return !isNaN(n) && n >= 1 && n <= 65535;
}

// ─── Add Form ─────────────────────────────────────────────────────────────────

function AddForm({ onAdd }: { onAdd: () => void }) {
  const [form, setForm] = useState<NewForwardForm>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const addMut = useMutation({
    mutationFn: () =>
      apiClient.post("/firewall/port-forwards", {
        proto: form.proto,
        src_port: parseInt(form.src_port),
        dest_host: form.dest_host.trim(),
        dest_port: parseInt(form.dest_port),
        comment: form.comment.trim(),
      }),
    onSuccess: () => {
      toast({ title: "Port forward added", variant: "success" } as { title: string; variant: "success" });
      setForm(EMPTY_FORM);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["port-forwards"] });
      onAdd();
    },
    onError: (err) =>
      toast({ title: "Failed to add rule", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const canSubmit =
    isValidPort(form.src_port) &&
    isValidIp(form.dest_host) &&
    isValidPort(form.dest_port);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Rule
      </Button>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Share2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">New Port Forward</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => { setOpen(false); setForm(EMPTY_FORM); }}>
            Cancel
          </Button>
        </div>

        {/* Protocol */}
        <div className="flex gap-2">
          {(["tcp", "udp"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setForm((f) => ({ ...f, proto: p }))}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                form.proto === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Ports */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">External Port</p>
            <Input
              placeholder="e.g. 8080"
              value={form.src_port}
              onChange={(e) => setForm((f) => ({ ...f, src_port: e.target.value }))}
              className={cn("h-8 text-sm font-mono", form.src_port && !isValidPort(form.src_port) && "border-destructive")}
            />
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground mt-4" />
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Destination IP</p>
            <Input
              placeholder="e.g. 192.168.1.50"
              value={form.dest_host}
              onChange={(e) => setForm((f) => ({ ...f, dest_host: e.target.value }))}
              className={cn("h-8 text-sm font-mono", form.dest_host && !isValidIp(form.dest_host) && "border-destructive")}
            />
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground mt-4" />
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Dest. Port</p>
            <Input
              placeholder="e.g. 80"
              value={form.dest_port}
              onChange={(e) => setForm((f) => ({ ...f, dest_port: e.target.value }))}
              className={cn("h-8 text-sm font-mono", form.dest_port && !isValidPort(form.dest_port) && "border-destructive")}
            />
          </div>
        </div>

        {/* Comment */}
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Comment (optional)</p>
          <Input
            placeholder="e.g. Jellyfin web UI"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
            className="h-8 text-sm"
            maxLength={64}
          />
        </div>

        <Button
          className="w-full"
          disabled={!canSubmit}
          loading={addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          Add Port Forward
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Rule Row ─────────────────────────────────────────────────────────────────

function RuleRow({ rule, onDelete }: { rule: PortForward; onDelete: () => void }) {
  const { confirm, dialog } = useConfirm();
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/firewall/port-forwards/${rule.num}`),
    onSuccess: () => {
      toast({ title: "Rule deleted", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["port-forwards"] });
      onDelete();
    },
    onError: (err) =>
      toast({ title: "Delete failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete port forward?",
      description: `This will remove the rule forwarding port ${rule.src_port} to ${rule.dest_host}:${rule.dest_port}.`,
      confirmLabel: "Delete",
      severity: "danger",
    });
    if (ok) deleteMut.mutate();
  };

  return (
    <>
      {dialog}
      <tr className="border-b border-border/40 hover:bg-secondary/20 group">
        <td className="px-4 py-3">
          <Badge variant="outline" className={cn("text-[10px]", rule.proto === "tcp" ? "text-cyan-400 border-cyan-400/30" : "text-violet-400 border-violet-400/30")}>
            {rule.proto.toUpperCase()}
          </Badge>
        </td>
        <td className="px-4 py-3 font-mono text-sm font-bold text-foreground">
          :{rule.src_port}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          <ArrowRight className="w-4 h-4" />
        </td>
        <td className="px-4 py-3 font-mono text-sm">
          {rule.dest_host}:{rule.dest_port}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground/70 hidden sm:table-cell">
          {rule.comment || <span className="italic opacity-40">—</span>}
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleDelete}
            loading={deleteMut.isPending}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </td>
      </tr>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortForwardPage() {
  const queryClient = useQueryClient();

  const { data: rules, isLoading, refetch, isRefetching } = useQuery<PortForward[]>({
    queryKey: ["port-forwards"],
    queryFn: async () => {
      const { data } = await apiClient.get("/firewall/port-forwards");
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const refresh = () => { refetch(); };

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Share2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Port Forwards</h2>
            <p className="text-sm text-muted-foreground">
              iptables NAT rules that redirect incoming traffic to an internal host and port.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} loading={isRefetching}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <PageHelp
            title="Port Forwards"
            points={[
              "Forwards an external port on the Pi to an internal IP:port",
              "Uses iptables DNAT — rules persist until the Pi is rebooted unless saved",
              "To make rules permanent, install iptables-persistent and run netfilter-persistent save",
              "Common use: expose a Docker container or service at a different port",
            ]}
          />
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/90 leading-relaxed">
          These rules are stored in iptables and will be lost on reboot unless you use{" "}
          <code className="font-mono text-amber-300">iptables-persistent</code>. Run{" "}
          <code className="font-mono text-amber-300">netfilter-persistent save</code> in your terminal to persist them.
        </p>
      </div>

      {/* Add form */}
      <AddForm onAdd={() => queryClient.invalidateQueries({ queryKey: ["port-forwards"] })} />

      {/* Table */}
      {isLoading ? (
        <SkeletonList count={4} />
      ) : !rules?.length ? (
        <EmptyState
          icon={Share2}
          title="No port forwards yet"
          description="Add a rule above to forward an external port to an internal host."
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Active Rules
              <Badge variant="secondary" className="text-xs">{rules.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Proto</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Ext. Port</th>
                    <th className="px-4 py-2" />
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Destination</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Comment</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <RuleRow key={rule.num} rule={rule} onDelete={refresh} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
