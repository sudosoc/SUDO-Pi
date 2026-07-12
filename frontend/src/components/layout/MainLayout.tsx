import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { GlobalLoadingBar } from "./GlobalLoadingBar";
import { FloatingTerminal } from "./FloatingTerminal";
import { OnboardingWizard } from "./OnboardingWizard";
import { ShortcutsModal } from "./ShortcutsModal";
import { ContextMenu } from "./ContextMenu";
import { SplitPane } from "./SplitPane";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useSystemStore } from "@/stores/systemStore";
import { useNavHistory } from "@/hooks/useNavHistory";
import { useSplitStore } from "@/stores/splitStore";
import { WifiOff, RefreshCw, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// G-chord nav: press G then a letter
const G_NAV: Record<string, string> = {
  d: "/",
  n: "/network",
  t: "/terminal",
  s: "/settings",
  l: "/logs",
  m: "/metrics",
  f: "/files",
  b: "/backup",
};

export function MainLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { stats, wsConnected }       = useSystemStore();
  const { canGoBack, canGoForward, goBack, goForward } = useNavHistory();
  const { enabled: splitEnabled, setSplit } = useSplitStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen,      setPaletteOpen]      = useState(false);
  const [shortcutsOpen,    setShortcutsOpen]    = useState(false);
  const [focusMode,        setFocusMode]        = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  const hadConnectionRef = useRef(false);

  useSystemMetrics();

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) setSidebarCollapsed(stored === "true");
  }, []);

  // Gift 1: Live CPU/Temp in browser title
  useEffect(() => {
    if (!stats) return;
    const cpu  = Math.round(stats.cpu.percent);
    const temp = stats.temperature?.cpu ? ` · ${Math.round(stats.temperature.cpu)}°C` : "";
    document.title = `SUDO-Pi | ${cpu}% CPU${temp}`;
    return () => { document.title = "SUDO-Pi"; };
  }, [stats]);

  // Connection lost banner
  useEffect(() => {
    if (wsConnected) {
      hadConnectionRef.current = true;
      setShowOfflineBanner(false);
    } else if (hadConnectionRef.current) {
      const t = setTimeout(() => setShowOfflineBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, [wsConnected]);

  // Keyboard shortcuts
  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: KeyboardEvent) => {
      const target  = e.target as HTMLElement;
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;

      // Ctrl+K / Cmd+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }

      // Ctrl+\ — toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        setSplit(!splitEnabled);
        return;
      }

      // Alt+← / Alt+→ — back / forward
      if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); if (canGoBack)    goBack();    return; }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); if (canGoForward) goForward(); return; }

      if (inInput) return;

      // ? — shortcuts modal
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen((p) => !p);
        return;
      }

      // F — focus mode toggle
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setFocusMode((m) => !m);
        return;
      }

      // Escape — exit focus mode
      if (e.key === "Escape" && focusMode) {
        setFocusMode(false);
        return;
      }

      // G chord navigation
      if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        gPressed = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 1000);
        return;
      }
      if (gPressed && G_NAV[e.key.toLowerCase()]) {
        e.preventDefault();
        gPressed = false;
        if (gTimer) clearTimeout(gTimer);
        navigate(G_NAV[e.key.toLowerCase()]);
        return;
      }

      gPressed = false;
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [navigate, focusMode, splitEnabled, canGoBack, canGoForward, goBack, goForward, setSplit]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  }, []);

  const toggleFocus = useCallback(() => setFocusMode((m) => !m), []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <GlobalLoadingBar />

      {/* Connection lost banner */}
      {showOfflineBanner && (
        <div className={cn(
          "shrink-0 flex items-center justify-between gap-3 px-4 py-2",
          "bg-warning/10 border-b border-warning/30 text-warning text-xs",
          "animate-in slide-in-from-top-1 duration-300",
        )}>
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Live connection lost — data may be stale.</span>
            <span className="text-warning/60">Reconnecting automatically…</span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3 h-3 animate-spin opacity-60" />
            <button onClick={() => setShowOfflineBanner(false)} className="text-warning/50 hover:text-warning transition-colors ml-1">✕</button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar — hidden in focus mode */}
        {!focusMode && (
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        )}

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* TabBar — hidden in focus mode */}
          {!focusMode && (
            <TabBar
              onOpenPalette={() => setPaletteOpen(true)}
              focusMode={focusMode}
              onToggleFocus={toggleFocus}
            />
          )}

          {/* Content area — split or single */}
          <main className={cn(
            "flex-1 min-h-0",
            splitEnabled ? "flex overflow-hidden" : "overflow-auto",
          )}>
            {/* Primary pane */}
            <div className={cn(
              splitEnabled ? "flex-1 min-w-0 overflow-auto" : "h-full",
            )}>
              <div key={location.pathname} className="page-transition h-full">
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Outlet />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>

            {/* Secondary pane */}
            {splitEnabled && (
              <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                <SplitPane />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Focus mode — restore pill */}
      {focusMode && (
        <button
          onClick={toggleFocus}
          className={cn(
            "fixed top-3 right-4 z-[200] flex items-center gap-1.5",
            "h-7 px-3 rounded-full text-[11px] font-medium",
            "bg-background/80 backdrop-blur-xl border border-border/60",
            "text-muted-foreground/60 hover:text-foreground hover:border-primary/40 transition-all",
            "shadow-xl animate-in fade-in slide-in-from-top-1 duration-200",
          )}
        >
          <Minimize2 className="w-3 h-3" />
          Exit focus  <kbd className="ml-1 text-[9px] opacity-50">F</kbd>
        </button>
      )}

      <StatusBar />
      <FloatingTerminal />
      <OnboardingWizard />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Global smart context menu */}
      <ContextMenu
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        goBack={goBack}
        goForward={goForward}
        focusMode={focusMode}
        onToggleFocus={toggleFocus}
      />
    </div>
  );
}
