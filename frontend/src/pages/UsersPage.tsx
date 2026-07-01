import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import type { User } from "@/types";

const ROLE_COLORS: Record<string, "default" | "info" | "muted"> = {
  admin: "default",
  operator: "info",
  viewer: "muted",
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "viewer" });

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users");
      return data;
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
    onError: () => toast({ title: "Failed to create user", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User deleted", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Cannot delete user", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">User Management</h2>
          <p className="text-sm text-muted-foreground">{users?.total ?? 0} users</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" /> New User
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Create User</CardTitle></CardHeader>
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
                  className="w-full h-9 bg-card border border-border rounded-md px-3 text-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form)} loading={createMutation.isPending}>
                Create User
              </Button>
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
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Email</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Role</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs hidden md:table-cell">Last Login</th>
                <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">Status</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 6 }).map((_, j) => (
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
                      <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={ROLE_COLORS[user.role] ?? "muted"} className="capitalize">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs hidden md:table-cell">
                        {formatDate(user.last_login_at)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={user.is_active ? "success" : "destructive"}>
                          {user.is_active ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => confirm(`Delete ${user.username}?`) && deleteMutation.mutate(user.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
