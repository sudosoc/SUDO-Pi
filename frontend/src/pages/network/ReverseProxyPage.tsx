import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight, RefreshCw, Plus, Trash2, Pencil, Globe, CheckCircle2, XCircle, X,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ProxyHost {
  name: string;
  domain: string;
  upstream_host: string;
  upstream_port: number;
  enabled: boolean;
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  }
  return { msg, toast };
}

function HostForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial?: Partial<ProxyHost>;
  onSave: (h: Omit<ProxyHost, "enabled">) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [upstreamHost, setUpstreamHost] = useState(initial?.upstream_host ?? "127.0.0.1");
  const [upstreamPort, setUpstreamPort] = useState(initial?.upstream_port ?? 3000);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ArrowLeftRight className="w-4 h-4 text-primary" />
          {initial?.name ? "Edit Proxy Host" : "Add Proxy Host"}
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
            <Label className="text-xs">Internal name <span className="text-muted-foreground">(no spaces)</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              disabled={!!initial?.name}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Domain (served by nginx)</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Upstream host</Label>
            <Input
              value={upstreamHost}
              onChange={(e) => setUpstreamHost(e.target.value)}
              placeholder="127.0.0.1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Upstream port</Label>
            <Input
              type="number"
              min={1}
              max={65535}
              value={upstreamPort}
              onChange={(e) => setUpstreamPort(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onSave({ name, domain, upstream_host: upstreamHost, upstream_port: upstreamPort })}
            disabled={saving || !name.trim() || !domain.trim() || !upstreamHost.trim()}
            className="gap-1.5"
          >
            {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          nginx will proxy <code className="font-mono text-[11px]">http://{domain || "domain"}/</code>{" "}
          → <code className="font-mono text-[11px]">http://{upstreamHost || "host"}:{upstreamPort}/</code>{" "}
          and write a config file to <code className="font-mono text-[11px]">/etc/nginx/sites-available/</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export default function ReverseProxyPage() {
  const qc = useQueryClient();
  const { msg, toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editHost, setEditHost] = useState<ProxyHost | null>(null);
  const [formError, setFormError] = useState("");

  const { data: hosts = [], isLoading, refetch, isFetching } = useQuery<ProxyHost[]>({
    queryKey: ["reverse-proxy"],
    queryFn: async () => {
      const { data } = await apiClient.get<ProxyHost[]>("/reverse-proxy");
      return data;
    },
    staleTime: 30_000,
  });

  const addMut = useMutation({
    mutationFn: async (h: Omit<ProxyHost, "enabled">) => {
      await apiClient.post("/reverse-proxy", { ...h, enabled: true }, {});
    },
    onSuccess: () => {
      toast("Proxy host added and nginx reloaded.");
      setShowForm(false);
      setFormError("");
      qc.invalidateQueries({ queryKey: ["reverse-proxy"] });
    },
    onError: (e) => setFormError(getApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: async (h: ProxyHost) => {
      await apiClient.put(`/reverse-proxy/${h.name}`, h, {});
    },
    onSuccess: () => {
      toast("Proxy host updated.");
      setEditHost(null);
      setFormError("");
      qc.invalidateQueries({ queryKey: ["reverse-proxy"] });
    },
    onError: (e) => setFormError(getApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(`/reverse-proxy/${name}`);
    },
    onSuccess: (_, name) => {
      toast(`Host '${name}' deleted.`);
      qc.invalidateQueries({ queryKey: ["reverse-proxy"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      await apiClient.patch(`/reverse-proxy/${name}/toggle`, { enabled }, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reverse-proxy"] }),
    onError: (e) => toast(getApiError(e), false),
  });

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Reverse Proxy Manager</h2>
            <p className="text-sm text-muted-foreground">
              Route domains to local services via nginx virtual hosts.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => { setShowForm(true); setEditHost(null); setFormError(""); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Host
          </Button>
        </div>
      </div>

      {msg && (
        <div className={cn(
          "text-sm px-3 py-2 rounded-lg border",
          msg.ok
            ? "border-green-500/30 text-green-400 bg-green-500/5"
            : "border-red-500/30 text-red-400 bg-red-500/5",
        )}>
          {msg.text}
        </div>
      )}

      {/* Add form */}
      {showForm && !editHost && (
        <HostForm
          onSave={(h) => addMut.mutate(h)}
          onCancel={() => { setShowForm(false); setFormError(""); }}
          saving={addMut.isPending}
          error={formError}
        />
      )}

      {/* Host list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : hosts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No proxy hosts configured</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add a host to route a domain to a local service.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {hosts.map((host) =>
            editHost?.name === host.name ? (
              <HostForm
                key={host.name}
                initial={host}
                onSave={(h) => updateMut.mutate({ ...h, enabled: host.enabled })}
                onCancel={() => { setEditHost(null); setFormError(""); }}
                saving={updateMut.isPending}
                error={formError}
              />
            ) : (
              <Card key={host.name} className={cn(
                "transition-colors border",
                host.enabled ? "border-border/60" : "border-border/30 opacity-60",
              )}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {host.enabled
                      ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      : <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{host.name}</span>
                        <span className="text-xs text-muted-foreground/60">·</span>
                        <span className="text-xs font-mono text-primary/80">{host.domain}</span>
                        <span className="text-xs text-muted-foreground/60">→</span>
                        <span className="text-xs font-mono text-muted-foreground/70">
                          {host.upstream_host}:{host.upstream_port}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleMut.mutate({ name: host.name, enabled: !host.enabled })}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                          host.enabled
                            ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                            : "bg-muted/60 border-border/50 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {host.enabled ? "On" : "Off"}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => { setEditHost(host); setShowForm(false); setFormError(""); }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive/60 hover:text-destructive hover:bg-destructive/8"
                        onClick={() => {
                          if (confirm(`Delete proxy host '${host.name}'?`)) {
                            deleteMut.mutate(host.name);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground/50">
        Configs are written to <code className="font-mono">/etc/nginx/sites-available/sudopi-proxy-*.conf</code>.
        nginx is reloaded automatically after every change.
      </p>
    </div>
  );
}
