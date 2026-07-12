import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DoorOpen, RefreshCw, CheckCircle2, XCircle, Wifi, WifiOff, Trash2, Users,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PortalStatus {
  enabled: boolean;
  allowed_macs: string[];
  title: string;
  message: string;
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }
  return { msg, toast };
}

function Toast({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <div className={cn(
      "text-sm px-3 py-2 rounded-lg border",
      msg.ok
        ? "border-green-500/30 text-green-400 bg-green-500/5"
        : "border-red-500/30 text-red-400 bg-red-500/5",
    )}>
      {msg.text}
    </div>
  );
}

export default function CaptivePortalPage() {
  const qc = useQueryClient();
  const { msg, toast } = useToast();

  const [title, setTitle] = useState("Welcome to SUDO-Pi");
  const [message, setMessage] = useState("Please accept the terms to connect to the internet.");

  const { data: status, isLoading } = useQuery<PortalStatus>({
    queryKey: ["captive-portal-status"],
    queryFn: async () => {
      const { data } = await apiClient.get<PortalStatus>("/captive-portal/status");
      return data;
    },
    refetchInterval: 10_000,
  });

  const enableMut = useMutation({
    mutationFn: async () => {
      await apiClient.post("/captive-portal/enable", { title, message }, {});
    },
    onSuccess: () => {
      toast("Captive portal enabled.");
      qc.invalidateQueries({ queryKey: ["captive-portal-status"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const disableMut = useMutation({
    mutationFn: async () => {
      await apiClient.post("/captive-portal/disable", {}, {});
    },
    onSuccess: () => {
      toast("Captive portal disabled.");
      qc.invalidateQueries({ queryKey: ["captive-portal-status"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      await apiClient.post("/captive-portal/clear-allowed", {}, {});
    },
    onSuccess: () => {
      toast("Allowed devices cleared.");
      qc.invalidateQueries({ queryKey: ["captive-portal-status"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const enabled = status?.enabled ?? false;
  const allowedMacs = status?.allowed_macs ?? [];

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center gap-3">
        <DoorOpen className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Captive Portal</h2>
          <p className="text-sm text-muted-foreground">
            Redirect guest devices to a consent page before granting internet access.
          </p>
        </div>
      </div>

      <Toast msg={msg} />

      {/* Status card */}
      <Card className={cn(
        "border transition-colors",
        enabled ? "border-green-500/40" : "border-border/60",
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {enabled
              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
              : <XCircle className="w-4 h-4 text-muted-foreground" />
            }
            Portal Status
            <span className={cn(
              "ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full",
              enabled
                ? "bg-green-500/15 text-green-400"
                : "bg-muted text-muted-foreground",
            )}>
              {enabled ? "Active" : "Disabled"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-16 bg-muted rounded-lg animate-pulse" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="metric-card text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
                <p className={cn("text-lg font-bold mt-1", enabled ? "text-green-400" : "text-muted-foreground/50")}>
                  {enabled ? "ON" : "OFF"}
                </p>
              </div>
              <div className="metric-card text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Allowed Devices</p>
                <p className="text-lg font-bold mt-1 text-primary">{allowedMacs.length}</p>
              </div>
              <div className="metric-card text-center sm:col-span-1 col-span-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Portal Port</p>
                <p className="text-lg font-bold mt-1 font-mono">8080</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {enabled ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => disableMut.mutate()}
                disabled={disableMut.isPending}
                className="gap-1.5"
              >
                {disableMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <WifiOff className="w-3.5 h-3.5" />
                Disable Portal
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => enableMut.mutate()}
                disabled={enableMut.isPending || !title.trim() || !message.trim()}
                className="gap-1.5"
              >
                {enableMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <Wifi className="w-3.5 h-3.5" />
                Enable Portal
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customize portal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Portal Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Headline</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Welcome to SUDO-Pi"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message shown to guests</Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Please accept the terms to connect to the internet."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
            <p className="text-[11px] text-muted-foreground">
              Guests see this on the captive portal splash page before clicking Connect.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes take effect when you (re-)enable the portal.
          </p>
        </CardContent>
      </Card>

      {/* Allowed devices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            Allowed Devices
            {allowedMacs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearMut.mutate()}
                disabled={clearMut.isPending}
                className="ml-auto gap-1.5 text-destructive/70 hover:text-destructive text-xs h-7"
              >
                {clearMut.isPending && <RefreshCw className="w-3 h-3 animate-spin" />}
                <Trash2 className="w-3 h-3" />
                Clear all
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allowedMacs.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground/60">No devices have accepted the portal yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {allowedMacs.map((mac) => (
                <div
                  key={mac}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"
                    style={{ boxShadow: "0 0 6px hsl(142 66% 44% / 0.8)" }} />
                  <span className="font-mono text-xs text-foreground/80">{mac}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground/80 list-decimal list-inside">
            <li>When enabled, iptables redirects all HTTP traffic from AP clients to a splash page on port 8080.</li>
            <li>The guest sees your custom message and clicks Connect.</li>
            <li>Their MAC address is added to the allow list and they can browse freely.</li>
            <li>Disabling removes all redirect rules and clears the nginx portal config.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
