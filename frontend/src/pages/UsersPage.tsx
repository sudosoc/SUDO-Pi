import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, KeyRound, SlidersHorizontal, Check,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate, cn } from "@/lib/utils";
import { GATED_PAGES } from "@/lib/pages";
import type { User } from "@/types";

const ROLE_COLORS: Record<string, "default" | "info" | "muted"> = {
  admin: "default",
  operator: "info",
  viewer: "muted",
};

const PAGE_GROUPS = Array.from(new Set(GATED_PAGES.map((p) => p.group)));

// ─── Self password change (dual-protected) ────────────────────────────────────

function SelfPasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      apiClient.put("/users/me/password", {
        current_password: current,
        new_password: next,
      }),
    onSuccess: () => {
      toast({ title: "Password changed", variant: "success" } as { title: string; variant: "success" });
      setCurrent(""); setNext(""); setConfirmPw("");
    },
    onError: (err) =>
      toast({ title: "Could not change password", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const mismatch = next.length > 0 && confirmPw.length > 0 && next !== confirmPw;
  const canSubmit = current && next.length >= 8 && next === confirmPw;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5" />
          Change my password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Current dashboard password</label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">New password</label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Confirm new password</label>
            <Input
              type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
              className={cn(mismatch && "border-destructive focus-visible:ring-destructive")}
              autoComplete="new-password"
            />
          </div>
        </div>
        {mismatch && <p className="text-xs text-destructive mt-2">Passwords don't match.</p>}
        <div className="mt-4">
          <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!canSubmit}>
            Update password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page-permission editor ───────────────────────────────────────────────────

function PermissionsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  // null allowed_pages = full access
  const [fullAccess, setFullAccess] = useState(user.allowed_pages == null);
  const [selected, setSelected] = useState<Set<string>>(new Set(user.allowed_pages ?? []));
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.is_active);

  const toggle = (to: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(to)) next.delete(to); else next.add(to);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const paths = GATED_PAGES.filter((p) => p.group === group).map((p) => p.to);
    const allOn = paths.every((p) => selected.has(p));
    setSelected((prev) => {
      const next = new Set(prev);
      paths.forEach((p) => (allOn ? next.delete(p) : next.add(p)));
      return next;
    });
  };

  const mut = useMutation({
    mutationFn: () =>
      apiClient.put(`/users/${user.id}`, {
        role,
        is_active: active,
        allowed_pages: fullAccess ? null : Array.from(selected),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User updated", variant: "success" } as { title: string; variant: "success" });
      onClose();
    },
    onError: (err) =>
      toast({ title: "Update failed", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="page-transition max-w-lg w-full rounded-2xl border border-border bg-card shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border/70">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            {user.username} — access
          </h3>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Role + active */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as User["role"])} className="w-full h-9 bg-background border border-border rounded-lg px-3 text-sm">
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">Account active</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          {/* Full access toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Full access to all tabs</p>
              <p className="text-xs text-muted-foreground">Turn off to pick exactly which tabs this user sees.</p>
            </div>
            <Switch checked={fullAccess} onCheckedChange={setFullAccess} />
          </div>

          {/* Per-page checklist */}
          {!fullAccess && (
            <div className="space-y-3">
              {PAGE_GROUPS.map((group) => {
                const paths = GATED_PAGES.filter((p) => p.group === group);
                const allOn = paths.every((p) => selected.has(p.to));
                return (
                  <div key={group}>
                    <button
                      onClick={() => toggleGroup(group)}
                      className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground mb-1.5 flex items-center gap-1.5"
                    >
                      <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center", allOn ? "bg-primary border-primary" : "border-border")}>
                        {allOn && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </span>
                      {group}
                    </button>
                    <div className="grid grid-cols-2 gap-1.5 pl-1">
                      {paths.map((p) => {
                        const on = selected.has(p.to);
                        return (
                          <button
                            key={p.to}
                            onClick={() => toggle(p.to)}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs text-left transition-colors",
                              on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                            )}
                          >
                            <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary" : "border-border")}>
                              {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                            </span>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border/70 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => mut.mutate()} loading={mut.isPending}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [permTarget, setPermTarget] = useState<User | null>(null);
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "viewer" });

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users");
      return data && typeof data === "object" ? data : { items: [], total: 0 };
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiClient.post("/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setForm({ username: "", email: "", password: "", role: "viewer" });
      toast({ title: "User created", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (err) => toast({ title: "Failed to create user", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User deleted", variant: "success" } as { title: string; variant: "success" });
    },
    onError: (err) => toast({ title: "Cannot delete user", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" }),
  });

  const requestDelete = async (user: User) => {
    const ok = await confirm({
      title: `Delete ${user.username}?`,
      description: "This removes their dashboard account and ends their sessions.",
      confirmLabel: "Delete user",
      severity: "danger",
    });
    if (ok) deleteMutation.mutate(user.id);
  };

  return (
    <div className="p-6 space-y-5">
      {confirmDialog}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dashboard Users</h2>
          <p className="text-sm text-muted-foreground">{users?.total ?? 0} accounts</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" /> New user
        </Button>
      </div>

      {/* Self password change */}
      <SelfPasswordCard />

      {showCreate && (
        <Card>
          <CardHeader className="pb-3"><CardTitle>Create user</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Username</label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@pi.local" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Password</label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full h-9 bg-background border border-border rounded-lg px-3 text-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              New users get full access for their role. Use “Access” on the row to restrict which tabs they see.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form)} loading={createMutation.isPending}>Create user</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">User</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Role</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Access</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs hidden md:table-cell">Last login</th>
                <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">Status</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : (users?.items ?? []).map((user: User) => (
                    <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {user.username[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{user.username}</p>
                            {user.full_name && <p className="text-xs text-muted-foreground">{user.full_name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{user.email}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={ROLE_COLORS[user.role] ?? "muted"} className="capitalize">{user.role}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {user.allowed_pages == null ? (
                          <span className="text-xs text-muted-foreground">All tabs</span>
                        ) : (
                          <Badge variant="info">{user.allowed_pages.length} tabs</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs hidden md:table-cell">
                        {formatDate(user.last_login_at)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={user.is_active ? "success" : "destructive"}>
                          {user.is_active ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" title="Access & role" onClick={() => setPermTarget(user)}>
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon-sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete"
                            onClick={() => requestDelete(user)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {permTarget && <PermissionsModal user={permTarget} onClose={() => setPermTarget(null)} />}
    </div>
  );
}
