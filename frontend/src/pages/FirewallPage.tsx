import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, ShieldOff, Trash2, Plus, RefreshCw,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FirewallRule {
  number: number;
  to: string;
  action: string;
  direction: string;
  from_: string;
  comment: string;
}

interface FirewallStatus {
  enabled: boolean;
  default_incoming: string;
  default_outgoing: string;
  default_routed: string;
  rules: FirewallRule[];
}

interface AddRuleForm {
  direction: string;
  action: string;
  proto: string;
  port: string;
  from_ip: string;
  comment: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const firewallApi = {
  getStatus: async (): Promise<FirewallStatus> => {
    const { data } = await apiClient.get("/firewall/status");
    return data;
  },
  enable: async (): Promise<void> => {
    await apiClient.post("/firewall/enable");
  },
  disable: async (): Promise<void> => {
    await apiClient.post("/firewall/disable");
  },
  reload: async (): Promise<void> => {
    await apiClient.post("/firewall/reload");
  },
  addRule: async (rule: AddRuleForm): Promise<void> => {
    await apiClient.post("/firewall/rules", rule);
  },
  deleteRule: async (number: number): Promise<void> => {
    await apiClient.delete(`/firewall/rules/${number}`);
  },
  setDefault: async (direction: string, policy: string): Promise<void> => {
    await apiClient.post("/firewall/default", { direction, policy });
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const upper = action.toUpperCase();
  const cls =
    upper === "ALLOW"
      ? "bg-green-500/15 text-green-400 border-green-500/30"
      : upper === "DENY"
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : upper === "REJECT"
      ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
      : "bg-muted text-muted-foreground border-border";

  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border", cls)}>
      {upper}
    </span>
  );
}

function DirectionIcon({ direction }: { direction: string }) {
  const d = direction.toUpperCase();
  if (d === "OUT") return <ArrowUpFromLine className="w-3.5 h-3.5 text-blue-400" />;
  if (d === "FWD") return <ArrowLeftRight className="w-3.5 h-3.5 text-yellow-400" />;
  return <ArrowDownToLine className="w-3.5 h-3.5 text-green-400" />;
}

function PolicyBadge({ policy }: { policy: string }) {
  const p = policy.toLowerCase();
  const variant =
    p === "allow" ? "success" : p === "deny" ? "destructive" : "warning";
  return (
    <Badge variant={variant as "success" | "destructive" | "warning"} className="text-[10px] capitalize">
      {p}
    </Badge>
  );
}

function DefaultPoliciesCard({
  status,
  onSetDefault,
}: {
  status: FirewallStatus;
  onSetDefault: (direction: string, policy: string) => void;
}) {
  const policies = ["allow", "deny", "reject"];
  const directions = [
    { key: "incoming", label: "Incoming", current: status.default_incoming },
    { key: "outgoing", label: "Outgoing", current: status.default_outgoing },
    { key: "routed", label: "Routed", current: status.default_routed },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Default Policies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {directions.map(({ key, label, current }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-20">{label}</span>
              <PolicyBadge policy={current} />
            </div>
            <div className="flex gap-1">
              {policies
                .filter((p) => p !== current.toLowerCase())
                .map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onSetDefault(key, p)}
                  >
                    {p}
                  </Button>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AddRuleForm({
  onAdd,
  isPending,
}: {
  onAdd: (form: AddRuleForm) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<AddRuleForm>({
    direction: "in",
    action: "allow",
    proto: "tcp",
    port: "",
    from_ip: "any",
    comment: "",
  });

  const set = (key: keyof AddRuleForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    onAdd(form);
  };

  const selectClass =
    "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Rule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
            <select className={selectClass} value={form.direction} onChange={(e) => set("direction", e.target.value)}>
              <option value="in">Incoming</option>
              <option value="out">Outgoing</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Action</label>
            <select className={selectClass} value={form.action} onChange={(e) => set("action", e.target.value)}>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="reject">Reject</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Protocol</label>
            <select className={selectClass} value={form.proto} onChange={(e) => set("proto", e.target.value)}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="any">Any</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Port</label>
            <Input
              placeholder="22 / 80:443"
              value={form.port}
              onChange={(e) => set("port", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">From IP</label>
            <Input
              placeholder="any / 192.168.1.0/24"
              value={form.from_ip}
              onChange={(e) => set("from_ip", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Comment</label>
            <Input
              placeholder="Optional label"
              value={form.comment}
              onChange={(e) => set("comment", e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleSubmit} loading={isPending}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FirewallPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["firewall-status"],
    queryFn: firewallApi.getStatus,
    refetchInterval: 10000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["firewall-status"] });

  const enableMutation = useMutation({
    mutationFn: firewallApi.enable,
    onSuccess: () => {
      toast({ title: "UFW Enabled", description: "Firewall is now active", variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to enable UFW", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: firewallApi.disable,
    onSuccess: () => {
      toast({ title: "UFW Disabled", description: "Firewall is now inactive", variant: "default" } as { title: string; description: string; variant: "default" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disable UFW", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const reloadMutation = useMutation({
    mutationFn: firewallApi.reload,
    onSuccess: () => {
      toast({ title: "Reloaded", description: "UFW rules reloaded", variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reload UFW", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: firewallApi.addRule,
    onSuccess: () => {
      toast({ title: "Rule Added", description: "Firewall rule has been created", variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add firewall rule", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: firewallApi.deleteRule,
    onSuccess: (_, num) => {
      toast({ title: "Rule Deleted", description: `Rule #${num} removed`, variant: "success" } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: (_, num) => {
      toast({ title: "Error", description: `Failed to delete rule #${num}`, variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ direction, policy }: { direction: string; policy: string }) =>
      firewallApi.setDefault(direction, policy),
    onSuccess: (_, { direction, policy }) => {
      toast({
        title: "Policy Updated",
        description: `Default ${direction} set to ${policy}`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      invalidate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update default policy", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    },
  });

  const enabled = status?.enabled ?? false;

  return (
    <div className="p-6 space-y-6">
      {/* ── Status Header ────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center justify-between gap-4 rounded-xl border p-5",
          enabled
            ? "border-green-500/30 bg-green-500/10"
            : "border-red-500/30 bg-red-500/10",
        )}
      >
        <div className="flex items-center gap-3">
          {enabled ? (
            <ShieldCheck className="w-8 h-8 text-green-400" />
          ) : (
            <ShieldOff className="w-8 h-8 text-red-400" />
          )}
          <div>
            <h2 className="text-lg font-semibold">
              UFW {enabled ? "Enabled" : "Disabled"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? `${status?.rules.length ?? 0} rules active`
                : "Firewall is not protecting this system"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => invalidate()}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          {enabled ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reloadMutation.mutate()}
                loading={reloadMutation.isPending}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Reload
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Disable UFW firewall? This will remove all protection.")) {
                    disableMutation.mutate();
                  }
                }}
                loading={disableMutation.isPending}
              >
                Disable
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => enableMutation.mutate()}
              loading={enableMutation.isPending}
            >
              Enable UFW
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : status ? (
        <>
          {/* ── Default Policies ──────────────────────────────── */}
          <DefaultPoliciesCard
            status={status}
            onSetDefault={(direction, policy) =>
              setDefaultMutation.mutate({ direction, policy })
            }
          />

          {/* ── Rules Table ───────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rules ({status.rules.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {status.rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShieldCheck className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No rules configured</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[28rem]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-muted-foreground font-medium py-2 px-4 w-10">#</th>
                        <th className="text-left text-muted-foreground font-medium py-2 px-2 w-16">Dir</th>
                        <th className="text-left text-muted-foreground font-medium py-2 px-2">Action</th>
                        <th className="text-left text-muted-foreground font-medium py-2 px-2">From</th>
                        <th className="text-left text-muted-foreground font-medium py-2 px-2">To / Port</th>
                        <th className="text-left text-muted-foreground font-medium py-2 px-2">Comment</th>
                        <th className="w-8 py-2 px-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {status.rules.map((rule) => (
                        <tr
                          key={rule.number}
                          className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2 px-4 font-mono text-muted-foreground">{rule.number}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <DirectionIcon direction={rule.direction} />
                              <span className="text-muted-foreground">{rule.direction}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <ActionBadge action={rule.action} />
                          </td>
                          <td className="py-2 px-2 font-mono text-foreground/80">{rule.from_}</td>
                          <td className="py-2 px-2 font-mono text-foreground/80">{rule.to}</td>
                          <td className="py-2 px-2 text-muted-foreground">{rule.comment || "—"}</td>
                          <td className="py-2 px-2">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete rule #${rule.number}?`)) {
                                  deleteRuleMutation.mutate(rule.number);
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* ── Add Rule Form ─────────────────────────────────── */}
          <AddRuleForm
            onAdd={(form) => addRuleMutation.mutate(form)}
            isPending={addRuleMutation.isPending}
          />
        </>
      ) : null}
    </div>
  );
}
