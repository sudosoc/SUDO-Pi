import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, Cpu, Terminal, FolderOpen, Wifi, Package, Box, Bluetooth,
  GitBranch, FileText, Network, Flame, Clock, KeyRound, Activity,
  Bell, HardDrive, Monitor, Users, Shield, Settings, MonitorSmartphone,
  Server, Search, ArrowRight, Loader2, Stethoscope,
  RefreshCw, Power, Gauge, Archive, Globe2,
  LayoutGrid, Globe, Workflow, DownloadCloud, ShieldBan, BarChart2, Store, Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/stores/authStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaletteEntry {
  to:    string;
  label: string;
  icon:  React.ComponentType<{ className?: string }>;
  tags?: string[];
}

interface ActionEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  tags: string[];
  adminOnly?: boolean;
  danger?: boolean;           // needs confirm
  typeToConfirm?: string;     // for the most destructive
  confirmTitle?: string;
  confirmDescription?: string;
  run: () => Promise<string>; // returns success message
}

interface DeviceClient {
  hostname: string;
  ip:       string;
  mac:      string;
  vendor?:  string;
}

interface DockerContainer {
  id:     string;
  name:   string;
  status: string;
  image:  string;
}

interface ProcessInfo {
  pid:          number;
  name:         string;
  cmdline?:     string;
  cpu_percent?: number;
}

