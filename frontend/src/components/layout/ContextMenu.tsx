import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ChevronLeft, ChevronRight, Clipboard, Code2, Columns2,
  ExternalLink, FileText, FolderOpen, Loader2,
  Maximize2, Minimize2, Network, Play, Power,
  RefreshCw, Search, Square, Terminal, Trash2, Wifi, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/api/client";
import { useSplitStore } from "@/stores/splitStore";
import { useNotificationStore } from "@/stores/notificationStore";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CtxAction {
  id:       string;
  icon?:    React.ComponentType<{ className?: string }>;
  label:    string;
  kbd?:     string;
  run:      () => void | Promise<void>;
  disabled?: boolean;
  danger?:  boolean;
  divider?: boolean;
}

interface CtxHeader {
  icon?:  React.ComponentType<{ className?: string }>;
  label:  string;
  sub?:   string;
}

interface MenuState {
  x:       number;
  y:       number;
  header?: CtxHeader;
  actions: CtxAction[];
}

interface ContextMenuProps {
  canGoBack:     boolean;
  canGoForward:  boolean;
  goBack:        () => void;
  goForward:     () => void;
  focusMode:     boolean;
  onToggleFocus: () => void;
}

// ── DOM helpers ────────────────────────────────────────────────────────────────

function walkCtx(el: HTMLElement | null): { type: string; data: DOMStringMap } | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.dataset.ctx) return { type: cur.dataset.ctx, data: cur.dataset };
    cur = cur.parentElement;
  }
  return null;
}

function dedup(actions: CtxAction[]): CtxAction[] {
  return actions.filter((a, i, arr) => {
    if (!a.divider) return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    if (!prev || prev.divider) return false;
    if (!next || next.divider) return false;
    return true;
  });
}

function divider(id: string): CtxAction {
  return { id, divider: true, label: "", run: () => {} };
}

// ── Menu Item ──────────────────────────────────────────────────────────────────

