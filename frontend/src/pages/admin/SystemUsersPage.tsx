import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserCog, UserPlus, Trash2, Lock, Unlock, KeyRound, ShieldCheck,
  Users as UsersIcon, ChevronDown, ChevronUp, Terminal, FolderLock, Plus, X,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { useStepUp } from "@/components/ui/step-up-dialog";
import type { StepUpResult } from "@/components/ui/step-up-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemUser {
  username: string;
  uid: number;
  gid: number;
  full_name: string;
  home: string;
  shell: string;
  groups: string[];
  is_sudo: boolean;
  is_locked: boolean;
  is_system: boolean;
  is_protected: boolean;
  is_root: boolean;
}

interface FileAcl {
  path: string;
  owner: string;
  group: string;
  acl: { user: string; perms: string }[];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemUsersPage() {
  const qc = useQueryClient();
  const { stepUp, dialog: stepUpDialog, close: closeStepUp } = useStepUp();
  const [showSystem, setShowSystem] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["system-users", showSystem],
    queryFn: async () => {
      const { data } = await apiClient.get(`/system-users?include_system=${showSystem}`);
      return Array.isArray(data?.users) ? (data.users as SystemUser[]) : [];
    },
    refetchInterval: 30000,
  });

  // Runs a mutating request behind the step-up dialog. Re-prompts on wrong
  // password so the user can retry without losing their place.
  async function withStepUp<T>(
    opts: { title?: string; description?: string },
    run: (creds: StepUpResult) => Promise<T>,
  ): Promise<T | undefined> {
    const creds = await stepUp(opts);
    if (!creds) return undefined;
    try {
      const result = await run(creds);
      closeStepUp();
      qc.invalidateQueries({ queryKey: ["system-users"] });
      return result;
    } catch (err) {
      closeStepUp();
      toast({
        title: "Action failed",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
      return undefined;
    }
  }

  const users = data ?? [];
  const humanCount = users.filter((u) => !u.is_system).length;
  const sudoCount = users.filter((u) => u.is_sudo).length;
  const lockedCount = users.filter((u) => u.is_locked).length;

  return (
    <div className="p-6 space-y-5">
      {stepUpDialog}

      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Pi Users</h2>
          <PageHelp
            title="Pi (Linux) users"
            points={[
              "Manage the Linux accounts on the Pi itself",
              "Add or delete users, set passwords, lock accounts",
              "Grant sudo and manage group membership",
              "Control which files each user can access (ACLs)",
              "Every change asks for your dashboard + Pi root password",
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show system accounts
            <Switch checked={showSystem} onCheckedChange={setShowSystem} />
          </label>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-3.5 h-3.5" /> Add user
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Human users</p>
          <p className="text-2xl font-bold tabular-nums">{humanCount}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">With sudo</p>
          <p className="text-2xl font-bold tabular-nums text-warning">{sudoCount}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Locked</p>
          <p className="text-2xl font-bold tabular-nums text-destructive">{lockedCount}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Total shown</p>
          <p className="text-2xl font-bold tabular-nums">{users.length}</p>
        </div>
      </div>

      {/* User list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-3.5 h-3.5" />
            Accounts on the Pi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <SkeletonList count={5} />
          ) : users.length === 0 ? (
            <EmptyState icon={UserCog} title="No users found" description="Could not read the Pi's user database." />
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <SystemUserRow key={u.username} user={u} withStepUp={withStepUp} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          withStepUp={withStepUp}
        />
      )}
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

type StepUpRunner = <T>(
  opts: { title?: string; description?: string },
  run: (creds: StepUpResult) => Promise<T>,
) => Promise<T | undefined>;

function SystemUserRow({ user: u, withStepUp }: { user: SystemUser; withStepUp: StepUpRunner }) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [groupsText, setGroupsText] = useState(u.groups.join(", "));
  const [aclPath, setAclPath] = useState("");
  const [aclPerms, setAclPerms] = useState("rx");
  const [acl, setAcl] = useState<FileAcl | null>(null);

  const toggleLock = () =>
    withStepUp(
      {
        title: u.is_locked ? `Unlock ${u.username}?` : `Lock ${u.username}?`,
        description: u.is_locked
          ? "The account will be able to log in again."
          : "The account will be blocked from logging in.",
      },
      (creds) =>
        apiClient.post(`/system-users/${u.username}/lock`, { ...creds, locked: !u.is_locked }),
    ).then((r) => { if (r !== undefined) toast({ title: u.is_locked ? "Unlocked" : "Locked", variant: "success" } as { title: string; variant: "success" }); });

  const setPassword = () => {
    if (newPw.length < 6) {
      toast({ title: "Password too short", description: "At least 6 characters.", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
      return;
    }
    withStepUp(
      { title: `Set password for ${u.username}` },
      (creds) => apiClient.post(`/system-users/${u.username}/password`, { ...creds, password: newPw }),
    ).then((r) => { if (r !== undefined) { setNewPw(""); toast({ title: "Password updated", variant: "success" } as { title: string; variant: "success" }); } });
  };

  const saveGroups = () => {
    const groups = groupsText.split(",").map((g) => g.trim()).filter(Boolean);
    withStepUp(
      { title: `Update groups for ${u.username}` },
      (creds) => apiClient.post(`/system-users/${u.username}/groups`, { ...creds, groups }),
    ).then((r) => { if (r !== undefined) toast({ title: "Groups updated", variant: "success" } as { title: string; variant: "success" }); });
  };

  const toggleSudo = () =>
    withStepUp(
      {
        title: u.is_sudo ? `Remove sudo from ${u.username}?` : `Grant sudo to ${u.username}?`,
        description: u.is_sudo
          ? "The user loses administrative privileges."
          : "The user will be able to run commands as root.",
      },
      (creds) =>
        apiClient.post(`/system-users/${u.username}/groups`, {
          ...creds,
          groups: u.groups,
          is_sudo: !u.is_sudo,
        }),
    ).then((r) => { if (r !== undefined) toast({ title: u.is_sudo ? "Sudo removed" : "Sudo granted", variant: "success" } as { title: string; variant: "success" }); });

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${u.username}?`,
      description: "This removes the Linux account. Tick nothing to keep their home directory.",
      confirmLabel: "Delete user",
      severity: "critical",
      typeToConfirm: u.username,
    });
    if (!ok) return;
    withStepUp(
      { title: `Delete ${u.username}` },
      (creds) => apiClient.delete(`/system-users/${u.username}`, { data: { ...creds, remove_home: false } }),
    ).then((r) => { if (r !== undefined) toast({ title: `${u.username} deleted`, variant: "success" } as { title: string; variant: "success" }); });
  };

  const loadAcl = async () => {
    if (!aclPath.trim()) return;
    try {
      const { data } = await apiClient.get(`/system-users/file-access?path=${encodeURIComponent(aclPath.trim())}`);
      setAcl(data);
    } catch (err) {
      toast({ title: "Cannot read path", description: getApiError(err), variant: "destructive" } as { title: string; description: string; variant: "destructive" });
    }
  };

  const grantAcl = () =>
    withStepUp(
      { title: `Grant ${u.username} access`, description: `${aclPerms} on ${aclPath}` },
      (creds) => apiClient.post(`/system-users/file-access/grant`, {
        ...creds, username: u.username, path: aclPath.trim(), perms: aclPerms,
      }),
    ).then((r) => { if (r !== undefined) { setAcl((r as { data: FileAcl }).data); toast({ title: "Access granted", variant: "success" } as { title: string; variant: "success" }); } });

  const revokeAcl = () =>
    withStepUp(
      { title: `Revoke ${u.username} access`, description: `on ${aclPath}` },
      (creds) => apiClient.post(`/system-users/file-access/revoke`, {
        ...creds, username: u.username, path: aclPath.trim(),
      }),
    ).then((r) => { if (r !== undefined) { setAcl((r as { data: FileAcl }).data); toast({ title: "Access revoked", variant: "success" } as { title: string; variant: "success" }); } });

  return (
    <div className="rounded-xl border border-border/70 overflow-hidden">
      {confirmDialog}

      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
          {u.username.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate flex items-center gap-2">
            {u.username}
            {u.is_root && <Badge variant="destructive" className="text-[10px]">root</Badge>}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            uid {u.uid} · {u.shell}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          {u.is_sudo && <Badge variant="warning" className="gap-1"><ShieldCheck className="w-2.5 h-2.5" /> sudo</Badge>}
          {u.is_locked && <Badge variant="destructive" className="gap-1"><Lock className="w-2.5 h-2.5" /> locked</Badge>}
          {u.is_system && <Badge variant="outline" className="text-muted-foreground">system</Badge>}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-muted/30 px-4 py-4 space-y-4">
          {u.is_protected && (
            <p className="text-[11px] text-warning">
              This is a protected account — deletion and locking are disabled for safety.
            </p>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleLock} disabled={u.is_protected}>
              {u.is_locked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
            </Button>
            <Button
              variant="outline" size="sm"
              className={cn("gap-1.5", u.is_sudo ? "text-destructive hover:text-destructive" : "text-warning hover:text-warning")}
              onClick={toggleSudo} disabled={u.is_root}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> {u.is_sudo ? "Remove sudo" : "Grant sudo"}
            </Button>
            <Button
              variant="ghost" size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive ml-auto"
              onClick={remove} disabled={u.is_protected}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>

          {/* Set password */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Set a new password
            </p>
            <div className="flex gap-2">
              <Input type="password" placeholder="New password (min 6 chars)" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="max-w-xs" />
              <Button size="sm" onClick={setPassword} disabled={!newPw}>Set password</Button>
            </div>
          </div>

          {/* Groups */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <UsersIcon className="w-3.5 h-3.5" /> Groups (comma separated)
            </p>
            <div className="flex gap-2">
              <Input value={groupsText} onChange={(e) => setGroupsText(e.target.value)} className="font-mono text-xs" placeholder="sudo, docker, gpio" />
              <Button size="sm" variant="outline" onClick={saveGroups}>Save</Button>
            </div>
          </div>

          {/* File access (ACLs) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <FolderLock className="w-3.5 h-3.5" /> File access — grant or revoke this user on a path
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]">
                <Input value={aclPath} onChange={(e) => setAclPath(e.target.value)} placeholder="/home/shared or /opt/data" className="font-mono text-xs" />
              </div>
              <select
                value={aclPerms}
                onChange={(e) => setAclPerms(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
              >
                <option value="r">read</option>
                <option value="rx">read + enter</option>
                <option value="rw">read + write</option>
                <option value="rwx">read + write + enter</option>
              </select>
              <Button size="sm" variant="outline" onClick={loadAcl}>Inspect</Button>
              <Button size="sm" className="gap-1" onClick={grantAcl} disabled={!aclPath.trim()}>
                <Plus className="w-3 h-3" /> Grant
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={revokeAcl} disabled={!aclPath.trim()}>
                <X className="w-3 h-3" /> Revoke
              </Button>
            </div>
            {acl && (
              <div className="mt-2 rounded-lg bg-background border border-border/60 p-3 text-xs font-mono space-y-1">
                <p className="text-muted-foreground">{acl.path} — owner {acl.owner}:{acl.group}</p>
                {acl.acl.length === 0 ? (
                  <p className="text-muted-foreground/60">No extra user ACLs.</p>
                ) : (
                  acl.acl.map((e) => (
                    <p key={e.user} className={cn(e.user === u.username && "text-primary")}>
                      {e.user}: {e.perms}
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({ onClose, withStepUp }: { onClose: () => void; withStepUp: StepUpRunner }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSudo, setIsSudo] = useState(false);
  const [createHome, setCreateHome] = useState(true);
  const [shell, setShell] = useState("/bin/bash");

  const { data: shells } = useQuery({
    queryKey: ["system-shells"],
    queryFn: async () => {
      const { data } = await apiClient.get("/system-users/shells");
      return Array.isArray(data?.shells) ? (data.shells as string[]) : ["/bin/bash"];
    },
  });

  const submit = () => {
    if (!username.trim() || password.length < 6) {
      toast({ title: "Check the form", description: "A username and a 6+ char password are required.", variant: "destructive" } as { title: string; description: string; variant: "destructive" });
      return;
    }
    withStepUp(
      { title: `Create user ${username}` },
      (creds) => apiClient.post("/system-users", {
        ...creds,
        username: username.trim(),
        password,
        full_name: fullName.trim() || null,
        shell,
        create_home: createHome,
        is_sudo: isSudo,
      }),
    ).then((r) => {
      if (r !== undefined) {
        toast({ title: `User ${username} created`, variant: "success" } as { title: string; variant: "success" });
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="page-transition max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold">Add a Pi user</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seif" className="font-mono" autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Full name (optional)</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seif" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Login shell</label>
            <select value={shell} onChange={(e) => setShell(e.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm">
              {(shells ?? ["/bin/bash"]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-2"><Terminal className="w-3.5 h-3.5" /> Create home directory</span>
            <Switch checked={createHome} onCheckedChange={setCreateHome} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> Grant sudo (admin)</span>
            <Switch checked={isSudo} onCheckedChange={setIsSudo} />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={submit}>Create user</Button>
        </div>
      </div>
    </div>
  );
}
