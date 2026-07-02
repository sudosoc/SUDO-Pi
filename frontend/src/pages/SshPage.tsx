import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key, Plus, Trash2, RefreshCw, Terminal, Users, Settings2,
  Copy, CheckCheck, AlertTriangle, Power,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SshConfig {
  [key: string]: string;
}

interface SshStatus {
  active: boolean;
  port: number | null;
  password_auth: boolean;
  pubkey_auth: boolean;
  permit_root: boolean;
}

interface AuthorizedKey {
  index: number;
  type: string;
  key: string;
  comment: string;
  raw: string;
}

interface SshSession {
  user: string;
  from: string;
  pid: number;
  started: string;
  idle: string;
  jcpu: string;
  pcpu: string;
  command: string;
}

interface GenerateKeyResult {
  public_key: string;
  private_key: string;
  key_type: string;
  comment: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const sshApi = {
  getConfig: async (): Promise<SshConfig> => {
    const { data } = await apiClient.get("/ssh/config");
    return data;
  },
  getStatus: async (): Promise<SshStatus> => {
    const { data } = await apiClient.get("/ssh/status");
    return data;
  },
  updateConfig: async (key: string, value: string): Promise<void> => {
    await apiClient.put("/ssh/config", { key, value });
  },
  restartSsh: async (): Promise<void> => {
    await apiClient.post("/ssh/restart");
  },
  getKeys: async (user: string): Promise<AuthorizedKey[]> => {
    const { data } = await apiClient.get(`/ssh/keys/${encodeURIComponent(user)}`);
    return Array.isArray(data) ? data : [];
  },
  addKey: async (user: string, key: string): Promise<void> => {
    await apiClient.post(`/ssh/keys/${encodeURIComponent(user)}`, { key });
  },
  deleteKey: async (user: string, index: number): Promise<void> => {
    await apiClient.delete(`/ssh/keys/${encodeURIComponent(user)}/${index}`);
  },
  generateKey: async (key_type: string, comment: string): Promise<GenerateKeyResult> => {
    const { data } = await apiClient.post("/ssh/generate", { key_type, comment });
    return data;
  },
  getSessions: async (): Promise<SshSession[]> => {
    const { data } = await apiClient.get("/ssh/sessions");
    return Array.isArray(data) ? data : [];
  },
};

// ─── Config Row ───────────────────────────────────────────────────────────────

const CONFIG_KEYS = [
  { key: "Port", label: "Port", description: "SSH listen port" },
  { key: "PasswordAuthentication", label: "Password Auth", description: "Allow password login" },
  { key: "PubkeyAuthentication", label: "Pubkey Auth", description: "Allow public key login" },
  { key: "PermitRootLogin", label: "Permit Root Login", description: "Allow root SSH access" },
  { key: "MaxAuthTries", label: "Max Auth Tries", description: "Max authentication attempts" },
  { key: "LoginGraceTime", label: "Login Grace Time", description: "Time to complete login" },
  { key: "X11Forwarding", label: "X11 Forwarding", description: "Allow X11 forwarding" },
];

function ConfigRow({
  keyName,
  label,
  description,
  currentValue,
  onSave,
}: {
  keyName: string;
  label: string;
  description: string;
  currentValue: string | undefined;
  onSave: (key: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue ?? "");

  const handleSave = () => {
    if (!value.trim()) return;
    onSave(keyName, value.trim());
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {editing ? (
        <div className="flex gap-2 items-center">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 w-36 text-sm font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {currentValue ?? "—"}
          </span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setValue(currentValue ?? ""); setEditing(true); }}>
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Keys Tab ─────────────────────────────────────────────────────────────────

function KeysTab() {
  const queryClient = useQueryClient();
  const [targetUser, setTargetUser] = useState("pi");
  const [inputUser, setInputUser] = useState("pi");
  const [newKey, setNewKey] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genType, setGenType] = useState<"ed25519" | "rsa" | "ecdsa">("ed25519");
  const [genComment, setGenComment] = useState("sudo-pi-generated");
  const [generatedResult, setGeneratedResult] = useState<GenerateKeyResult | null>(null);
  const [copiedField, setCopiedField] = useState<"public" | "private" | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["ssh-keys", targetUser],
    queryFn: () => sshApi.getKeys(targetUser),
  });

  const addKey = useMutation({
    mutationFn: () => sshApi.addKey(targetUser, newKey),
    onSuccess: () => {
      toast({ title: "Key added", variant: "success" } as { title: string; variant: "success" });
      setNewKey("");
      queryClient.invalidateQueries({ queryKey: ["ssh-keys", targetUser] });
    },
    onError: () => {
      toast({ title: "Failed to add key", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const deleteKey = useMutation({
    mutationFn: (index: number) => sshApi.deleteKey(targetUser, index),
    onSuccess: () => {
      toast({ title: "Key removed", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["ssh-keys", targetUser] });
    },
    onError: () => {
      toast({ title: "Failed to remove key", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const generateKey = useMutation({
    mutationFn: () => sshApi.generateKey(genType, genComment),
    onSuccess: (result) => {
      setGeneratedResult(result);
    },
    onError: () => {
      toast({ title: "Failed to generate key", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, field: "public" | "private") => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* User selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              value={inputUser}
              onChange={(e) => setInputUser(e.target.value)}
              placeholder="Username (e.g. pi)"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={() => setTargetUser(inputUser.trim())}
              disabled={!inputUser.trim()}
            >
              Load Keys
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Showing authorized_keys for: <span className="font-mono text-foreground">{targetUser}</span>
          </p>
        </CardContent>
      </Card>

      {/* Add key */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Add Public Key</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowGenerate(!showGenerate)}>
            <Key className="w-3.5 h-3.5 mr-1.5" />
            Generate Key Pair
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="ssh-ed25519 AAAA... user@host"
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={() => addKey.mutate()}
              disabled={!newKey.trim() || addKey.isPending}
              loading={addKey.isPending}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>

          {showGenerate && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Generate Key Pair on Device</p>
              <div className="flex gap-2 flex-wrap">
                {(["ed25519", "rsa", "ecdsa"] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={genType === t ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setGenType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={genComment}
                  onChange={(e) => setGenComment(e.target.value)}
                  placeholder="Key comment"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => generateKey.mutate()}
                  loading={generateKey.isPending}
                >
                  Generate
                </Button>
              </div>

              {generatedResult && (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">Public Key</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => copyToClipboard(generatedResult.public_key, "public")}
                      >
                        {copiedField === "public" ? (
                          <CheckCheck className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs font-mono break-all text-foreground/80">{generatedResult.public_key}</p>
                  </div>
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-destructive" />
                        <span className="text-xs text-destructive font-medium">Private Key — Save now!</span>
                      </div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => copyToClipboard(generatedResult.private_key, "private")}
                      >
                        {copiedField === "private" ? (
                          <CheckCheck className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs font-mono break-all text-foreground/70 whitespace-pre-wrap">{generatedResult.private_key}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => {
                      setNewKey(generatedResult.public_key);
                      setShowGenerate(false);
                      setGeneratedResult(null);
                    }}
                  >
                    Use This Public Key
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Authorized Keys</CardTitle>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["ssh-keys", targetUser] })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : !keys?.length ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Key className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No authorized keys for {targetUser}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[28rem]">
              <div className="space-y-2 pr-1">
                {keys.map((k) => (
                  <div key={k.index} className="rounded-lg border border-border bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px] font-mono">{k.type}</Badge>
                          {k.comment && (
                            <span className="text-xs text-muted-foreground truncate">{k.comment}</span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">{k.key.slice(0, 48)}…</p>
                      </div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          if (confirm(`Remove this key?`)) deleteKey.mutate(k.index);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["ssh-sessions"],
    queryFn: sshApi.getSessions,
    refetchInterval: 10000,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle>Active SSH Sessions</CardTitle>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["ssh-sessions"] })}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : !sessions?.length ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No active SSH sessions</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[32rem]">
            <div className="space-y-2 pr-1">
              {sessions.map((session, i) => (
                <div key={i} className="rounded-lg border border-border bg-card/50 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      <span className="font-mono font-medium text-sm">{session.user}</span>
                    </div>
                    <Badge variant="success" className="text-[10px]">Connected</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">From</span>
                      <span className="font-mono">{session.from || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PID</span>
                      <span className="font-mono">{session.pid}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started</span>
                      <span>{session.started || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Idle</span>
                      <span>{session.idle || "—"}</span>
                    </div>
                    {session.command && (
                      <div className="col-span-2 flex justify-between">
                        <span className="text-muted-foreground">Command</span>
                        <span className="font-mono truncate max-w-[200px]">{session.command}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SshPage() {
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ["ssh-config"],
    queryFn: sshApi.getConfig,
  });

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["ssh-status"],
    queryFn: sshApi.getStatus,
    refetchInterval: 10000,
  });

  const updateConfig = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      sshApi.updateConfig(key, value),
    onSuccess: () => {
      toast({ title: "Config updated", description: "Restart SSH to apply changes", variant: "success" } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["ssh-config"] });
    },
    onError: () => {
      toast({ title: "Failed to update config", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const restartSsh = useMutation({
    mutationFn: sshApi.restartSsh,
    onSuccess: () => {
      toast({ title: "SSH service restarted", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["ssh-status"] });
    },
    onError: () => {
      toast({ title: "Failed to restart SSH", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Status Banner */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
          status?.active
            ? "border-green-500/30 bg-green-500/10"
            : "border-destructive/30 bg-destructive/10",
        )}
      >
        <div className="flex items-center gap-3">
          <Terminal
            className={cn("w-5 h-5 shrink-0", status?.active ? "text-green-400" : "text-destructive")}
          />
          <div>
            {statusLoading ? (
              <p className="text-sm">Loading SSH status…</p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  SSH Service — {status?.active ? "Running" : "Stopped"}
                </p>
                {status?.port && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Port {status.port} · Password Auth: {status.password_auth ? "yes" : "no"} ·
                    Pubkey Auth: {status.pubkey_auth ? "yes" : "no"}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => restartSsh.mutate()}
          loading={restartSsh.isPending}
        >
          <Power className="w-3.5 h-3.5 mr-1.5" />
          Restart
        </Button>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />
            Config
          </TabsTrigger>
          <TabsTrigger value="keys">
            <Key className="w-3.5 h-3.5 mr-1.5" />
            Authorized Keys
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>SSH Server Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              {CONFIG_KEYS.map(({ key, label, description }) => (
                <ConfigRow
                  key={key}
                  keyName={key}
                  label={label}
                  description={description}
                  currentValue={config?.[key]}
                  onSave={(k, v) => updateConfig.mutate({ key: k, value: v })}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <KeysTab />
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
