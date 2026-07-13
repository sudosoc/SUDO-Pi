import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart2, MonitorSmartphone, Radar, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

const NetworkPage        = lazy(() => import("@/pages/network/NetworkPage"));
const DevicesPage        = lazy(() => import("@/pages/network/DevicesPage"));
const NetworkTrafficPage = lazy(() => import("@/pages/network/NetworkTrafficPage"));
const NetworkScannerPage = lazy(() => import("@/pages/network/NetworkScannerPage"));

const TABS = [
  { id: "overview", label: "Overview", icon: Wifi              },
  { id: "devices",  label: "Devices",  icon: MonitorSmartphone },
  { id: "traffic",  label: "Traffic",  icon: BarChart2         },
  { id: "scanner",  label: "Scanner",  icon: Radar             },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export default function NetworkHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as TabId;
  const valid = TABS.some((t) => t.id === tab);
  const active = valid ? tab : "overview";

  const setTab = (id: TabId) => {
    // Preserve `host` param when switching to/from scanner
    const next = new URLSearchParams(params);
    next.set("tab", id);
    if (id !== "scanner") next.delete("host");
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Hub tab bar ── */}
      <div className="border-b border-border/40 bg-background/40 px-4 flex items-end gap-0.5 shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-medium",
              "border-b-2 -mb-px transition-all duration-150",
              active === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground/55 hover:text-foreground hover:border-border/60",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Suspense fallback={<TabLoader />}>
          {active === "overview" && <NetworkPage />}
          {active === "devices"  && <DevicesPage />}
          {active === "traffic"  && <NetworkTrafficPage />}
          {active === "scanner"  && <NetworkScannerPage />}
        </Suspense>
      </div>
    </div>
  );
}
