import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { systemApi } from "@/api/system";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatRelative } from "@/lib/utils";

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
  const [page, setPage] = useState(0);
  const perPage = 50;

  const { data: systemLogs, isFetching: loadingSystem, refetch: refetchSystem } = useQuery({
    queryKey: ["system-logs", unitFilter, lines],
    queryFn: () => systemApi.getLogs(unitFilter || undefined, lines),
    refetchInterval: false,
  });

  const { data: auditLogs, isFetching: loadingAudit, refetch: refetchAudit } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: async () => {
      const { data } = await apiClient.get(`/logs/audit?skip=${page * perPage}&limit=${perPage}`);
      return data;
    },
    refetchInterval: 30000,
  });

  const filteredSystemLogs = (systemLogs ?? []).filter((entry) => {
    if (!searchFilter) return true;
    const msg = (entry["MESSAGE"] as string) ?? "";
    return msg.toLowerCase().includes(searchFilter.toLowerCase());
  });

  return (
    <div className="p-6 h-full flex flex-col">
      <Tabs defaultValue="system" className="flex flex-col flex-1">
        <TabsList className="mb-4">
          <TabsTrigger value="system">System Logs (journald)</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="flex flex-col flex-1 gap-4 mt-0">
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
                  {filteredSystemLogs.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      {loadingSystem ? "Loading…" : "No log entries"}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="flex flex-col flex-1 gap-4 mt-0">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchAudit()} loading={loadingAudit}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <span className="text-sm text-muted-foreground">
              {auditLogs?.total ?? 0} total entries
            </span>
          </div>

          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 h-full">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b border-border z-10">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">Time</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">User</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">Action</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">Resource</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">IP</th>
                      <th className="text-center px-4 py-2 text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditLogs?.items ?? []).map((log: { id: number; created_at: string; username: string; action: string; resource: string; ip_address: string; status_code: number }) => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap">
                          {formatRelative(log.created_at)}
                        </td>
                        <td className="px-4 py-1.5 font-medium">{log.username ?? "—"}</td>
                        <td className="px-4 py-1.5 font-mono">{log.action}</td>
                        <td className="px-4 py-1.5 text-muted-foreground truncate max-w-[120px]">{log.resource ?? "—"}</td>
                        <td className="px-4 py-1.5 font-mono text-muted-foreground">{log.ip_address ?? "—"}</td>
                        <td className="px-4 py-1.5 text-center">
                          <Badge
                            variant={
                              log.status_code >= 400 ? "destructive" :
                              log.status_code >= 200 ? "success" : "muted"
                            }
                            className="text-[10px]"
                          >
                            {log.status_code}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {(!auditLogs?.items?.length) && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          {loadingAudit ? "Loading…" : "No audit logs"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(auditLogs?.items?.length ?? 0) < perPage}
            >
              Next
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