// A flat navigable item — one entry per keyboard-selectable row
interface FlatItem {
  key:      string;
  to?:      string;
  onSelect: () => void;
  render:   (isActive: boolean) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// Static page entries
// ---------------------------------------------------------------------------

const ENTRIES: PaletteEntry[] = [
  { to: "/",          label: "Dashboard",       icon: Home,              tags: ["home", "overview"] },
  { to: "/system",    label: "System Monitor",  icon: Cpu,               tags: ["cpu", "memory", "hardware"] },
  { to: "/processes", label: "Process Manager", icon: Server,            tags: ["processes", "ps", "kill", "pid"] },
  { to: "/terminal",  label: "Terminal",        icon: Terminal,          tags: ["bash", "shell", "cli"] },
  { to: "/files",     label: "File Manager",    icon: FolderOpen,        tags: ["files", "browse", "upload"] },
  { to: "/network",   label: "Network",         icon: Wifi,              tags: ["wifi", "ip", "interfaces", "ports"] },
  { to: "/packages",  label: "Packages",        icon: Package,           tags: ["apt", "install", "update"] },
  { to: "/docker",    label: "Docker",          icon: Box,               tags: ["containers", "images"] },
  { to: "/bluetooth", label: "Bluetooth",       icon: Bluetooth,         tags: ["bt", "devices"] },
  { to: "/gpio",      label: "GPIO",            icon: GitBranch,         tags: ["pins", "gpio", "hardware"] },
  { to: "/devices",   label: "Devices",         icon: MonitorSmartphone, tags: ["usb", "connected"] },
  { to: "/logs",      label: "Logs",            icon: FileText,          tags: ["journal", "syslog", "errors"] },
  { to: "/vpn",       label: "VPN Manager",     icon: Network,           tags: ["wireguard", "openvpn", "tunnel"] },
  { to: "/firewall",  label: "Firewall",        icon: Flame,             tags: ["iptables", "ufw", "rules"] },
  { to: "/cron",      label: "Cron Jobs",       icon: Clock,             tags: ["scheduler", "tasks", "cron"] },
  { to: "/ssh",       label: "SSH Manager",     icon: KeyRound,          tags: ["keys", "config", "authorized"] },
  { to: "/metrics",   label: "Metrics",         icon: Activity,          tags: ["charts", "history", "performance"] },
  { to: "/alerts",    label: "Alerts",          icon: Bell,              tags: ["notifications", "rules", "discord", "telegram"] },
  { to: "/storage",   label: "Storage",         icon: HardDrive,         tags: ["disk", "mount", "usb", "format"] },
  { to: "/display",   label: "Display",         icon: Monitor,           tags: ["hdmi", "resolution", "gpu"] },
  { to: "/users",     label: "Users",           icon: Users,             tags: ["accounts", "roles", "admin"] },
  { to: "/security",  label: "Security",        icon: Shield,            tags: ["fail2ban", "hardening"] },
  { to: "/settings",  label: "Settings",        icon: Settings,          tags: ["config", "theme", "preferences"] },
  { to: "/diagnostics", label: "Diagnostics",   icon: Stethoscope,       tags: ["health", "self-check", "status", "troubleshoot"] },
  { to: "/services",    label: "Services",       icon: LayoutGrid,        tags: ["apps", "launch", "web ui", "jellyfin", "portainer"] },
  { to: "/dns",         label: "DNS & DHCP",     icon: Globe,             tags: ["dns", "dhcp", "hostname", "static ip", "lease", "dnsmasq"] },
  { to: "/automations", label: "Automations",    icon: Workflow,          tags: ["rules", "triggers", "actions", "ifttt", "alerts"] },
  { to: "/updates",     label: "System Updates", icon: DownloadCloud,     tags: ["apt", "upgrade", "packages", "security"] },
  { to: "/device-control", label: "Device Control", icon: ShieldBan,      tags: ["bandwidth", "limit", "block", "parental", "curfew"] },
  { to: "/network-traffic", label: "Traffic Monitor", icon: BarChart2,    tags: ["bandwidth", "usage", "per-device"] },
  { to: "/app-store",   label: "App Store",      icon: Store,             tags: ["install", "apps", "catalog"] },
  { to: "/docker/compose", label: "Compose",     icon: Layers,            tags: ["stacks", "compose", "yaml"] },
];

// ---------------------------------------------------------------------------
// Executable actions
// ---------------------------------------------------------------------------

const ACTIONS: ActionEntry[] = [
  {
    id:    "reboot",
    label: "Reboot Pi",
    icon:  RefreshCw,
    tags:  ["restart", "reboot", "power", "cycle"],
    adminOnly: true,
    danger: true,
    confirmTitle: "Reboot the Pi?",
    confirmDescription: "All sessions will disconnect for ~30 seconds.",
    run: async () => {
      await apiClient.post("/system/reboot");
      return "Rebooting — the Pi will be back in ~30 seconds";
    },
  },
  {
    id:    "shutdown",
    label: "Shutdown Pi",
    icon:  Power,
    tags:  ["shutdown", "power", "off", "halt", "poweroff"],
    adminOnly: true,
    danger: true,
    typeToConfirm: "CONFIRM",
    confirmTitle: "Shut down the Pi?",
    confirmDescription: "The Pi will power off. You'll need physical access to turn it back on.",
    run: async () => {
      await apiClient.post("/system/shutdown");
      return "Shutting down — the Pi is powering off";
    },
  },
  {
    id:    "speedtest",
    label: "Run speed test",
    icon:  Gauge,
    tags:  ["speed", "test", "bandwidth", "internet", "download", "upload"],
    run: async () => {
      await apiClient.post("/speedtest/run");
      return "Speed test started — check the Speed Test page";
    },
  },
  {
    id:    "backup-config",
    label: "Create config backup",
    icon:  Archive,
    tags:  ["backup", "config", "save", "archive", "snapshot"],
    adminOnly: true,
    run: async () => {
      await apiClient.post("/backup/config", { name: null });
      return "Config backup started";
    },
  },
  {
    id:    "internet-sharing",
    label: "Enable internet sharing",
    icon:  Globe2,
    tags:  ["internet", "sharing", "nat", "ap", "hotspot", "upstream"],
    adminOnly: true,
    run: async () => {
      await apiClient.post("/network/internet-sharing/enable");
      return "Internet sharing enabled for AP clients";
    },
  },
  {
    id:    "uptime-check",
    label: "Check uptime now",
    icon:  Activity,
    tags:  ["uptime", "check", "monitor", "health", "services"],
    adminOnly: true,
    run: async () => {
      await apiClient.post("/uptime/check-now");
      return "Uptime check triggered";
    },
  },
];

// ---------------------------------------------------------------------------
// Live-data state shape
// ---------------------------------------------------------------------------

type LoadState<T> = { status: "idle" } | { status: "loading" } | { status: "done"; data: T[] } | { status: "error" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </p>
  );
}

function SearchingRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-muted-foreground/60">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      <span className="text-xs">Searching…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open:    boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const role     = useAuthStore((s) => s.user?.role);

  const [query,      setQuery]      = useState("");
  const [active,     setActive]     = useState(0);
  const [devices,    setDevices]    = useState<LoadState<DeviceClient>>({ status: "idle" });
  const [containers, setContainers] = useState<LoadState<DockerContainer>>({ status: "idle" });
  const [processes,  setProcesses]  = useState<LoadState<ProcessInfo>>({ status: "idle" });

  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [confirmAction,   setConfirmAction]   = useState<ActionEntry | null>(null);

  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Filtered pages & actions
  // ---------------------------------------------------------------------------

  const q = query.trim().toLowerCase();

  const filteredPages = q
    ? ENTRIES.filter((e) =>
        e.label.toLowerCase().includes(q) ||
        e.to.includes(q) ||
        e.tags?.some((t) => t.includes(q))
      )
    : ENTRIES;

  const filteredActions = ACTIONS.filter((a) => {
    if (a.adminOnly && role !== "admin") return false;
    if (!q) return true;
    return a.label.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q));
  });

  // ---------------------------------------------------------------------------
  // Live search
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (query.length < 2) {
      setDevices({ status: "idle" });
      setContainers({ status: "idle" });
      setProcesses({ status: "idle" });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    // Mark all sections as loading immediately so the spinner appears
    setDevices({ status: "loading" });
    setContainers({ status: "loading" });
    setProcesses({ status: "loading" });

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const q = query.toLowerCase();

      const [devResult, conResult, procResult] = await Promise.allSettled([
        apiClient.get<DeviceClient[]>("/network/ap/clients"),
        apiClient.get<DockerContainer[]>("/docker/containers"),
        apiClient.get<ProcessInfo[]>("/processes"),
      ]);

      // Devices
      if (devResult.status === "fulfilled") {
        const raw = Array.isArray(devResult.value.data) ? devResult.value.data : [];
        const filtered = raw.filter(
          (d) =>
            d.hostname?.toLowerCase().includes(q) ||
            d.ip?.toLowerCase().includes(q) ||
            d.mac?.toLowerCase().includes(q)
        );
        setDevices({ status: "done", data: filtered });
      } else {
        setDevices({ status: "error" });
      }

      // Containers
      if (conResult.status === "fulfilled") {
        const raw = Array.isArray(conResult.value.data) ? conResult.value.data : [];
        const filtered = raw.filter(
          (c) =>
            c.name?.toLowerCase().includes(q) ||
            c.image?.toLowerCase().includes(q)
        );
        setContainers({ status: "done", data: filtered });
      } else {
        setContainers({ status: "error" });
      }

      // Processes (limit to 5)
      if (procResult.status === "fulfilled") {
        const raw = Array.isArray(procResult.value.data) ? procResult.value.data : [];
        const filtered = raw
          .filter(
            (p) =>
              p.name?.toLowerCase().includes(q) ||
              p.cmdline?.toLowerCase().includes(q)
          )
          .slice(0, 5);
        setProcesses({ status: "done", data: filtered });
      } else {
        setProcesses({ status: "error" });
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ---------------------------------------------------------------------------
  // Reset on open
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setDevices({ status: "idle" });
      setContainers({ status: "idle" });
      setProcesses({ status: "idle" });
      setRunningActionId(null);
      setConfirmAction(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  const go = useCallback(
    (to: string) => {
      navigate(to);
      onClose();
    },
    [navigate, onClose]
  );

  // ---------------------------------------------------------------------------
  // Action execution
  // ---------------------------------------------------------------------------

  const executeAction = async (action: ActionEntry) => {
    setRunningActionId(action.id);
    try {
      const msg = await action.run();
      toast({ title: msg, variant: "success" } as { title: string; variant: "success" });
      onClose();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast({
        title: `${action.label} failed`,
        description: e?.response?.data?.detail ?? "Unknown error",
        variant: "destructive",
      } as { title: string; description: string; variant: "destructive" });
    } finally {
      setRunningActionId(null);
    }
  };

  const onActionSelect = (action: ActionEntry) => {
    if (runningActionId) return;
    if (action.danger || action.typeToConfirm) {
      setConfirmAction(action);
    } else {
      void executeAction(action);
    }
  };

  // ---------------------------------------------------------------------------
  // Build flat navigable item list
  // ---------------------------------------------------------------------------

  const flatItems: FlatItem[] = [];

  // Actions (shown above pages)
  filteredActions.forEach((action) => {
    const Icon = action.icon;
    const isDanger  = !!action.danger || !!action.typeToConfirm;
    const isRunning = runningActionId === action.id;
    flatItems.push({
      key:      `action:${action.id}`,
      onSelect: () => onActionSelect(action),
      render:   (isActive) => (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
            isActive
              ? "bg-primary/10 text-foreground"
              : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
          )}
        >
          <div
            className={cn(
              "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
              isDanger
                ? "bg-destructive/15"
                : isActive ? "bg-primary/20" : "bg-secondary"
            )}
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Icon
                className={cn(
                  "w-4 h-4",
                  isDanger ? "text-destructive" : isActive ? "text-primary" : ""
                )}
              />
            )}
          </div>
          <span className="flex-1 text-sm font-medium">{action.label}</span>
          {isDanger && (
            <span className="text-[10px] font-mono text-destructive/70 shrink-0">confirm</span>
          )}
          {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
        </div>
      ),
    });
  });

  // Pages
  filteredPages.forEach((entry) => {
    const Icon = entry.icon;
    flatItems.push({
      key:      `page:${entry.to}`,
      to:       entry.to,
      onSelect: () => go(entry.to),
      render:   (isActive) => (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
            isActive
              ? "bg-primary/10 text-foreground"
              : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
          )}
        >
          <div
            className={cn(
              "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
              isActive ? "bg-primary/20" : "bg-secondary"
            )}
          >
            <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
          </div>
          <span className="flex-1 text-sm font-medium">{entry.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{entry.to}</span>
          {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
        </div>
      ),
    });
  });

  // Devices
  if (devices.status === "done") {
    devices.data.forEach((d) => {
      const hostname = d.hostname || "Unknown Device";
      flatItems.push({
        key:      `device:${d.mac}`,
        to:       "/devices",
        onSelect: () => go("/devices"),
        render:   (isActive) => (
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
              isActive
                ? "bg-primary/10 text-foreground"
                : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                isActive ? "bg-primary/20" : "bg-secondary"
              )}
            >
              <MonitorSmartphone className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block truncate">{hostname}</span>
              <span className="text-[10px] text-muted-foreground/70">{d.ip}</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">{d.mac}</span>
            {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
          </div>
        ),
      });
    });
  }

  // Containers
  if (containers.status === "done") {
    containers.data.forEach((c) => {
      const isRunning = c.status?.toLowerCase().includes("running");
      flatItems.push({
        key:      `container:${c.id}`,
        to:       "/docker",
        onSelect: () => go("/docker"),
        render:   (isActive) => (
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
              isActive
                ? "bg-primary/10 text-foreground"
                : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                isActive ? "bg-primary/20" : "bg-secondary"
              )}
            >
              <Box className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block truncate">{c.name}</span>
              <span className="text-[10px] text-muted-foreground/70 truncate block">{c.image}</span>
            </div>
            <span
              className={cn(
                "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0",
                isRunning
                  ? "bg-green-500/15 text-green-500"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {isRunning ? "running" : c.status}
            </span>
            {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
          </div>
        ),
      });
    });
  }

  // Processes
  if (processes.status === "done") {
    processes.data.forEach((p) => {
      flatItems.push({
        key:      `process:${p.pid}`,
        to:       "/processes",
        onSelect: () => go("/processes"),
        render:   (isActive) => (
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
              isActive
                ? "bg-primary/10 text-foreground"
                : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                isActive ? "bg-primary/20" : "bg-secondary"
              )}
            >
              <Server className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
            </div>
            <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
              PID {p.pid}
              {p.cpu_percent != null ? ` · ${p.cpu_percent.toFixed(1)}%` : ""}
            </span>
            {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
          </div>
        ),
      });
    });
  }

  const totalItems = flatItems.length;

  // ---------------------------------------------------------------------------
  // Clamp active when items change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setActive((prev) => Math.min(prev, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // While the confirm dialog is open, the palette input keeps focus for
      // non-typeToConfirm dialogs — Escape should close the dialog, not the
      // palette, and other navigation keys are ignored.
      if (confirmAction) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setConfirmAction(null);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((p) => Math.min(p + 1, totalItems - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[active]) flatItems[active].onSelect();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    // flatItems is rebuilt every render — intentionally include active/totalItems in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, totalItems, onClose, confirmAction]
  );

  // ---------------------------------------------------------------------------
  // Scroll active item into view
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // ---------------------------------------------------------------------------
  // Early return
  // ---------------------------------------------------------------------------

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Render helpers — build section content with correct flat indices
  // ---------------------------------------------------------------------------

  // We need to render section labels interleaved with items, while tracking
  // the running flat index for data-idx assignment.
  let runningIdx = 0;

  const actionItems = filteredActions.map(() => {
    const idx = runningIdx++;
    return { idx, item: flatItems[idx] }; // guaranteed to be an action item
  });

  const pageItems = filteredPages.map(() => {
    const idx = runningIdx++;
    const item = flatItems[idx]; // guaranteed to be a page item
    return { idx, item };
  });

  const devItems: { idx: number; item: FlatItem }[] = [];
  if (devices.status === "done") {
    devices.data.forEach(() => {
      const idx = runningIdx++;
      devItems.push({ idx, item: flatItems[idx] });
    });
  }

  const conItems: { idx: number; item: FlatItem }[] = [];
  if (containers.status === "done") {
    containers.data.forEach(() => {
      const idx = runningIdx++;
      conItems.push({ idx, item: flatItems[idx] });
    });
  }

  const procItems: { idx: number; item: FlatItem }[] = [];
  if (processes.status === "done") {
    processes.data.forEach(() => {
      const idx = runningIdx++;
      procItems.push({ idx, item: flatItems[idx] });
    });
  }

  const isLiveSearch = query.length >= 2;
  const anyLiveLoading =
    devices.status === "loading" ||
    containers.status === "loading" ||
    processes.status === "loading";

  const hasNoResults =
    filteredActions.length === 0 &&
    filteredPages.length === 0 &&
    devItems.length === 0 &&
    conItems.length === 0 &&
    procItems.length === 0 &&
    !anyLiveLoading;

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

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
              placeholder="Search pages, actions, devices, containers…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
            {hasNoResults ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              <>
                {/* Actions section */}
                {actionItems.length > 0 && (
                  <>
                    <SectionLabel>Actions</SectionLabel>
                    {actionItems.map(({ idx, item }) => (
                      <div
                        key={item.key}
                        data-idx={idx}
                        onClick={item.onSelect}
                      >
                        {item.render(idx === active)}
                      </div>
                    ))}
                  </>
                )}

                {/* Pages section */}
                {(filteredPages.length > 0 || !isLiveSearch) && (
                  <>
                    <SectionLabel>Pages</SectionLabel>
                    {pageItems.map(({ idx, item }) => (
                      <div
                        key={item.key}
                        data-idx={idx}
                        onClick={item.onSelect}
                      >
                        {item.render(idx === active)}
                      </div>
                    ))}
                  </>
                )}

                {/* Devices section */}
                {isLiveSearch && (devices.status === "loading" || (devices.status === "done" && devices.data.length > 0)) && (
                  <>
                    <SectionLabel>Devices</SectionLabel>
                    {devices.status === "loading" ? (
                      <SearchingRow />
                    ) : (
                      devItems.map(({ idx, item }) => (
                        <div
                          key={item.key}
                          data-idx={idx}
                          onClick={item.onSelect}
                        >
                          {item.render(idx === active)}
                        </div>
                      ))
                    )}
                  </>
                )}

                {/* Containers section */}
                {isLiveSearch && (containers.status === "loading" || (containers.status === "done" && containers.data.length > 0)) && (
                  <>
                    <SectionLabel>Containers</SectionLabel>
                    {containers.status === "loading" ? (
                      <SearchingRow />
                    ) : (
                      conItems.map(({ idx, item }) => (
                        <div
                          key={item.key}
                          data-idx={idx}
                          onClick={item.onSelect}
                        >
                          {item.render(idx === active)}
                        </div>
                      ))
                    )}
                  </>
                )}

                {/* Processes section */}
                {isLiveSearch && (processes.status === "loading" || (processes.status === "done" && processes.data.length > 0)) && (
                  <>
                    <SectionLabel>Processes</SectionLabel>
                    {processes.status === "loading" ? (
                      <SearchingRow />
                    ) : (
                      procItems.map(({ idx, item }) => (
                        <div
                          key={item.key}
                          data-idx={idx}
                          onClick={item.onSelect}
                        >
                          {item.render(idx === active)}
                        </div>
                      ))
                    )}
                  </>
                )}
              </>
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

      {/* Confirmation dialog for dangerous actions — renders above the palette (z-[70]) */}
      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action) void executeAction(action);
        }}
        title={confirmAction?.confirmTitle ?? confirmAction?.label ?? ""}
        description={confirmAction?.confirmDescription}
        severity={confirmAction?.typeToConfirm ? "critical" : "danger"}
        typeToConfirm={confirmAction?.typeToConfirm}
        confirmLabel={confirmAction?.label ?? "Confirm"}
      />
    </>
  );
}
