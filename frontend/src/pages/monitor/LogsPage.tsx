import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, FileText, Power } from "lucide-react";
import { systemApi } from "@/api/system";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<number, string> = {
  0: "text-destructive",
  1: "text-destructive",
  2: "text-destructive",
  3: "text-destructive",
  4: "text-warning",
  5: "text-info",
  6: "text-foreground",
  7: "text-muted-foreground",
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "EMERG",
  1: "ALERT",
  2: "CRIT",
  3: "ERR",
  4: "WARN",
  5: "NOTICE",
  6: "INFO",
  7: "DEBUG",
};

// ─── Shared log entry renderer ─────────────────────────────────────────────────

function LogLine({ entry, i }: { entry: Record<string, string>; i: number }) {
  const priority = parseInt(entry["PRIORITY"] ?? "6");
  const timestamp = entry["__REALTIME_TIMESTAMP"]
    ? new Date(parseInt(entry["__REALTIME_TIMESTAMP"]) / 1000)
    : null;
  const message = entry["MESSAGE"] ?? "";
  const unit = entry["_SYSTEMD_UNIT"] ?? entry["SYSLOG_IDENTIFIER"] ?? "";

  const fullLine = [timestamp?.toLocaleTimeString(), PRIORITY_LABELS[priority], unit, message]
    .filter(Boolean).join("  ");

  return (
    <div
      key={i}
      data-ctx="log-line"
      data-ctx-value={fullLine}
      className="flex gap-3 px-4 py-1.5 hover:bg-secondary/20 cursor-default"
    >
      <span className="text-muted-foreground shrink-0 w-36">
        {timestamp?.toLocaleTimeString()}
      </span>
      <span className={cn("shrink-0 w-14", PRIORITY_COLORS[priority] ?? "text-foreground")}>
        {PRIORITY_LABELS[priority] ?? "INFO"}
      </span>
      {unit && (
        <span className="text-primary shrink-0 w-32 truncate">{unit}</span>
      )}
      <span className="break-all">{message}</span>
    </div>
  );
}

// ─── System Logs Tab ───────────────────────────────────────────────────────────

function SystemLogsTab() {
  const [unitFilter, setUnitFilter]     = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [lines, setLines]               = useState(200);

  const { data: systemLogs, isFetching, refetch } = useQuery({
    queryKey: ["system-logs", unitFilter, lines],
    queryFn:  () => systemApi.getLogs(unitFilter || undefined, lines),
    refetchInterval: false,
  });

  const filtered = useMemo(() => {
    if (!systemLogs) return [];
    if (!searchFilter) return systemLogs;
    const q = searchFilter.toLowerCase();
    return systemLogs.filter((e) => (e["MESSAGE"] ?? "").toLowerCase().includes(q));
  }, [systemLogs, searchFilter]);

  return (
    <div className="flex flex-col flex-1 gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search messages…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Input
          placeholder="Filter by unit (e.g. nginx)"
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="h-8 text-xs max-w-48"
        />
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
        <select
          value={lines}
          onChange={(e) => setLines(Number(e.target.value))}
          className="h-8 text-xs bg-card border border-border rounded px-2"
        >
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full">
          {isFetching && filtered.length === 0 ? (
            <SkeletonList count={8} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nothing to show"
              description="No log entries match the current filters."
            />
          ) : (
            <ScrollArea className="h-full font-mono text-xs">
              <div className="divide-y divide-border/30">
                {filtered.map((entry, i) => (
                  <LogLine key={i} entry={entry} i={i} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Boot Log Tab ──────────────────────────────────────────────────────────────

const BOOT_OPTIONS = [
  { value: 0,  label: "Current boot" },
  { value: 1,  label: "Previous boot (−1)" },
  { value: 2,  label: "2 boots ago (−2)" },
  { value: 3,  label: "3 boots ago (−3)" },
  { value: 4,  label: "4 boots ago (−4)" },
  { value: 5,  label: "5 boots ago (−5)" },
];

function BootLogTab() {
  const [boot, setBoot]                 = useState(0);
  const [lines, setLines]               = useState(500);
  const [searchFilter, setSearchFilter] = useState("");

  const { data: bootLogs, isFetching, refetch } = useQuery({
    queryKey: ["boot-log", boot, lines],
    queryFn:  () => systemApi.getBootLog(boot, lines),
    refetchInterval: false,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!bootLogs) return [];
    if (!searchFilter) return bootLogs;
    const q = searchFilter.toLowerCase();
    return bootLogs.filter((e) => (e["MESSAGE"] ?? "").toLowerCase().includes(q));
  }, [bootLogs, searchFilter]);

  const totalCount = bootLogs?.length ?? 0;

  return (
    <div className="flex flex-col flex-1 gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search messages…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <select
          value={boot}
          onChange={(e) => setBoot(Number(e.target.value))}
          className="h-8 text-xs bg-card border border-border rounded px-2"
        >
          {BOOT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={lines}
          onChange={(e) => setLines(Number(e.target.value))}
          className="h-8 text-xs bg-card border border-border rounded px-2"
        >
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
          <option value={2000}>2000 lines</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
        {!isFetching && totalCount > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length !== totalCount
              ? `${filtered.length} / ${totalCount} entries`
              : `${totalCount} entries`}
          </span>
        )}
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full">
          {isFetching && filtered.length === 0 ? (
            <SkeletonList count={8} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Power}
              title={boot === 0 ? "No boot log entries" : `No entries for boot −${boot}`}
              description={
                boot === 0
                  ? "Boot log is empty or journald does not have entries for this boot."
                  : "This boot record may not exist — try a lower boot number."
              }
            />
          ) : (
            <ScrollArea className="h-full font-mono text-xs">
              <div className="divide-y divide-border/30">
                {filtered.map((entry, i) => (
                  <LogLine key={i} entry={entry} i={i} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Logs</h2>
        <PageHelp
          title="Logs"
          points={[
            "System Logs: browse live journald entries, filter by unit or message",
            "Boot Log: inspect journal entries from the current or a past boot session",
            "Increase line count for deeper history",
          ]}
        />
      </div>

      <Tabs defaultValue="system" className="flex flex-col flex-1 gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="system" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            System Logs
          </TabsTrigger>
          <TabsTrigger value="boot" className="gap-1.5">
            <Power className="w-3.5 h-3.5" />
            Boot Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="flex flex-col flex-1 gap-4 mt-0">
          <SystemLogsTab />
        </TabsContent>

        <TabsContent value="boot" className="flex flex-col flex-1 gap-4 mt-0">
          <BootLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
