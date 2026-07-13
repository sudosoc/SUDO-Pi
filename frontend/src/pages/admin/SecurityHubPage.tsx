import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { Flame, ScrollText, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const SecurityPage  = lazy(() => import("@/pages/admin/SecurityPage"));
const AuditLogPage  = lazy(() => import("@/pages/admin/AuditLogPage"));
const FirewallPage  = lazy(() => import("@/pages/network/FirewallPage"));

const TABS = [
  { id: "overview",  label: "Overview",  icon: Shield     },
  { id: "audit",     label: "Audit Log", icon: ScrollText },
  { id: "firewall",  label: "Firewall",  icon: Flame      },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export default function SecurityHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as TabId;
  const valid = TABS.some((t) => t.id === tab);
  const active = valid ? tab : "overview";

  const setTab = (id: TabId) =>
    setParams({ tab: id }, { replace: true });

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
          {active === "overview" && <SecurityPage />}
          {active === "audit"    && <AuditLogPage />}
          {active === "firewall" && <FirewallPage />}
        </Suspense>
      </div>
    </div>
  );
}