function Item({
  a, loadingId, onRun,
}: {
  a:         CtxAction;
  loadingId: string | null;
  onRun:     (a: CtxAction) => void;
}) {
  if (a.divider) return <div className="my-1 h-px bg-border/50 mx-1.5" />;
  const Icon     = a.icon;
  const isLoading = loadingId === a.id;

  return (
    <button
      disabled={a.disabled || isLoading}
      onClick={() => { if (!a.disabled && !isLoading) onRun(a); }}
      className={cn(
        "group w-full flex items-center gap-2.5 px-2.5 py-[5px] rounded-lg text-left text-[12.5px] transition-colors",
        a.disabled
          ? "opacity-30 cursor-not-allowed text-foreground/50"
          : a.danger
          ? "hover:bg-destructive/12 hover:text-destructive text-foreground/75"
          : "hover:bg-primary/8 hover:text-foreground text-foreground/75",
      )}
    >
      <span className="w-4 flex items-center justify-center shrink-0">
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/60" />
        ) : Icon ? (
          <Icon className={cn(
            "w-3.5 h-3.5 transition-colors shrink-0",
            a.danger
              ? "text-destructive/50 group-hover:text-destructive"
              : "text-muted-foreground/45 group-hover:text-primary",
          )} />
        ) : null}
      </span>
      <span className="flex-1 truncate">{a.label}</span>
      {a.kbd && !isLoading && (
        <kbd className="text-[9.5px] text-muted-foreground/35 font-mono tracking-wide ml-1 shrink-0">
          {a.kbd}
        </kbd>
      )}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ContextMenu({
  canGoBack, canGoForward, goBack, goForward, focusMode, onToggleFocus,
}: ContextMenuProps) {
  const navigate               = useNavigate();
  const location               = useLocation();
  const { setSplit, enabled: splitEnabled } = useSplitStore();
  const { addNotification }    = useNotificationStore();
  const [menu, setMenu]        = useState<MenuState | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const menuRef                = useRef<HTMLDivElement>(null);

  // ── Action runner ────────────────────────────────────────────────────────────

  const runAction = useCallback(async (a: CtxAction) => {
    if (a.disabled) return;
    const result = a.run();
    if (result instanceof Promise) {
      setLoadingId(a.id);
      try {
        await result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addNotification("Error", msg, "error");
      } finally {
        setLoadingId(null);
        setMenu(null);
      }
    } else {
      setMenu(null);
    }
  }, [addNotification]);

  // ── Action builders ──────────────────────────────────────────────────────────

  const buildActions = useCallback((target: HTMLElement): Omit<MenuState, "x" | "y"> => {
    const contextActions: CtxAction[] = [];
    let header: CtxHeader | undefined;

    // ── Selected text ──────────────────────────────────────────────────────────
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (selection.length > 0 && selection.length < 200) {
      contextActions.push({
        id: "copy-selection", icon: Clipboard,
        label: `Copy "${selection.length > 30 ? selection.slice(0, 30) + "…" : selection}"`,
        run: () => navigator.clipboard.writeText(selection),
      });
      contextActions.push(divider("d-sel"));
    }

    // ── data-ctx attributes (walk up DOM) ─────────────────────────────────────
    const ctx = walkCtx(target);

    if (ctx?.type === "ip" && ctx.data.ctxValue) {
      const ip = ctx.data.ctxValue;
      header = { icon: Wifi, label: "IP Address", sub: ip };
      contextActions.push({
        id: "copy-ip", icon: Clipboard, label: "Copy IP address",
        run: () => navigator.clipboard.writeText(ip),
      });
      contextActions.push({
        id: "ping-ip", icon: Activity, label: "Ping host",
        run: async () => {
          const { data } = await apiClient.post<{ success: boolean; time_ms: number | null }>("/network/ping", { host: ip });
          addNotification(
            data.success ? `✓ Ping ${ip}` : `✗ Ping ${ip}`,
            data.success ? `${data.time_ms?.toFixed(1)} ms` : "Unreachable",
            data.success ? "success" : "error",
          );
        },
      });
      contextActions.push({
        id: "scan-ip", icon: Search, label: "Port scan",
        run: () => navigate(`/network?tab=scanner&host=${ip}`),
      });
      contextActions.push({
        id: "ssh-ip", icon: Terminal, label: "SSH to host",
        run: () => navigate(`/terminal?cmd=ssh ${ip}`),
      });
      contextActions.push(divider("d-ip"));
    }

    else if (ctx?.type === "mac" && ctx.data.ctxValue) {
      const mac = ctx.data.ctxValue;
      header = { icon: Network, label: "MAC Address", sub: mac };
      contextActions.push({
        id: "copy-mac", icon: Clipboard, label: "Copy MAC address",
        run: () => navigator.clipboard.writeText(mac),
      });
      contextActions.push({
        id: "wol-mac", icon: Power, label: "Wake-on-LAN",
        run: async () => {
          await apiClient.post("/network/wol", { mac });
          addNotification("Wake-on-LAN", `Magic packet sent to ${mac}`, "success");
        },
      });
      contextActions.push(divider("d-mac"));
    }

    else if (ctx?.type === "device") {
      const ip  = ctx.data.ctxValue ?? "";
      const mac = ctx.data.ctxMac ?? "";
      const name = ctx.data.ctxName ?? ip;
      header = { icon: Network, label: "Device", sub: name };
      if (ip) {
        contextActions.push({
          id: "copy-dev-ip", icon: Clipboard, label: `Copy IP  (${ip})`,
          run: () => navigator.clipboard.writeText(ip),
        });
        contextActions.push({
          id: "ping-dev", icon: Activity, label: "Ping",
          run: async () => {
            const { data } = await apiClient.post<{ success: boolean; time_ms: number | null }>("/network/ping", { host: ip });
            addNotification(
              data.success ? `✓ ${ip}` : `✗ ${ip}`,
              data.success ? `${data.time_ms?.toFixed(1)} ms` : "Unreachable",
              data.success ? "success" : "error",
            );
          },
        });
        contextActions.push({
          id: "scan-dev", icon: Search, label: "Port scan",
          run: () => navigate(`/network?tab=scanner&host=${ip}`),
        });
        contextActions.push({
          id: "ssh-dev", icon: Terminal, label: "SSH to host",
          run: () => navigate(`/terminal?cmd=ssh ${ip}`),
        });
      }
      if (mac) {
        contextActions.push({
          id: "copy-dev-mac", icon: Clipboard, label: `Copy MAC (${mac})`,
          run: () => navigator.clipboard.writeText(mac),
        });
        contextActions.push({
          id: "wol-dev", icon: Power, label: "Wake-on-LAN",
          run: async () => {
            await apiClient.post("/network/wol", { mac });
            addNotification("Wake-on-LAN", `Magic packet sent to ${mac}`, "success");
          },
        });
      }
      contextActions.push(divider("d-dev"));
    }

    else if (ctx?.type === "process") {
      const pid  = ctx.data.ctxValue ?? "";
      const name = ctx.data.ctxName  ?? `PID ${pid}`;
      header = { icon: Terminal, label: "Process", sub: `${name}  ·  PID ${pid}` };
      contextActions.push({
        id: "copy-pid", icon: Clipboard, label: `Copy PID (${pid})`,
        run: () => navigator.clipboard.writeText(pid),
      });
      contextActions.push({
        id: "kill-term", icon: Square, label: "Kill (SIGTERM)", danger: true,
        run: async () => {
          await apiClient.post(`/processes/${pid}/kill`, { signal: 15 });
          addNotification("Sent SIGTERM", `PID ${pid} — ${name}`, "warning");
        },
      });
      contextActions.push({
        id: "kill-9", icon: Trash2, label: "Force kill (SIGKILL)", danger: true,
        run: async () => {
          await apiClient.post(`/processes/${pid}/kill`, { signal: 9 });
          addNotification("Sent SIGKILL", `PID ${pid} — ${name}`, "error");
        },
      });
      contextActions.push(divider("d-proc"));
    }

    else if (ctx?.type === "container") {
      const id     = ctx.data.ctxValue ?? "";
      const name   = ctx.data.ctxName   ?? id.slice(0, 12);
      const status = ctx.data.ctxStatus ?? "";
      header = { icon: Zap, label: "Container", sub: `${name}  ·  ${status}` };
      const running = status === "running";
      if (!running) {
        contextActions.push({
          id: "docker-start", icon: Play, label: "Start container",
          run: async () => {
            await apiClient.post(`/docker/containers/${id}/start`);
            addNotification("Container started", name, "success");
          },
        });
      } else {
        contextActions.push({
          id: "docker-stop", icon: Square, label: "Stop container", danger: true,
          run: async () => {
            await apiClient.post(`/docker/containers/${id}/stop`);
            addNotification("Container stopped", name, "warning");
          },
        });
      }
      contextActions.push({
        id: "docker-restart", icon: RefreshCw, label: "Restart container",
        run: async () => {
          await apiClient.post(`/docker/containers/${id}/restart`);
          addNotification("Container restarted", name, "info");
        },
      });
      contextActions.push({
        id: "docker-logs", icon: FileText, label: "View logs",
        run: () => navigate(`/docker?tab=containers`),
      });
      contextActions.push({
        id: "copy-cid", icon: Clipboard, label: "Copy container ID",
        run: () => navigator.clipboard.writeText(id),
      });
      contextActions.push(divider("d-cont"));
    }

    else if (ctx?.type === "service") {
      const name   = ctx.data.ctxValue ?? "";
      const status = ctx.data.ctxStatus ?? "";
      header = { icon: Zap, label: "Service", sub: `${name}  ·  ${status}` };
      const active = status === "active";
      if (!active) {
        contextActions.push({
          id: "svc-start", icon: Play, label: "Start service",
          run: async () => {
            await apiClient.post(`/system/services/${name}/start`);
            addNotification("Service started", name, "success");
          },
        });
      } else {
        contextActions.push({
          id: "svc-stop", icon: Square, label: "Stop service", danger: true,
          run: async () => {
            await apiClient.post(`/system/services/${name}/stop`);
            addNotification("Service stopped", name, "warning");
          },
        });
      }
      contextActions.push({
        id: "svc-restart", icon: RefreshCw, label: "Restart service",
        run: async () => {
          await apiClient.post(`/system/services/${name}/restart`);
          addNotification("Service restarted", name, "info");
        },
      });
      contextActions.push({
        id: "svc-logs", icon: FileText, label: "View logs",
        run: () => navigate(`/system?tab=logs`),
      });
      contextActions.push({
        id: "copy-svc", icon: Clipboard, label: "Copy service name",
        run: () => navigator.clipboard.writeText(name),
      });
      contextActions.push(divider("d-svc"));
    }

    else if (ctx?.type === "log-line" && ctx.data.ctxValue) {
      const line = ctx.data.ctxValue;
      header = { icon: FileText, label: "Log Entry" };
      contextActions.push({
        id: "copy-log", icon: Clipboard, label: "Copy log line",
        run: () => navigator.clipboard.writeText(line),
      });
      contextActions.push({
        id: "filter-log", icon: Search, label: "Filter logs for this",
        run: () => navigate(`/system?tab=logs&q=${encodeURIComponent(line.slice(0, 60))}`),
      });
      contextActions.push(divider("d-log"));
    }

    else if (ctx?.type === "filepath" && ctx.data.ctxValue) {
      const path = ctx.data.ctxValue;
      header = { icon: FolderOpen, label: "File Path", sub: path };
      contextActions.push({
        id: "copy-path", icon: Clipboard, label: "Copy path",
        run: () => navigator.clipboard.writeText(path),
      });
      contextActions.push({
        id: "open-files", icon: FolderOpen, label: "Open in Files",
        run: () => navigate(`/files?path=${encodeURIComponent(path)}`),
      });
      contextActions.push({
        id: "open-terminal", icon: Terminal, label: "Open terminal here",
        run: () => navigate(`/terminal?cmd=cd ${path}`),
      });
      contextActions.push(divider("d-path"));
    }

    // ── DOM element detection ──────────────────────────────────────────────────

    else {
      // Anchor link
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link) {
        header = { icon: ExternalLink, label: "Link", sub: link.href.slice(0, 60) };
        contextActions.push({
          id: "link-tab", icon: ExternalLink, label: "Open in new tab",
          run: () => { window.open(link.href, "_blank"); },
        });
        contextActions.push({
          id: "link-copy", icon: Clipboard, label: "Copy link address",
          run: () => navigator.clipboard.writeText(link.href),
        });
        contextActions.push(divider("d-link"));
      }

      // Image element
      const img = target.closest<HTMLImageElement>("img");
      if (img) {
        header = { icon: Search, label: "Image" };
        contextActions.push({
          id: "img-tab", icon: ExternalLink, label: "Open image in new tab",
          run: () => { window.open(img.src, "_blank"); },
        });
        contextActions.push({
          id: "img-copy", icon: Clipboard, label: "Copy image URL",
          run: () => navigator.clipboard.writeText(img.src),
        });
        contextActions.push(divider("d-img"));
      }

      // Code / pre block
      const codeBlock = target.closest("pre, code");
      if (codeBlock) {
        header = { icon: Code2, label: "Code Block" };
        contextActions.push({
          id: "code-copy", icon: Clipboard, label: "Copy code",
          run: () => navigator.clipboard.writeText(codeBlock.textContent ?? ""),
        });
        contextActions.push(divider("d-code"));
      }

      // Input / textarea
      const inputEl = target.closest<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
      if (inputEl && !img && !link) {
        header = { icon: FileText, label: "Input Field" };
        contextActions.push({
          id: "input-copy", icon: Clipboard, label: "Copy value",
          run: () => navigator.clipboard.writeText(inputEl.value),
        });
        contextActions.push({
          id: "input-select", icon: Search, label: "Select all",
          run: () => { inputEl.focus(); inputEl.select(); },
        });
        if (inputEl.value) {
          contextActions.push({
            id: "input-clear", icon: X, label: "Clear field", danger: true,
            run: () => {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, "value",
              )?.set ?? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
              nativeInputValueSetter?.call(inputEl, "");
              inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            },
          });
        }
        contextActions.push(divider("d-input"));
      }
    }

    // ── Universal page actions ─────────────────────────────────────────────────
    const universalActions: CtxAction[] = [
      {
        id: "copy-url", icon: Clipboard, label: "Copy page URL",
        run: () => navigator.clipboard.writeText(window.location.href),
      },
      {
        id: "refresh", icon: RefreshCw, label: "Refresh data", kbd: "R",
        run: () => window.dispatchEvent(new CustomEvent("sudo-pi:refresh")),
      },
      divider("d-u1"),
      {
        id: "go-back",  icon: ChevronLeft,  label: "Go back",    kbd: "Alt+←",
        disabled: !canGoBack,    run: goBack,
      },
      {
        id: "go-fwd",   icon: ChevronRight, label: "Go forward", kbd: "Alt+→",
        disabled: !canGoForward, run: goForward,
      },
      divider("d-u2"),
      {
        id: "focus",
        icon: focusMode ? Minimize2 : Maximize2,
        label: focusMode ? "Exit focus mode" : "Focus mode",
        kbd: "F",
        run: onToggleFocus,
      },
      {
        id: "split",
        icon: Columns2,
        label: splitEnabled ? "Close split view" : "Open split view",
        kbd: "Ctrl+\\",
        run: () => setSplit(!splitEnabled),
      },
    ];

    return {
      header,
      actions: dedup([...contextActions, ...universalActions]),
    };
  }, [
    canGoBack, canGoForward, focusMode, goBack, goForward,
    navigate, addNotification, onToggleFocus, setSplit, splitEnabled,
  ]);

  // ── Event handling ───────────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setLoadingId(null);
    const target  = e.target as HTMLElement;
    const result  = buildActions(target);
    const MENU_W  = 240;
    const MENU_H  = Math.min((result.header ? 36 : 0) + result.actions.length * 30 + 20, 450);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x  = e.clientX + MENU_W + 8 > vw ? e.clientX - MENU_W : e.clientX + 2;
    const y  = e.clientY + MENU_H + 8 > vh ? e.clientY - MENU_H : e.clientY + 2;
    setMenu({ x, y, header: result.header, actions: result.actions });
  }, [buildActions]);

  const close = useCallback(() => { setMenu(null); setLoadingId(null); }, []);

  useEffect(() => {
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, [handleContextMenu]);

  useEffect(() => { close(); }, [location.pathname, close]);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown",   onKey);
    };
  }, [menu, close]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-60 rounded-xl border border-border/60 bg-popover/96 backdrop-blur-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        left: menu.x,
        top:  menu.y,
        boxShadow: "0 20px 60px hsl(260 50% 3%/0.75), 0 0 0 1px hsl(var(--primary)/0.08)",
      }}
    >
      {/* Context header */}
      {menu.header && (
        <div className="flex items-start gap-2 px-3 py-2.5 border-b border-border/50 bg-secondary/20">
          {menu.header.icon && (
            <menu.header.icon className="w-3.5 h-3.5 text-primary/60 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none mb-0.5">
              {menu.header.label}
            </p>
            {menu.header.sub && (
              <p className="text-[11.5px] text-foreground/80 font-mono truncate leading-tight">
                {menu.header.sub}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-1.5">
        {menu.actions.map((a) => (
          <Item
            key={a.id}
            a={a}
            loadingId={loadingId}
            onRun={runAction}
          />
        ))}
      </div>
    </div>
  );
}
