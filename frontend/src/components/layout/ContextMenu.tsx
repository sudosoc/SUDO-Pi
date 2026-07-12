import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Clipboard, Columns2,
  ExternalLink, Maximize2, Minimize2, RefreshCw, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSplitStore } from "@/stores/splitStore";

interface CtxAction {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  kbd?: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface MenuState { x: number; y: number; actions: CtxAction[] }

interface ContextMenuProps {
  canGoBack:    boolean;
  canGoForward: boolean;
  goBack:       () => void;
  goForward:    () => void;
  focusMode:    boolean;
  onToggleFocus: () => void;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function walkData(el: HTMLElement | null, attr: string): string | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const v = cur.dataset[attr];
    if (v) return v;
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

// ── menu item ─────────────────────────────────────────────────────────────────

function Item({ a, onClose }: { a: CtxAction; onClose: () => void }) {
  if (a.divider) return <div className="my-0.5 h-px bg-border/60 mx-1" />;
  const Icon = a.icon;
  return (
    <button
      disabled={a.disabled}
      onClick={() => { if (!a.disabled) { a.action(); onClose(); } }}
      className={cn(
        "group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[12px] transition-colors",
        a.disabled
          ? "opacity-30 cursor-not-allowed"
          : a.danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-primary/8 hover:text-foreground",
        !a.disabled && "text-foreground/75",
      )}
    >
      {Icon && <Icon className={cn("w-3.5 h-3.5 shrink-0", a.danger ? "text-destructive/60" : "text-muted-foreground/50 group-hover:text-primary")} />}
      {!Icon && <span className="w-3.5" />}
      <span className="flex-1 truncate">{a.label}</span>
      {a.kbd && (
        <kbd className="text-[9.5px] text-muted-foreground/40 font-mono tracking-wide ml-1">{a.kbd}</kbd>
      )}
    </button>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export function ContextMenu({
  canGoBack, canGoForward, goBack, goForward, focusMode, onToggleFocus,
}: ContextMenuProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { setSplit, enabled: splitEnabled } = useSplitStore();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  const buildActions = useCallback((target: HTMLElement): CtxAction[] => {
    const actions: CtxAction[] = [];

    // Selected text
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (selection) {
      actions.push({ icon: Clipboard, label: "Copy selection", action: () => navigator.clipboard.writeText(selection) });
      actions.push({ divider: true, label: "", action: () => {} });
    }

    // Data-context attributes (walk up DOM)
    const ctxType  = walkData(target, "ctx");
    const ctxValue = walkData(target, "ctxValue");

    if (ctxType === "ip" && ctxValue) {
      actions.push({ icon: Clipboard, label: `Copy  ${ctxValue}`, action: () => navigator.clipboard.writeText(ctxValue) });
      actions.push({ icon: Search,    label: "Scan this host",    action: () => navigate(`/network-scanner?host=${ctxValue}`) });
      actions.push({ divider: true, label: "", action: () => {} });
    }

    if (ctxType === "mac" && ctxValue) {
      actions.push({ icon: Clipboard, label: `Copy  ${ctxValue}`, action: () => navigator.clipboard.writeText(ctxValue) });
      actions.push({ divider: true, label: "", action: () => {} });
    }

    if (ctxType === "log-line" && ctxValue) {
      actions.push({ icon: Clipboard, label: "Copy log line",     action: () => navigator.clipboard.writeText(ctxValue) });
      actions.push({ icon: Search,    label: "Filter logs for this", action: () => navigate(`/logs?q=${encodeURIComponent(ctxValue)}`) });
      actions.push({ divider: true, label: "", action: () => {} });
    }

    if (ctxType === "device" && ctxValue) {
      actions.push({ icon: Search, label: "Scan device ports", action: () => navigate(`/network-scanner?host=${ctxValue}`) });
      actions.push({ icon: Clipboard, label: "Copy IP", action: () => navigator.clipboard.writeText(ctxValue) });
      actions.push({ divider: true, label: "", action: () => {} });
    }

    // Anchor links
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (link) {
      actions.push({ icon: ExternalLink, label: "Open link in new tab", action: () => window.open(link.href, "_blank") });
      actions.push({ icon: Clipboard,   label: "Copy link address",     action: () => navigator.clipboard.writeText(link.href) });
      actions.push({ divider: true, label: "", action: () => {} });
    }

    // Universal page actions
    actions.push({
      icon: Clipboard,
      label: "Copy page URL",
      action: () => navigator.clipboard.writeText(window.location.href),
    });
    actions.push({
      icon: RefreshCw,
      label: "Refresh data",
      kbd: "R",
      action: () => window.dispatchEvent(new CustomEvent("sudo-pi:refresh")),
    });
    actions.push({ divider: true, label: "", action: () => {} });

    // Navigation history
    actions.push({ icon: ChevronLeft,  label: "Go back",    kbd: "Alt+←", disabled: !canGoBack,    action: goBack });
    actions.push({ icon: ChevronRight, label: "Go forward", kbd: "Alt+→", disabled: !canGoForward, action: goForward });
    actions.push({ divider: true, label: "", action: () => {} });

    // View
    actions.push({
      icon: focusMode ? Minimize2 : Maximize2,
      label: focusMode ? "Exit focus mode" : "Focus mode",
      kbd: "F",
      action: onToggleFocus,
    });
    actions.push({
      icon: Columns2,
      label: splitEnabled ? "Close split view" : "Open split view",
      kbd: "Ctrl+\\",
      action: () => setSplit(!splitEnabled),
    });

    return dedup(actions);
  }, [canGoBack, canGoForward, focusMode, goBack, goForward, navigate, onToggleFocus, setSplit, splitEnabled]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const actions = buildActions(target);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MENU_W = 224;
    const MENU_H = Math.min(actions.length * 28 + 16, 400);
    const x = e.clientX + MENU_W + 8 > vw ? e.clientX - MENU_W : e.clientX;
    const y = e.clientY + MENU_H + 8 > vh ? e.clientY - MENU_H : e.clientY;

    setMenu({ x, y, actions });
  }, [buildActions]);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, [handleContextMenu]);

  useEffect(() => { close(); }, [location.pathname, close]);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown",   keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown",   keyHandler);
    };
  }, [menu, close]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-2xl shadow-2xl p-1.5 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        left: menu.x,
        top:  menu.y,
        boxShadow: "0 20px 60px hsl(260 50% 3%/0.7), 0 0 0 1px hsl(var(--primary)/0.08)",
      }}
    >
      {menu.actions.map((a, i) => (
        <Item key={i} a={a} onClose={close} />
      ))}
    </div>
  );
}
