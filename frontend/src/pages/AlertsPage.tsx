import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, BellOff, Plus, Trash2, RefreshCw, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Send, ToggleLeft,
  Activity, Server, Wifi,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertRule {
  id: number;
  name: string;
  metric: string;
  threshold: number | null;
  service_name: string | null;
  channel: string;
  channel_config: Record<string, string>;
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  created_at: string | null;
}

interface AlertHistory {
  id: number;
  rule_id: number | null;
  rule_name: string;
  metric: string;
  value: number | null;
  message: string;
  channel: string;
  sent_at: string;
  success: boolean;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const alertsApi = {
  listRules: async (): Promise<AlertRule[]> => {
    const { data } = await apiClient.get("/alerts/rules");
    return data;
  },
  createRule: async (payload: Omit<AlertRule, "id" | "enabled" | "last_triggered_at" | "created_at">): Promise<AlertRule> => {
    const { data } = await apiClient.post("/alerts/rules", payload);
    return data;
  },
  updateRule: async (id: number, payload: Partial<AlertRule>): Promise<AlertRule> => {
    const { data } = await apiClient.put(`/alerts/rules/${id}`, payload);
    return data;
  },
  deleteRule: async (id: number): Promise<void> => {
    await apiClient.delete(`/alerts/rules/${id}`);
  },
  toggleRule: async (id: number): Promise<AlertRule> => {
    const { data } = await apiClient.post(`/alerts/rules/${id}/toggle`);
    return data;
  },
  testChannel: async (channel: string, config: Record<string, string>): Promise<{ success: boolean }> => {
    const { data } = await apiClient.post("/alerts/test", { channel, config });
    return data;
  },
  getHistory: async (): Promise<AlertHistory[]> => {
    const { data } = await apiClient.get("/alerts/history?limit=200");
    return data;
  },
};

// ─── Channel Config Fields ────────────────────────────────────────────────────

const CHANNEL_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  discord: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/..." }],
  telegram: [
    { key: "bot_token", label: "Bot Token", placeholder: "123456:ABC-DEF..." },
    { key: "chat_id", label: "Chat ID", placeholder: "-1001234567890" },
  ],
  email: [
    { key: "smtp_host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
    { key: "smtp_port", label: "SMTP Port", placeholder: "587" },
    { key: "smtp_user", label: "SMTP User", placeholder: "you@gmail.com" },
    { key: "smtp_password", label: "SMTP Password", placeholder: "app-password" },
    { key: "to_email", label: "To Email", placeholder: "alert@example.com" },
  ],
};

const METRIC_OPTIONS = [
  { value: "cpu", label: "CPU Usage (%)" },
  { value: "ram", label: "RAM Usage (%)" },
  { value: "disk", label: "Disk Usage (%)" },
  { value: "temperature", label: "CPU Temperature (°C)" },
  { value: "service_down", label: "Service Down" },
];

// ─── Create Rule Modal ────────────────────────────────────────────────────────

function CreateRuleModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (rule: Omit<AlertRule, "id" | "enabled" | "last_triggered_at" | "created_at">) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("cpu");
  const [threshold, setThreshold] = useState("80");
  const [serviceName, setServiceName] = useState("");
  const [channel, setChannel] = useState("discord");
  const [channelConfig, setChannelConfig] = useState<Record<string, string>>({});
  const [cooldown, setCooldown] = useState("60");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const fields = CHANNEL_FIELDS[channel] ?? [];

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        metric,
        threshold: metric !== "service_down" ? parseFloat(threshold) : null,
        service_name: metric === "service_down" ? serviceName.trim() || null : null,
        channel,
        channel_config: channelConfig,
        cooldown_minutes: parseInt(cooldown) || 60,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await alertsApi.testChannel(channel, channelConfig);
      toast({
        title: result.success ? "Test alert sent!" : "Test failed",
        variant: result.success ? "success" : "destructive",
      } as { title: string; variant: "success" | "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold">New Alert Rule</h3>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Rule Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="High CPU Alert" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Metric</label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            {metric === "service_down" ? (
              <>
                <label className="text-xs text-muted-foreground mb-1 block">Service Name</label>
                <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="nginx.service" />
              </>
            ) : (
              <>
                <label className="text-xs text-muted-foreground mb-1 block">Threshold</label>
                <Input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="80"
                />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Channel</label>
            <Select value={channel} onValueChange={(v: string) => { setChannel(v); setChannelConfig({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Cooldown (minutes)</label>
            <Input
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              min="1"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider capitalize">{channel} Settings</p>
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
              <Input
                value={channelConfig[f.key] ?? ""}
                onChange={(e) => setChannelConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                type={f.key.includes("password") || f.key.includes("token") ? "password" : "text"}
                className="text-xs"
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-1 h-7 text-xs"
            onClick={handleTest}
            loading={testing}
          >
            <Send className="w-3 h-3 mr-1.5" />
            Send Test Alert
          </Button>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleCreate} loading={saving}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Rule
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: AlertRule;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === rule.metric)?.label ?? rule.metric;

  return (
    <div className={cn("rounded-lg border bg-card/50 p-4", rule.enabled ? "border-border" : "border-border/50 opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{rule.name}</span>
            <Badge variant={rule.enabled ? "success" : "muted"} className="text-[10px]">
              {rule.enabled ? "Active" : "Disabled"}
            </Badge>
            <Badge variant="secondary" className="text-[10px] capitalize">{rule.channel}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {metricLabel}
            {rule.threshold != null && ` > ${rule.threshold}%`}
            {rule.service_name && ` · Service: ${rule.service_name}`}
            {` · Cooldown: ${rule.cooldown_minutes}m`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={onToggle}>
            {rule.enabled ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(rule.channel_config).map(([k, v]) => (
            <div key={k} className="flex justify-between col-span-2">
              <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
              <span className="font-mono truncate max-w-[200px]">
                {k.includes("password") || k.includes("token") ? "••••••••" : v}
              </span>
            </div>
          ))}
          {rule.last_triggered_at && (
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Last Triggered</span>
              <span>{new Date(rule.last_triggered_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Uptime Types + API ───────────────────────────────────────────────────────

interface UptimeService {
  service_name: string;
  current_status: "up" | "down" | "failed" | "unknown";
  response_ms: number | null;
  response_ms_avg: number | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  last_down_at: string | null;
}

interface UptimeHistoryRecord {
  checked_at: string;
  status: "up" | "down" | "failed";
  response_ms: number | null;
}

const uptimeApi = {
  getSummary: async (): Promise<UptimeService[]> => {
    const { data } = await apiClient.get("/uptime/summary");
    return data;
  },
  getHistory: async (name: string): Promise<UptimeHistoryRecord[]> => {
    const { data } = await apiClient.get(`/uptime/services/${name}/history?hours=24`);
    return data;
  },
  checkNow: async (): Promise<{ checked: number; up: number; down: number }> => {
    const { data } = await apiClient.post("/uptime/check-now");
    return data;
  },
};

// ─── Service Sparkline ────────────────────────────────────────────────────────

function ServiceSparkline({ records }: { records: UptimeHistoryRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="flex-1 h-4 rounded-sm bg-muted/40" />
        ))}
      </div>
    );
  }

  // Bucket records by hour-of-day (last 24h)
  const now = Date.now();
  const buckets: ("up" | "down" | "failed" | null)[] = Array(24).fill(null);
  for (const rec of records) {
    const ageMs = now - new Date(rec.checked_at).getTime();
    const ageBucket = Math.floor(ageMs / (1000 * 60 * 60));
    const idx = 23 - Math.min(ageBucket, 23);
    // If any check in this bucket is down, mark down
    if (buckets[idx] === null || rec.status !== "up") {
      buckets[idx] = rec.status;
    }
  }

  return (
    <div className="flex gap-0.5" title="24h status (left=oldest, right=newest)">
      {buckets.map((status, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 h-4 rounded-sm",
            status === "up"     ? "bg-green-500/80"
            : status === "down" ? "bg-red-500/80"
            : status === "failed" ? "bg-orange-500/80"
            : "bg-muted/30",
          )}
          title={`${24 - i}h ago: ${status ?? "no data"}`}
        />
      ))}
    </div>
  );
}

// ─── Uptime Tab ───────────────────────────────────────────────────────────────

function UptimeTab() {
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["uptime-summary"],
    queryFn: uptimeApi.getSummary,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["uptime-history", selectedService],
    queryFn: () => uptimeApi.getHistory(selectedService!),
    enabled: selectedService !== null,
    staleTime: 30_000,
  });

  const checkNow = useMutation({
    mutationFn: uptimeApi.checkNow,
    onSuccess: (result) => {
      toast({
        title: `Check complete: ${result.up}/${result.checked} up`,
        variant: result.down === 0 ? "success" : "destructive",
      } as { title: string; variant: "success" | "destructive" });
      queryClient.invalidateQueries({ queryKey: ["uptime-summary"] });
    },
    onError: () => {
      toast({ title: "Check failed", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const statusColor = (status: UptimeService["current_status"]) => {
    if (status === "up")     return "bg-green-500";
    if (status === "down")   return "bg-red-500";
    if (status === "failed") return "bg-orange-500";
    return "bg-muted";
  };

  const pctColor = (pct: number | null) => {
    if (pct === null)   return "text-muted-foreground";
    if (pct >= 99.5)    return "text-green-400";
    if (pct >= 95.0)    return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <Server className="w-4 h-4 text-muted-foreground" />
            Service Uptime
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            loading={checkNow.isPending}
            onClick={() => checkNow.mutate()}
          >
            <RefreshCw className="w-3 h-3" />
            Check Now
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : summary.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Wifi className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No uptime data yet</p>
              <p className="text-xs mt-1">Click "Check Now" to run the first check</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-border/50">
              {summary.map((svc) => (
                <div
                  key={svc.service_name}
                  className={cn(
                    "py-3 cursor-pointer hover:bg-muted/20 rounded-lg px-2 -mx-2 transition-colors",
                    selectedService === svc.service_name && "bg-muted/30",
                  )}
                  onClick={() =>
                    setSelectedService(
                      selectedService === svc.service_name ? null : svc.service_name,
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    {/* Status dot */}
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        statusColor(svc.current_status),
                        svc.current_status === "up" && "ring-2 ring-green-500/20",
                      )}
                    />

                    {/* Service name */}
                    <span className="font-mono text-sm font-medium min-w-0 flex-1 truncate">
                      {svc.service_name}
                    </span>

                    {/* Uptime badges */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-muted-foreground">24h</p>
                        <p className={cn("text-xs font-bold tabular-nums", pctColor(svc.uptime_24h))}>
                          {svc.uptime_24h !== null ? `${svc.uptime_24h.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="text-[10px] text-muted-foreground">7d</p>
                        <p className={cn("text-xs font-bold tabular-nums", pctColor(svc.uptime_7d))}>
                          {svc.uptime_7d !== null ? `${svc.uptime_7d.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-muted-foreground">avg ms</p>
                        <p className="text-xs font-bold tabular-nums text-muted-foreground">
                          {svc.response_ms_avg !== null ? `${svc.response_ms_avg.toFixed(0)}` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 24h sparkline */}
                  <div className="mt-2 pl-5">
                    {selectedService === svc.service_name ? (
                      <ServiceSparkline records={history} />
                    ) : (
                      <div className="flex gap-0.5">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 h-1.5 rounded-sm",
                              svc.uptime_24h !== null && svc.uptime_24h >= 99
                                ? "bg-green-500/60"
                                : "bg-muted/50",
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Last down */}
                  {svc.last_down_at && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 pl-5">
                      Last down: {new Date(svc.last_down_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      {summary.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Services Up",
              value: summary.filter((s) => s.current_status === "up").length,
              color: "text-green-400",
            },
            {
              label: "Services Down",
              value: summary.filter((s) => s.current_status !== "up" && s.current_status !== "unknown").length,
              color: "text-red-400",
            },
            {
              label: "Avg 24h Uptime",
              value: (() => {
                const vals = summary.filter((s) => s.uptime_24h !== null).map((s) => s.uptime_24h as number);
                if (vals.length === 0) return "—";
                return `${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}%`;
              })(),
              color: "text-muted-foreground",
            },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useQuery({
    queryKey: ["alert-history"],
    queryFn: alertsApi.getHistory,
    refetchInterval: 30000,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle>Alert History</CardTitle>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["alert-history"] })}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : !history?.length ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Bell className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No alerts have fired yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[40rem]">
            <div className="space-y-2 pr-1">
              {history.map((h) => (
                <div key={h.id} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3">
                  <div className="mt-0.5 shrink-0">
                    {h.success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{h.rule_name}</span>
                      <Badge variant="secondary" className="text-[10px] capitalize">{h.channel}</Badge>
                      <Badge variant={h.success ? "success" : "destructive"} className="text-[10px]">
                        {h.success ? "Sent" : "Failed"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{h.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {new Date(h.sent_at).toLocaleString()}
                      {h.value != null && ` · Value: ${h.value}`}
                    </p>
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

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: alertsApi.listRules,
  });

  const createRule = useMutation({
    mutationFn: alertsApi.createRule,
    onSuccess: () => {
      toast({ title: "Alert rule created", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: () => {
      toast({ title: "Failed to create rule", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const toggleRule = useMutation({
    mutationFn: (id: number) => alertsApi.toggleRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: () => {
      toast({ title: "Failed to toggle rule", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => alertsApi.deleteRule(id),
    onSuccess: () => {
      toast({ title: "Alert rule deleted", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" } as { title: string; variant: "destructive" });
    },
  });

  const activeCount = rules?.filter((r) => r.enabled).length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {showCreate && (
        <CreateRuleModal
          onClose={() => setShowCreate(false)}
          onCreate={async (payload) => { await createRule.mutateAsync(payload); }}
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Rules", value: rules?.length ?? 0, icon: Bell },
          { label: "Active", value: activeCount, icon: CheckCircle2 },
          { label: "Disabled", value: (rules?.length ?? 0) - activeCount, icon: BellOff },
          { label: "Channels", value: [...new Set(rules?.map((r) => r.channel) ?? [])].length, icon: Send },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Alert Rules
          </TabsTrigger>
          <TabsTrigger value="uptime">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Uptime
          </TabsTrigger>
          <TabsTrigger value="history">
            <ToggleLeft className="w-3.5 h-3.5 mr-1.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle>Alert Rules</CardTitle>
              <div className="flex gap-2">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["alert-rules"] })}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : !rules?.length ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <Bell className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No alert rules configured</p>
                  <p className="text-xs mt-1">Create a rule to get notified when thresholds are exceeded</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[36rem]">
                  <div className="space-y-3 pr-1">
                    {rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        onToggle={() => toggleRule.mutate(rule.id)}
                        onDelete={() => {
                          if (confirm(`Delete rule "${rule.name}"?`)) deleteRule.mutate(rule.id);
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="uptime" className="mt-4">
          <UptimeTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
