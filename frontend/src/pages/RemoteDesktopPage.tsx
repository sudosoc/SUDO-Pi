import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RFB from "@novnc/novnc/lib/rfb";
import {
  Monitor, Play, Square, RefreshCw, Download, KeyRound, Maximize2,
  Eye, EyeOff, Expand, MousePointer2, Power, Loader2, Copy, Check,
} from "lucide-react";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHelp } from "@/components/ui/page-help";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RdStatus {
  installed: boolean;
  vnc_installed: boolean;
  websockify_installed: boolean;
  running: boolean;
  vnc_running: boolean;
  websockify_running: boolean;
  display: string;
  geometry: string;
  websocket_path: string;
  password: string | null;
  summary: string;
}

const rdApi = {
  status: async (): Promise<RdStatus | null> => {
    const { data } = await apiClient.get("/remote-desktop/status");
    return data && typeof data === "object" ? data : null;
  },
  install: async () => (await apiClient.post("/remote-desktop/install")).data,
  start: async () => (await apiClient.post("/remote-desktop/start")).data,
  stop: async () => (await apiClient.post("/remote-desktop/stop")).data,
  restart: async () => (await apiClient.post("/remote-desktop/restart")).data,
  regeneratePassword: async () =>
    (await apiClient.post("/remote-desktop/regenerate-password")).data,
};

function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

type ViewerState = "idle" | "connecting" | "connected" | "disconnected" | "error";

// ─── VNC Viewer ───────────────────────────────────────────────────────────────

