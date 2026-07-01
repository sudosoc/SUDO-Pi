import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, Cpu, Terminal, FolderOpen, Wifi, Package, Box, Bluetooth,
  GitBranch, FileText, Network, Flame, Clock, KeyRound, Activity,
  Bell, HardDrive, Monitor, Users, Shield, Settings, MonitorSmartphone,
  Server, Search, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaletteEntry {
  to:    string;
  label: string;
  icon:  React.ComponentType<{ className?: string }>;
  tags?: string[];
}

const ENTRIES: PaletteEntry[] = [
  { to: "/",          label: "Dashboard",      icon: Home,            tags: ["home", "overview"] },
  { to: "/system",    label: "System Monitor", icon: Cpu,             tags: ["cpu", "memory", "hardware"] },
  { to: "/processes", label: "Process Manager",icon: Server,          tags: ["processes", "ps", "kill", "pid"] },
  { to: "/terminal",  label: "Terminal",       icon: Terminal,        tags: ["bash", "shell", "cli"] },
  { to: "/files",     label: "File Manager",   icon: FolderOpen,      tags: ["files", "browse", "upload"] },
  { to: "/network",   label: "Network",        icon: Wifi,            tags: ["wifi", "ip", "interfaces", "ports"] },
  { to: "/packages",  label: "Packages",       icon: Package,         tags: ["apt", "install", "update"] },
  { to: "/docker",    label: "Docker",         icon: Box,             tags: ["containers", "images"] },
  { to: "/bluetooth", label: "Bluetooth",      icon: Bluetooth,       tags: ["bt", "devices"] },
  { to: "/gpio",      label: "GPIO",           icon: GitBranch,       tags: ["pins", "gpio", "hardware"] },
  { to: "/devices",   label: "Devices",        icon: MonitorSmartphone, tags: ["usb", "connected"] },
  { to: "/logs",      label: "Logs",           icon: FileText,        tags: ["journal", "syslog", "errors"] },
  { to: "/vpn",       label: "VPN Manager",    icon: Network,         tags: ["wireguard", "openvpn", "tunnel"] },
  { to: "/firewall",  label: "Firewall",       icon: Flame,           tags: ["iptables", "ufw", "rules"] },
  { to: "/cron",      label: "Cron Jobs",      icon: Clock,           tags: ["scheduler", "tasks", "cron"] },
  { to: "/ssh",       label: "SSH Manager",    icon: KeyRound,        tags: ["keys", "config", "authorized"] },
  { to: "/metrics",   label: "Metrics",        icon: Activity,        tags: ["charts", "history", "performance"] },
  { to: "/alerts",    label: "Alerts",         icon: Bell,            tags: ["notifications", "rules", "discord", "telegram"] },
  { to: "/storage",   label: "Storage",        icon: HardDrive,       tags: ["disk", "mount", "usb", "format"] },
  { to: "/display",   label: "Display",        icon: Monitor,         tags: ["hdmi", "resolution", "gpu"] },
  { to: "/users",     label: "Users",          icon: Users,           tags: ["accounts", "roles", "admin"] },
  { to: "/security",  label: "Security",       icon: Shield,          tags: ["fail2ban", "hardening"] },
  { to: "/settings",  label: "Settings",       icon: Settings,        tags: ["config", "theme", "preferences"] },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate     = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? ENTRIES.filter((e) => {
        const q = query.toLowerCase();
        return (
          e.label.toLowerCase().includes(q) ||
          e.to.includes(q) ||
          e.tags?.some((t) => t.includes(q))
        );
      })
    : ENTRIES;

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Clamp active index
  useEffect(() => {
    setActive((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const go = useCallback(
    (to: string) => {
      navigate(to);
      onClose();
    },
    [navigate, onClose]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((p) => Math.min(p + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[active]) go(filtered[active].to);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [active, filtered, go, onClose]
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed left-1/2 top-[20%] -translate-x-1/2 z-50 w-full max-w-lg px-4">
        <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search pages, features…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results for "{query}"
              </div>
            ) : (
              filtered.map((entry, i) => {
                const Icon = entry.icon;
                return (
                  <div
                    key={entry.to}
                    data-idx={i}
                    onClick={() => go(entry.to)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                      i === active ? "bg-primary/10 text-foreground" : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                      i === active ? "bg-primary/20" : "bg-secondary"
                    )}>
                      <Icon className={cn("w-4 h-4", i === active ? "text-primary" : "")} />
                    </div>
                    <span className="flex-1 text-sm font-medium">{entry.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/60">{entry.to}</span>
                    {i === active && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span><kbd className="font-mono border border-border rounded px-1 py-0.5">↑↓</kbd> Navigate</span>
            <span><kbd className="font-mono border border-border rounded px-1 py-0.5">Enter</kbd> Go</span>
            <span><kbd className="font-mono border border-border rounded px-1 py-0.5">Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </>
  );
}
