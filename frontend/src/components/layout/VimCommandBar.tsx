import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import type { NotificationLevel } from "@/types";
import { apiClient } from "@/api/client";
import { NAV_GROUPS } from "@/lib/navGroups";
import { cn } from "@/lib/utils";

// ── Command definitions ────────────────────────────────────────────────────────

interface CmdCtx {
  navigate:        ReturnType<typeof useNavigate>;
  addNotification: (title: string, msg: string, level?: NotificationLevel) => void;
}

interface CmdDef {
  name:        string;
  desc:        string;
  argHint?:    string;
  confirm?:    boolean;
  suggestArgs?: (partial: string) => Promise<string[]>;
  run:         (args: string[], ctx: CmdCtx) => Promise<string>;
}

const ALL_PAGES = [
  ...NAV_GROUPS.flatMap((g) => g.items).map((i) => i.to),
  // hub sub-tabs (deep links)
  "/system?tab=metrics", "/system?tab=processes", "/system?tab=logs",
  "/network?tab=devices", "/network?tab=traffic", "/network?tab=scanner",
  "/network/config?tab=dns", "/network/config?tab=control", "/network/config?tab=ports",
  "/network/remote?tab=vpn", "/network/remote?tab=captive", "/network/remote?tab=proxy",
  "/docker?tab=compose",
  "/storage?tab=smart",
  "/security?tab=audit", "/security?tab=firewall",
  "/users?tab=system",
  "/maintenance?tab=updates", "/maintenance?tab=backups", "/maintenance?tab=settings",
];

