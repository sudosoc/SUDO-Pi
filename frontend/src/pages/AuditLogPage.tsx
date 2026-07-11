import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScrollText, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Search,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: number;
  timestamp: string;
  username: string;
  action: string;
  resource: string;
  ip_address: string;
  status: "success" | "failure";
  detail: string;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ACTION_COLOR: Record<string, string> = {
  login:   "text-green-400",
  logout:  "text-muted-foreground",
  create:  "text-blue-400",
  update:  "text-violet-400",
  delete:  "text-red-400",
  enable:  "text-emerald-400",
  disable: "text-amber-400",
};

function actionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_COLOR)) {
    if (action.toLowerCase().includes(key)) return cls;
  }
  return "text-foreground/80";
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [searchUser, setSearchUser] = useState("");
  const [searchAction, setSearchAction] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "success" | "failure">("");

  const { data, isLoading, isFetching, refetch } = useQuery<AuditResponse>({
    queryKey: ["audit-log", page, searchUser, searchAction, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({
        skip: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      if (searchUser) params.set("username", searchUser);
      if (searchAction) params.set("action", searchAction);
      if (filterStatus) params.set("status", filterStatus);
      const { data } = await apiClient.get<AuditResponse>(`/security/audit?${params}`);
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ScrollText className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Audit Log</h2>
            <p className="text-sm text-muted-foreground">
              Full history of dashboard actions — who did what and when.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Entries</p>
          <p className="text-xl font-bold mt-1">{total.toLocaleString()}</p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Successes</p>
          <p className="text-xl font-bold mt-1 text-green-400">
            {items.filter((i) => i.status === "success").length}
          </p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Failures</p>
          <p className="text-xl font-bold mt-1 text-red-400">
            {items.filter((i) => i.status === "failure").length}
          </p>
        </div>
        <div className="metric-card text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">This Page</p>
          <p className="text-xl font-bold mt-1">{items.length}</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px] space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">User</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                <Input
                  className="pl-7 h-8 text-xs"
                  placeholder="Filter by username…"
                  value={searchUser}
                  onChange={(e) => { setSearchUser(e.target.value); setPage(0); }}
                />
              </div>
            </div>
            <div className="flex-1 min-w-[160px] space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Action</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                <Input
                  className="pl-7 h-8 text-xs"
                  placeholder="Filter by action…"
                  value={searchAction}
                  onChange={(e) => { setSearchAction(e.target.value); setPage(0); }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
              <div className="flex gap-1">
                {(["", "success", "failure"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setFilterStatus(s); setPage(0); }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                      filterStatus === s
                        ? "bg-primary/15 border-primary/30 text-primary"
                        : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                    )}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/40 mx-auto" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <ScrollText className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground/60">No audit entries found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[10px] text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">When</th>
                    <th className="text-left px-4 py-2.5 font-medium">User</th>
                    <th className="text-left px-4 py-2.5 font-medium">Action</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Resource</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">IP</th>
                    <th className="text-center px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground/70 whitespace-nowrap">
                        {relTime(entry.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{entry.username}</td>
                      <td className={cn("px-4 py-2.5 text-xs font-medium", actionColor(entry.action))}>
                        {entry.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground/70 font-mono hidden md:table-cell max-w-[180px] truncate">
                        {entry.resource}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground/60 hidden lg:table-cell">
                        {entry.ip_address}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {entry.status === "success"
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mx-auto" />
                          : <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <p className="text-xs text-muted-foreground/60">
                Page {page + 1} of {totalPages} · {total.toLocaleString()} entries
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
