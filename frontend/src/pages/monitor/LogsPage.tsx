import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, FileText } from "lucide-react";
import { systemApi } from "@/api/system";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function LogsPage() {
  const [unitFilter, setUnitFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [lines, setLines] = useState(200);

  const { data: systemLogs, isFetching: loadingSystem, refetch: refetchSystem } = useQuery({
    queryKey: ["system-logs", unitFilter, lines],
    queryFn: () => systemApi.getLogs(unitFilter || undefined, lines),
    refetchInterval: false,
  });

  const filteredSystemLogs = (systemLogs ?? []).filter((entry) => {
    if (!searchFilter) return true;
    const msg = (entry["MESSAGE"] as string) ?? "";
    return msg.toLowerCase().includes(searchFilter.toLowerCase());
  });

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">System Logs</h2>
        <PageHelp
          title="Logs"
          points={[
            "Browse system, kernel and service logs via journald",
            "Filter by level, service unit, or message text",
            "Increase line count for deeper history",
          ]}
        />
      </div>

      <div className="flex flex-col flex-1 gap-4">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSystem()}
              loading={loadingSystem}
            >
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
              {loadingSystem && filteredSystemLogs.length === 0 ? (
                <SkeletonList count={8} />
              ) : filteredSystemLogs.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Nothing to show"
                  description="No log entries match the current filters."
                />
              ) : (
              <ScrollArea className="h-full font-mono text-xs">
                <div className="divide-y divide-border/30">
                  {filteredSystemLogs.map((entry, i) => {
                    const priority = parseInt(entry["PRIORITY"] as string ?? "6");
                    const timestamp = entry["__REALTIME_TIMESTAMP"]
                      ? new Date(parseInt(entry["__REALTIME_TIMESTAMP"] as string) / 1000)
                      : null;
                    const message = (entry["MESSAGE"] as string) ?? "";
                    const unit = (entry["_SYSTEMD_UNIT"] as string) ?? (entry["SYSLOG_IDENTIFIER"] as string) ?? "";

                    return (
                      <div key={i} className="flex gap-3 px-4 py-1.5 hover:bg-secondary/20">
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
                  })}
                </div>
              </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
