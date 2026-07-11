import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  User as UserIcon, KeyRound, Shield, Clock, MapPin, LogIn,
  CheckCircle2, Eye, EyeOff,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { useAuthStore } from "@/stores/authStore";
import { PageHelp } from "@/components/ui/page-help";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  admin: "success",
  operator: "warning",
  viewer: "outline",
};

// ─── Password field ───────────────────────────────────────────────────────────

function PwField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  onEnter?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-9"
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const user = useAuthStore((s) => s.user);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const changePwMut = useMutation({
    mutationFn: () =>
      apiClient.put("/users/me/password", {
        current_password: currentPw,
        new_password: newPw,
      }),
    onSuccess: () => {
      toast({ title: "Password updated", variant: "success" } as { title: string; variant: "success" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
    onError: (err) =>
      toast({
        title: "Failed to change password",
        description: getApiError(err),
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" }),
  });

  const submitPw = () => {
    if (!currentPw) {
      toast({ title: "Enter your current password", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    if (newPw.length < 8) {
      toast({ title: "New password must be at least 8 characters", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ title: "Passwords don't match", variant: "destructive" } as { title: string; variant: "destructive" });
      return;
    }
    changePwMut.mutate();
  };

  if (!user) return null;

  const pwsMatch = newPw.length > 0 && confirmPw.length > 0 && newPw === confirmPw;
  const pwsMismatch = newPw.length > 0 && confirmPw.length > 0 && newPw !== confirmPw;

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">My Account</h2>
        <PageHelp
          title="My Account"
          points={[
            "View your dashboard account information",
            "Change your login password at any time",
            "Your role (admin / operator / viewer) determines what you can access",
            "Contact an admin if you need your role or email updated",
          ]}
        />
      </div>

      {/* ── Profile card ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar + display name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xl font-bold text-primary uppercase select-none shrink-0">
              {user.username.slice(0, 2)}
            </div>
            <div>
              <p className="text-base font-semibold leading-tight">
                {user.full_name || user.username}
              </p>
              <p className="text-sm text-muted-foreground font-mono">@{user.username}</p>
              <Badge
                variant={ROLE_VARIANT[user.role] ?? "outline"}
                className="mt-1.5 capitalize"
              >
                {user.role}
              </Badge>
            </div>
          </div>

          {/* Details tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {user.email && (
              <div className="surface-tile">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Email</p>
                <p className="text-sm font-medium mt-0.5 truncate">{user.email}</p>
              </div>
            )}
            <div className="surface-tile">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Shield className="w-3 h-3" /> Access level
              </p>
              <p className="text-sm font-medium mt-0.5 capitalize">{user.role}</p>
            </div>
            {user.created_at && (
              <div className="surface-tile">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Account created
                </p>
                <p className="text-sm font-medium mt-0.5">{fmt(user.created_at)}</p>
              </div>
            )}
            {(user.last_login_at || user.last_login_ip) && (
              <div className="surface-tile">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <LogIn className="w-3 h-3" /> Last login
                </p>
                <p className="text-sm font-medium mt-0.5">{fmt(user.last_login_at)}</p>
                {user.last_login_ip && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" /> {user.last_login_ip}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Change password card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PwField
            label="Current password"
            value={currentPw}
            onChange={setCurrentPw}
            placeholder="Your current login password"
            autoComplete="current-password"
          />
          <PwField
            label="New password"
            value={newPw}
            onChange={setNewPw}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <PwField
            label="Confirm new password"
            value={confirmPw}
            onChange={setConfirmPw}
            placeholder="Repeat new password"
            autoComplete="new-password"
            onEnter={submitPw}
          />

          {/* Match indicator */}
          {(pwsMatch || pwsMismatch) && (
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs",
                pwsMatch ? "text-success" : "text-destructive"
              )}
            >
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {pwsMatch ? "Passwords match" : "Passwords don't match"}
            </div>
          )}

          <Button
            className="gap-1.5 mt-1"
            onClick={submitPw}
            loading={changePwMut.isPending}
            disabled={!currentPw || !newPw || !confirmPw || pwsMismatch}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
