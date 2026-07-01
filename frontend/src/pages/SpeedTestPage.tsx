import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download, Upload, Timer, Gauge, RefreshCw, Play, Wifi,
  TrendingUp, TrendingDown,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpeedResult {
  download: number;
  upload: number;
  ping: number;
  server_name: string;
  server_location: string;
  timestamp: string;
  bytes_sent: number;
  bytes_received: number;
  isp: string | null;
  share_url: string | null;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const speedApi = {
  getHistory: async (): Promise<SpeedResult[]> => {
    const { data } = await apiClient.get("/speedtest/history");
    return data;
  },
  runTest: async (): Promise<SpeedResult> => {
    const { data } = await apiClient.post("/speedtest/run");
    return data;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMbps(bps: number): string {
  const mbps = bps / 1_000_000;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ─── Speed Gauge ──────────────────────────────────────────────────────────────

function SpeedGauge({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <Icon className={cn("w-6 h-6", color)} />
      <div className="text-center">
        <p className={cn("text-3xl font-bold tabular-nums", color)}>
          {value != null ? formatMbps(value) : "—"}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── History Row ──────────────────────────────────────────────────────────────

function HistoryRow({
  result,
  isLatest,
}: {
  result: SpeedResult;
  isLatest: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card/50 p-4",
        isLatest ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{result.server_name}</p>
            {result.server_location && (
              <p className="text-xs text-muted-foreground">{result.server_location}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLatest && <Badge variant="success" className="text-[10px]">Latest</Badge>}
          <span className="text-xs text-muted-foreground">
            {new Date(result.timestamp).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted/30 py-2">
          <Download className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-sm font-bold text-blue-400">{formatMbps(result.download)}</span>
          <span className="text-[10px] text-muted-foreground">Download</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted/30 py-2">
          <Upload className="w-3.5 h-3.5 text-green-400" />
          <span className="text-sm font-bold text-green-400">{formatMbps(result.upload)}</span>
          <span className="text-[10px] text-muted-foreground">Upload</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted/30 py-2">
          <Timer className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-sm font-bold text-yellow-400">{result.ping.toFixed(1)} ms</span>
          <span className="text-[10px] text-muted-foreground">Ping</span>
        </div>
      </div>

      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        {result.isp && <span>ISP: {result.isp}</span>}
        <span>Sent: {formatBytes(result.bytes_sent)}</span>
        <span>Recv: {formatBytes(result.bytes_received)}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SpeedTestPage() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["speedtest-history"],
    queryFn: speedApi.getHistory,
  });

  const runTest = useMutation({
    mutationFn: speedApi.runTest,
    onMutate: () => setRunning(true),
    onSuccess: (result) => {
      toast({
        title: "Speed test complete",
        description: `↓ ${formatMbps(result.download)} · ↑ ${formatMbps(result.upload)} · Ping ${result.ping.toFixed(1)}ms`,
        variant: "success",
      } as { title: string; description: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["speedtest-history"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast({
        title: "Speed test failed",
        description: err?.response?.data?.detail ?? "Could not run test. Is speedtest-cli installed?",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    },
    onSettled: () => setRunning(false),
  });

  const latest = history?.[0] ?? null;

  const avgDown = history?.length
    ? history.reduce((s, r) => s + r.download, 0) / history.length
    : null;
  const avgUp = history?.length
    ? history.reduce((s, r) => s + r.upload, 0) / history.length
    : null;
  const avgPing = history?.length
    ? history.reduce((s, r) => s + r.ping, 0) / history.length
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Run Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div
                className={cn(
                  "w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all",
                  running
                    ? "border-primary animate-pulse bg-primary/10"
                    : "border-border bg-card",
                )}
              >
                <Gauge className={cn("w-8 h-8", running ? "text-primary" : "text-muted-foreground")} />
                {running && (
                  <p className="text-xs text-primary mt-1 font-medium">Testing…</p>
                )}
              </div>
            </div>

            <Button
              size="lg"
              className="px-10 gap-2"
              onClick={() => runTest.mutate()}
              disabled={running}
              loading={running}
            >
              <Play className="w-4 h-4" />
              {running ? "Running Test…" : "Run Speed Test"}
            </Button>

            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Requires <span className="font-mono text-foreground">speedtest-cli</span> to be installed on the Raspberry Pi.
              Test takes ~30 seconds.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gift 2 — trend vs previous result */}
      {history && history.length >= 2 && (() => {
        const prev = history[1];
        const downDiff = latest!.download - prev.download;
        const upDiff   = latest!.upload   - prev.upload;
        const isUp     = downDiff >= 0;
        const diffMbps = (n: number) => `${n >= 0 ? "+" : ""}${(n / 1_000_000).toFixed(1)} Mbps`;
        return (
          <div className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
            isUp ? "border-green-500/30 bg-green-500/10" : "border-yellow-500/30 bg-yellow-500/10",
          )}>
            {isUp
              ? <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
              : <TrendingDown className="w-4 h-4 text-yellow-400 shrink-0" />
            }
            <span className={isUp ? "text-green-400 font-medium" : "text-yellow-400 font-medium"}>
              {isUp ? "Faster" : "Slower"} than previous test
            </span>
            <span className="text-muted-foreground">
              Download {diffMbps(downDiff)} · Upload {diffMbps(upDiff)}
            </span>
          </div>
        );
      })()}

      {/* Live Result */}
      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-0">
              <SpeedGauge label="Download" value={latest.download} icon={Download} color="text-blue-400" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-0">
              <SpeedGauge label="Upload" value={latest.upload} icon={Upload} color="text-green-400" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-0">
              <div className="flex flex-col items-center gap-2 py-4">
                <Timer className="w-6 h-6 text-yellow-400" />
                <div className="text-center">
                  <p className="text-3xl font-bold tabular-nums text-yellow-400">
                    {latest.ping.toFixed(1)} ms
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">Ping</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Averages */}
      {history && history.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Averages ({history.length} tests)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Avg Down</span>
                </div>
                <p className="text-lg font-bold text-blue-400">{avgDown ? formatMbps(avgDown) : "—"}</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-muted-foreground">Avg Up</span>
                </div>
                <p className="text-lg font-bold text-green-400">{avgUp ? formatMbps(avgUp) : "—"}</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Timer className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs text-muted-foreground">Avg Ping</span>
                </div>
                <p className="text-lg font-bold text-yellow-400">{avgPing ? `${avgPing.toFixed(1)} ms` : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle>Test History</CardTitle>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["speedtest-history"] })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {!history?.length ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Gauge className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No tests run yet</p>
              <p className="text-xs mt-1">Results are stored in memory and reset on service restart</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((result, i) => (
                <HistoryRow key={i} result={result} isLatest={i === 0} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