function VncViewer({ status }: { status: RdStatus }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [state, setState] = useState<ViewerState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [viewOnly, setViewOnly] = useState(false);
  const [scaled, setScaled] = useState(true);

  const disconnect = useCallback(() => {
    if (rfbRef.current) {
      try { rfbRef.current.disconnect(); } catch { /* ignore */ }
      rfbRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!screenRef.current || !status.password) return;
    disconnect();
    setState("connecting");
    setErrorMsg("");

    try {
      const rfb = new RFB(screenRef.current, wsUrl(status.websocket_path), {
        credentials: { password: status.password },
        shared: true,
      });
      rfb.scaleViewport = scaled;
      rfb.resizeSession = false;
      rfb.viewOnly = viewOnly;
      rfb.background = "hsl(225 25% 5%)";
      rfb.qualityLevel = 6;
      rfb.compressionLevel = 2;

      rfb.addEventListener("connect", () => setState("connected"));
      rfb.addEventListener("disconnect", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setState(detail?.clean ? "disconnected" : "error");
        if (!detail?.clean) setErrorMsg("Connection lost. The session may have stopped.");
      });
      rfb.addEventListener("securityfailure", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setState("error");
        setErrorMsg(`Authentication failed${detail?.reason ? `: ${detail.reason}` : ""}. Try regenerating the password.`);
      });

      rfbRef.current = rfb;
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to initialise the viewer");
    }
  }, [status.password, status.websocket_path, scaled, viewOnly, disconnect]);

  // Reflect toggles live onto the active session
  useEffect(() => {
    if (rfbRef.current) rfbRef.current.viewOnly = viewOnly;
  }, [viewOnly]);
  useEffect(() => {
    if (rfbRef.current) rfbRef.current.scaleViewport = scaled;
  }, [scaled]);

  // Tear down on unmount
  useEffect(() => disconnect, [disconnect]);

  const fullscreen = () => {
    const el = screenRef.current?.parentElement;
    if (el?.requestFullscreen) el.requestFullscreen();
  };

  const sendCtrlAltDel = () => rfbRef.current?.sendCtrlAltDel();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5" />
          Live Screen
          {state === "connected" && (
            <Badge variant="success" className="gap-1 ml-1">
              <span className="status-dot running" /> Connected
            </Badge>
          )}
          {state === "connecting" && (
            <Badge variant="info" className="gap-1 ml-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Connecting
            </Badge>
          )}
        </CardTitle>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {state === "connected" ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                {viewOnly ? <Eye className="w-3.5 h-3.5" /> : <MousePointer2 className="w-3.5 h-3.5" />}
                View only
                <Switch checked={viewOnly} onCheckedChange={setViewOnly} />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                <Expand className="w-3.5 h-3.5" />
                Fit
                <Switch checked={scaled} onCheckedChange={setScaled} />
              </label>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={sendCtrlAltDel}>
                <KeyRound className="w-3.5 h-3.5" /> Ctrl+Alt+Del
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={fullscreen}>
                <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
              </Button>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={disconnect}>
                <Square className="w-3.5 h-3.5" /> Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={connect} disabled={!status.running}>
              <Play className="w-3.5 h-3.5" /> Connect
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="relative rounded-xl border border-border/70 bg-[hsl(225_25%_5%)] overflow-hidden" style={{ minHeight: 420 }}>
          <div ref={screenRef} className="w-full flex items-center justify-center" style={{ minHeight: 420 }} />

          {state !== "connected" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 pointer-events-none">
              {state === "connecting" ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : state === "error" ? (
                <Power className="w-8 h-8 text-destructive" />
              ) : (
                <Monitor className="w-8 h-8 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {state === "connecting" ? "Connecting to the Pi's desktop…"
                    : state === "error" ? "Connection problem"
                    : state === "disconnected" ? "Disconnected"
                    : "Ready to connect"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {errorMsg || (status.running
                    ? "Click Connect to see and control the Pi's screen."
                    : "Start the remote desktop service above first.")}
                </p>
              </div>
              {(state === "disconnected" || state === "error") && status.running && (
                <Button size="sm" className="gap-1.5 pointer-events-auto" onClick={connect}>
                  <RefreshCw className="w-3.5 h-3.5" /> Reconnect
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RemoteDesktopPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["remote-desktop-status"],
    queryFn: rdApi.status,
    refetchInterval: 10000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["remote-desktop-status"] });

  const useAction = (fn: () => Promise<unknown>, okTitle: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast({ title: okTitle, variant: "success" } as { title: string; variant: "success" });
        invalidate();
      },
      onError: (err) =>
        toast({
          title: "Action failed",
          description: getApiError(err),
          variant: "destructive",
        } as { title: string; description: string; variant: "destructive" }),
    });

  const installMut = useAction(rdApi.install, "Remote desktop installed");
  const startMut = useAction(rdApi.start, "Remote desktop started");
  const stopMut = useAction(rdApi.stop, "Remote desktop stopped");
  const restartMut = useAction(rdApi.restart, "Remote desktop restarted");
  const regenMut = useAction(rdApi.regeneratePassword, "New password generated");

  const requestRegen = async () => {
    const ok = await confirm({
      title: "Generate a new password?",
      description: "The current viewer password stops working. Any open sessions will need the new password.",
      confirmLabel: "Regenerate",
      severity: "danger",
    });
    if (ok) regenMut.mutate();
  };

  const copyPw = () => {
    if (!status?.password) return;
    navigator.clipboard?.writeText(status.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const busy =
    installMut.isPending || startMut.isPending || stopMut.isPending || restartMut.isPending;

  return (
    <div className="p-6 space-y-5">
      {dialog}

      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Remote Desktop</h2>
          <PageHelp
            title="Remote desktop"
            points={[
              "See and control the Pi's full graphical desktop in your browser",
              "Runs entirely over the local network — no internet needed",
              "Install once, then start the session and click Connect",
              "Password-protected; regenerate it any time",
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          {status?.installed && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              loading={restartMut.isPending}
              onClick={() => restartMut.mutate()}
              disabled={busy}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Restart
            </Button>
          )}
        </div>
      </div>

      {/* Status / control card */}
      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="h-16 rounded-xl bg-muted animate-pulse" />
          ) : !status?.installed ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  Install remote desktop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Installs TigerVNC, websockify and a lightweight desktop if the Pi has none.
                  This can take a few minutes.
                </p>
              </div>
              <Button
                className="gap-1.5"
                loading={installMut.isPending}
                onClick={() => installMut.mutate()}
              >
                <Download className="w-4 h-4" /> Install now
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Running state row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={cn("status-dot", status.running ? "running" : "stopped")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {status.running ? "Session running" : "Session stopped"}
                    <span className="text-muted-foreground font-normal">
                      {" "}· display {status.display} · {status.geometry}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{status.summary}</p>
                </div>
                {status.running ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    loading={stopMut.isPending}
                    onClick={() => stopMut.mutate()}
                    disabled={busy}
                  >
                    <Square className="w-3.5 h-3.5" /> Stop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    loading={startMut.isPending}
                    onClick={() => startMut.mutate()}
                    disabled={busy}
                  >
                    <Play className="w-3.5 h-3.5" /> Start
                  </Button>
                )}
              </div>

              {/* Password row */}
              {status.password && (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
                  <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">Viewer password</p>
                    <p className="font-mono text-sm tracking-wide">
                      {showPw ? status.password : "••••••••"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowPw((v) => !v)} title={showPw ? "Hide" : "Show"}>
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={copyPw} title="Copy">
                    {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    loading={regenMut.isPending}
                    onClick={requestRegen}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> New
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Viewer */}
      {status?.installed && <VncViewer status={status} />}
    </div>
  );
}
