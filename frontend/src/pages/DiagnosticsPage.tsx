import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Stethoscope,
  Server, ShieldCheck, Wrench, HardDrive, Globe2,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = "ok" | "warn" | "fail";

interface DiagnosticCheck {
  name: string;
  category: string;
  status: CheckStatus;
  detail: string;
  hint: string;
}

interface DiagnosticsReport {
  overall: CheckStatus;
  summary: { ok: number; warn: number; fail: number };
  checks: DiagnosticCheck[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<CheckStatus, { icon: typeof CheckCircle2; color: string; ring: string; label: string }> = {
  ok:   { icon: CheckCircle2,  color: "text-green-400",  ring: "border-green-500/30",  label: "OK" },
  warn: { icon: AlertTriangle, color: "text-yellow-400", ring: "border-yellow-500/30", label: "Warning" },
  fail: { icon: XCircle,       color: "text-red-400",    ring: "border-red-500/40",    label: "Failed" },
};

const CATEGORY_ICONS: Record<string, typeof Server> = {
  Services:   Server,
  Network:    Globe2,
  Privileges: ShieldCheck,
  Tooling:    Wrench,
  Storage:    HardDrive,
};

const CATEGORY_ORDER = ["Services", "Network", "Privileges", "Tooling", "Storage"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const { data, isLoading, isFetching, refetch, error } = useQuery<DiagnosticsReport>({
    queryKey: ["diagnostics"],
    queryFn: async () => {
      const { data } = await apiClient.get<DiagnosticsReport>("/diagnostics");
      return data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, DiagnosticCheck[]>();
    for (const c of data?.checks ?? []) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => [cat, map.get(cat)!] as const)
      .concat([...map.entries()].filter(([cat]) => !CATEGORY_ORDER.includes(cat)));
  }, [data]);

  const overall = data?.overall ?? "ok";
  const OverallIcon = STATUS_META[overall].icon;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">System Diagnostics</h2>
            <p className="text-sm text-muted-foreground">
              Live self-check of every subsystem the dashboard controls.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Re-run checks
        </Button>
      </div>

      {/* Overall banner */}
      {data && (
        <div
          className={cn(
            "rounded-xl border bg-card/60 px-5 py-4 flex items-center gap-4",
            STATUS_META[overall].ring
          )}
        >
          <OverallIcon className={cn("w-8 h-8 shrink-0", STATUS_META[overall].color)} />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {overall === "ok"
                ? "All systems operational"
                : overall === "warn"
                ? "Operational with warnings"
                : "Action required"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.summary.ok} passing · {data.summary.warn} warnings · {data.summary.fail} failed
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-400">
              <CheckCircle2 className="w-4 h-4" /> {data.summary.ok}
            </span>
            <span className="flex items-center gap-1.5 text-yellow-400">
              <AlertTriangle className="w-4 h-4" /> {data.summary.warn}
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <XCircle className="w-4 h-4" /> {data.summary.fail}
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 px-5 py-4 text-sm text-red-400">
          Could not run diagnostics. The backend may be unreachable or out of date.
        </div>
      )}

      {/* Category groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {grouped.map(([category, checks]) => {
          const CatIcon = CATEGORY_ICONS[category] ?? Server;
          const fails = checks.filter((c) => c.status === "fail").length;
          const warns = checks.filter((c) => c.status === "warn").length;
          return (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CatIcon className="w-4 h-4 text-muted-foreground" />
                  {category}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {fails > 0 && <span className="text-red-400">{fails} failed</span>}
                    {fails > 0 && warns > 0 && " · "}
                    {warns > 0 && <span className="text-yellow-400">{warns} warn</span>}
                    {fails === 0 && warns === 0 && <span className="text-green-400">all good</span>}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {checks.map((check) => {
                  const meta = STATUS_META[check.status];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={check.name}
                      className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-secondary/30 transition-colors"
                    >
                      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{check.name}</span>
                          <span className="text-xs text-muted-foreground">{check.detail}</span>
                        </div>
                        {check.hint && check.status !== "ok" && (
                          <p className="text-xs text-muted-foreground/80 mt-0.5 font-mono bg-muted/40 rounded px-1.5 py-0.5 inline-block">
                            {check.hint}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
