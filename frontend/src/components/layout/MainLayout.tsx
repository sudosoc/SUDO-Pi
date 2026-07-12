import { Suspense, useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { GlobalLoadingBar } from "./GlobalLoadingBar";
import { FloatingTerminal } from "./FloatingTerminal";
import { OnboardingWizard } from "./OnboardingWizard";
import { ShortcutsModal } from "./ShortcutsModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useSystemStore } from "@/stores/systemStore";
import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Chord navigation: G+key → route
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
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { stats, wsConnected } = useSystemStore();

  // Track whether we've ever connected so we can show a "lost" banner
  const hadConnectionRef = useRef(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useSystemMetrics();

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) setSidebarCollapsed(stored === "true");
  }, []);

  // ── Gift 1: Live CPU/Temp in browser title ──────────────────────────────────
  useEffect(() => {
    if (!stats) return;
    const cpu = Math.round(stats.cpu.percent);
    const temp = stats.temperature?.cpu ? ` · ${Math.round(stats.temperature.cpu)}°C` : "";
    document.title = `SUDO-Pi | ${cpu}% CPU${temp}`;
    return () => { document.title = "SUDO-Pi"; };
  }, [stats]);

  // ── Gift 3: Connection lost banner ──────────────────────────────────────────
  useEffect(() => {
    if (wsConnected) {
      hadConnectionRef.current = true;
      setShowOfflineBanner(false);
    } else if (hadConnectionRef.current) {
      // Only show banner if we previously had a connection (not on initial load)
      const t = setTimeout(() => setShowOfflineBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, [wsConnected]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;

      // Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }

      if (inInput) return;

      // ? — shortcuts modal
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen((p) => !p);
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
  }, [navigate]);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <GlobalLoadingBar />

      {/* Gift 3: Connection lost banner */}
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
            <button
              onClick={() => setShowOfflineBanner(false)}
              className="text-warning/50 hover:text-warning transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TabBar onOpenPalette={() => setPaletteOpen(true)} />
          <main className="flex-1 overflow-auto">
            <div key={location.pathname} className="page-transition h-full">
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Outlet />
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <StatusBar />
      <FloatingTerminal />
      <OnboardingWizard />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* Gift 2: Keyboard shortcuts panel */}
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
