import { lazy, Suspense, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSplitStore } from "@/stores/splitStore";
import { cn } from "@/lib/utils";

// ── Available split routes ─────────────────────────────────────────────────────
// Each entry is lazily loaded so the bundle stays lean.

const SPLIT_ROUTES: Record<string, { label: string; component: React.LazyExoticComponent<React.ComponentType> }> = {
  "/system":          { label: "System",         component: lazy(() => import("@/pages/monitor/SystemPage")) },
  "/processes":       { label: "Processes",      component: lazy(() => import("@/pages/monitor/ProcessPage")) },
  "/logs":            { label: "Logs",           component: lazy(() => import("@/pages/monitor/LogsPage")) },
  "/metrics":         { label: "Metrics",        component: lazy(() => import("@/pages/monitor/MetricsPage")) },
  "/network-traffic": { label: "Traffic",        component: lazy(() => import("@/pages/network/NetworkTrafficPage")) },
  "/devices":         { label: "Devices",        component: lazy(() => import("@/pages/network/DevicesPage")) },
  "/firewall":        { label: "Firewall",       component: lazy(() => import("@/pages/network/FirewallPage")) },
  "/network-scanner": { label: "Scanner",        component: lazy(() => import("@/pages/network/NetworkScannerPage")) },
  "/docker":          { label: "Docker",         component: lazy(() => import("@/pages/containers/DockerPage")) },
  "/terminal":        { label: "Terminal",       component: lazy(() => import("@/pages/tools/TerminalPage")) },
  "/storage":         { label: "Storage",        component: lazy(() => import("@/pages/hardware/StoragePage")) },
};

function PaneLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin opacity-50" />
    </div>
  );
}

// ── Route selector ─────────────────────────────────────────────────────────────

function RouteSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (r: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SPLIT_ROUTES[value];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium bg-secondary/40 hover:bg-secondary/70 transition-colors text-foreground/70 hover:text-foreground border border-border/40"
      >
        {current?.label ?? "Select page"}
        <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 w-40 bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl p-1 animate-in fade-in-0 zoom-in-95 duration-100">
            {Object.entries(SPLIT_ROUTES).map(([route, { label }]) => (
              <button
                key={route}
                onClick={() => { onChange(route); setOpen(false); }}
                className={cn(
                  "w-full flex items-center px-2.5 py-1.5 rounded-lg text-[11.5px] transition-colors text-left",
                  value === route
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/70 hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── SplitPane ─────────────────────────────────────────────────────────────────

export function SplitPane() {
  const { rightRoute, setRightRoute, setSplit } = useSplitStore();
  const entry = SPLIT_ROUTES[rightRoute];
  const Component = entry?.component;

  return (
    <div className="flex flex-col h-full border-l border-border/40 min-w-0">
      {/* Pane header */}
      <div className="h-[42px] shrink-0 flex items-center gap-2 px-3 border-b border-border/40 bg-secondary/10">
        <span className="text-[10px] text-muted-foreground/40 font-semibold tracking-widest uppercase mr-1">Split</span>
        <RouteSelector value={rightRoute} onChange={setRightRoute} />
        <div className="flex-1" />
        <button
          onClick={() => setSplit(false)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/30 hover:text-foreground hover:bg-secondary/60 transition-colors"
          title="Close split view"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pane content — isolated MemoryRouter so navigation is independent */}
      <div className="flex-1 overflow-auto">
        {Component ? (
          <MemoryRouter initialEntries={[rightRoute]}>
            <Routes>
              <Route
                path={rightRoute}
                element={
                  <ErrorBoundary>
                    <Suspense fallback={<PaneLoader />}>
                      <Component />
                    </Suspense>
                  </ErrorBoundary>
                }
              />
              {/* Catch-all for any in-pane navigation */}
              <Route
                path="*"
                element={
                  <ErrorBoundary>
                    <Suspense fallback={<PaneLoader />}>
                      <Component />
                    </Suspense>
                  </ErrorBoundary>
                }
              />
            </Routes>
          </MemoryRouter>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/40">
            Select a page to compare
          </div>
        )}
      </div>
    </div>
  );
}