const CMD_DEFS: CmdDef[] = [
  {
    name: "reboot",
    desc: "Reboot the system",
    confirm: true,
    run: async () => {
      await apiClient.post("/system/reboot");
      return "System rebooting…";
    },
  },
  {
    name: "shutdown",
    desc: "Shut down the system",
    confirm: true,
    run: async () => {
      await apiClient.post("/system/shutdown");
      return "System shutting down…";
    },
  },
  {
    name: "restart",
    desc: "Restart a service",
    argHint: "<service>",
    suggestArgs: async (partial) => {
      try {
        const { data } = await apiClient.get<{ name: string }[]>("/system/services");
        return (data ?? [])
          .map((s) => s.name)
          .filter((n) => n.toLowerCase().includes(partial.toLowerCase()));
      } catch { return []; }
    },
    run: async ([svc]) => {
      if (!svc) throw new Error("Usage: restart <service-name>");
      await apiClient.post(`/system/services/${svc}/restart`);
      return `✓ Restarted: ${svc}`;
    },
  },
  {
    name: "start",
    desc: "Start a service",
    argHint: "<service>",
    suggestArgs: async (partial) => {
      try {
        const { data } = await apiClient.get<{ name: string }[]>("/system/services");
        return (data ?? []).map((s) => s.name).filter((n) => n.toLowerCase().includes(partial.toLowerCase()));
      } catch { return []; }
    },
    run: async ([svc]) => {
      if (!svc) throw new Error("Usage: start <service-name>");
      await apiClient.post(`/system/services/${svc}/start`);
      return `✓ Started: ${svc}`;
    },
  },
  {
    name: "stop",
    desc: "Stop a service",
    argHint: "<service>",
    confirm: true,
    suggestArgs: async (partial) => {
      try {
        const { data } = await apiClient.get<{ name: string }[]>("/system/services");
        return (data ?? []).map((s) => s.name).filter((n) => n.toLowerCase().includes(partial.toLowerCase()));
      } catch { return []; }
    },
    run: async ([svc]) => {
      if (!svc) throw new Error("Usage: stop <service-name>");
      await apiClient.post(`/system/services/${svc}/stop`);
      return `✓ Stopped: ${svc}`;
    },
  },
  {
    name: "ping",
    desc: "Ping a host",
    argHint: "<host>",
    run: async ([host]) => {
      if (!host) throw new Error("Usage: ping <host>");
      try {
        const { data } = await apiClient.post<{ success: boolean; time_ms: number | null }>("/network/ping", { host });
        return data.success
          ? `✓ ${host}: ${data.time_ms?.toFixed(1)}ms`
          : `✗ ${host}: unreachable`;
      } catch { return `✗ ${host}: request failed`; }
    },
  },
  {
    name: "kill",
    desc: "Kill a process (SIGTERM)",
    argHint: "<pid>",
    confirm: true,
    run: async ([pidStr]) => {
      const pid = parseInt(pidStr ?? "");
      if (!pid) throw new Error("Usage: kill <pid>");
      await apiClient.post(`/processes/${pid}/kill`, { signal: 15 });
      return `✓ Sent SIGTERM to PID ${pid}`;
    },
  },
  {
    name: "kill9",
    desc: "Force kill a process (SIGKILL)",
    argHint: "<pid>",
    confirm: true,
    run: async ([pidStr]) => {
      const pid = parseInt(pidStr ?? "");
      if (!pid) throw new Error("Usage: kill9 <pid>");
      await apiClient.post(`/processes/${pid}/kill`, { signal: 9 });
      return `✓ Sent SIGKILL to PID ${pid}`;
    },
  },
  {
    name: "ssh",
    desc: "Open SSH to a host",
    argHint: "<user@host>",
    run: async ([host], { navigate }) => {
      if (!host) throw new Error("Usage: ssh <host>");
      navigate("/terminal");
      return `→ Opening terminal for ssh ${host}`;
    },
  },
  {
    name: "go",
    desc: "Navigate to a page",
    argHint: "<path>",
    suggestArgs: async (partial) =>
      ALL_PAGES.filter((t) => t.includes(partial)).slice(0, 10),
    run: async ([path], { navigate }) => {
      if (!path) throw new Error("Usage: go <path>  e.g. go /logs");
      const target = path.startsWith("/") ? path : `/${path}`;
      navigate(target);
      return `→ ${target}`;
    },
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

interface VimCommandBarProps {
  open:    boolean;
  onClose: () => void;
}

export function VimCommandBar({ open, onClose }: VimCommandBarProps) {
  const navigate         = useNavigate();
  const { addNotification } = useNotificationStore();

  const [input,       setInput]       = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [result,      setResult]      = useState<{ text: string; error?: boolean } | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [confirming,  setConfirming]  = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInput("");
      setResult(null);
      setConfirming(false);
      setSuggestions(CMD_DEFS.map((c) => c.name));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Update suggestions while typing
  useEffect(() => {
    if (!open) return;
    const parts    = input.trim().split(/\s+/);
    const cmdName  = parts[0]?.toLowerCase() ?? "";
    const argInput = parts.slice(1).join(" ");
    const exactCmd = CMD_DEFS.find((c) => c.name === cmdName);

    if (!cmdName) {
      setSuggestions(CMD_DEFS.map((c) => c.name));
      setSelectedIdx(0);
      return;
    }

    if (exactCmd?.suggestArgs && parts.length > 1) {
      exactCmd.suggestArgs(argInput).then((s) => {
        setSuggestions(s);
        setSelectedIdx(0);
      });
      return;
    }

    setSuggestions(CMD_DEFS.map((c) => c.name).filter((n) => n.startsWith(cmdName)));
    setSelectedIdx(0);
  }, [input, open]);

  const execute = useCallback(async () => {
    const parts   = input.trim().split(/\s+/);
    const cmdName = parts[0]?.toLowerCase();
    const args    = parts.slice(1);
    const cmd     = CMD_DEFS.find((c) => c.name === cmdName);

    if (!cmd) {
      setResult({ text: `Unknown command: "${cmdName}". Type to see options.`, error: true });
      return;
    }

    if (cmd.confirm && !confirming) {
      setConfirming(true);
      setResult({ text: `⚠ Confirm: press Enter again to run "${input.trim()}"` });
      return;
    }

    setLoading(true);
    setConfirming(false);
    setResult(null);
    try {
      const text = await cmd.run(args, { navigate, addNotification });
      setResult({ text });
      if (!text.startsWith("→")) setTimeout(onClose, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ text: msg, error: true });
    } finally {
      setLoading(false);
    }
  }, [input, confirming, navigate, addNotification, onClose]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (result || confirming) { setResult(null); setConfirming(false); }
      else { onClose(); }
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); execute(); return; }
    if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      const pick    = suggestions[selectedIdx];
      const parts   = input.trim().split(/\s+/);
      const cmdName = parts[0]?.toLowerCase();
      const exactCmd = CMD_DEFS.find((c) => c.name === cmdName);
      if (exactCmd?.suggestArgs && parts.length > 1) {
        setInput(`${parts[0]} ${pick}`);
      } else {
        setInput(pick);
      }
      setResult(null);
      setConfirming(false);
      return;
    }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx((s) => Math.max(0, s - 1)); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((s) => Math.min(suggestions.length - 1, s + 1)); }
  }, [suggestions, selectedIdx, input, result, confirming, execute, onClose]);

  if (!open) return null;

  const parts      = input.trim().split(/\s+/);
  const cmdName    = parts[0]?.toLowerCase() ?? "";
  const matchedCmd = CMD_DEFS.find((c) => c.name === cmdName);
  const showArgSuggestions = matchedCmd?.suggestArgs && parts.length > 1;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Bar */}
      <div
        className="relative w-[600px] max-w-[95vw] bg-background/95 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        style={{ boxShadow: "0 25px 80px hsl(260 50% 3%/0.8), 0 0 0 1px hsl(var(--primary)/0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="text-primary font-mono text-xl font-bold select-none">:</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setResult(null); setConfirming(false); }}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/30 caret-primary"
            placeholder="command… (reboot · ping · restart · kill · go · ssh)"
            spellCheck={false}
            autoCorrect="off"
          />
          {loading && (
            <div className="w-4 h-4 border-[1.5px] border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
          )}
        </div>

        {/* Result / confirm */}
        {result && (
          <div className={cn(
            "px-5 py-2.5 font-mono text-[12px] border-t border-border/40",
            result.error
              ? "text-destructive bg-destructive/5"
              : confirming
              ? "text-warning bg-warning/5"
              : "text-success bg-success/5",
          )}>
            {result.text}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && !result && (
          <div className="border-t border-border/40 max-h-52 overflow-y-auto py-1">
            {suggestions.slice(0, 9).map((s, i) => {
              const def = CMD_DEFS.find((c) => c.name === s);
              return (
                <button
                  key={s}
                  onClick={() => {
                    if (showArgSuggestions) {
                      setInput(`${parts[0]} ${s}`);
                    } else {
                      setInput(s);
                    }
                    setResult(null);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-5 py-2 text-left text-[12px] transition-colors",
                    i === selectedIdx
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/70 hover:bg-secondary/40",
                  )}
                >
                  <span className="font-mono shrink-0">
                    {s}
                    {def?.argHint && <span className="text-muted-foreground/40 ml-1.5">{def.argHint}</span>}
                  </span>
                  {def?.desc && (
                    <span className="text-[11px] text-muted-foreground/40 truncate">{def.desc}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-5 px-5 py-2 border-t border-border/30 bg-secondary/10">
          {[
            ["Tab", "complete"],
            ["↑↓",  "select"],
            ["Enter","run"],
            ["Esc",  "close"],
          ].map(([k, v]) => (
            <span key={k} className="text-[10px] text-muted-foreground/35">
              <kbd className="font-mono mr-0.5">{k}</kbd>{v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
