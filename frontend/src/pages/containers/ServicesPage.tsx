import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Box, RefreshCw } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/skeleton";
import { PageHelp } from "@/components/ui/page-help";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

interface ServiceApp {
  id: string;
  name: string;
  image: string;
  running: boolean;
  statusText: string;
  webPort: number | null;
  allPorts: number[];
}

// ─── Curated icon + accent per well-known image ───────────────────────────────

const APP_META: { match: RegExp; label: string; accent: string }[] = [
  { match: /jellyfin/i,      label: "Jellyfin",      accent: "text-purple-400" },
  { match: /plex/i,          label: "Plex",          accent: "text-amber-400" },
  { match: /pihole|pi-hole/i, label: "Pi-hole",      accent: "text-red-400" },
  { match: /nextcloud/i,     label: "Nextcloud",     accent: "text-blue-400" },
  { match: /portainer/i,     label: "Portainer",     accent: "text-sky-400" },
  { match: /grafana/i,       label: "Grafana",       accent: "text-orange-400" },
  { match: /home-?assistant/i, label: "Home Assistant", accent: "text-cyan-400" },
  { match: /uptime-?kuma/i,  label: "Uptime Kuma",   accent: "text-green-400" },
  { match: /vaultwarden|bitwarden/i, label: "Vaultwarden", accent: "text-blue-400" },
  { match: /gitea/i,         label: "Gitea",         accent: "text-teal-400" },
  { match: /node-?red/i,     label: "Node-RED",      accent: "text-red-400" },
];

function metaFor(image: string): { label: string | null; accent: string } {
  for (const m of APP_META) {
    if (m.match.test(image)) return { label: m.label, accent: m.accent };
  }
  return { label: null, accent: "text-primary" };
}

// Parse the backend's docker ports string. The API formats each published
// port as "<hostPort>-><containerPort>/proto" (e.g. "8096->8096/tcp"), joined
// by ", ". The host port is the number immediately before "->".
function parsePorts(ports: string): number[] {
  const hostPorts = new Set<number>();
  const re = /(\d+)->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ports)) !== null) {
    hostPorts.add(Number(m[1]));
  }
  return Array.from(hostPorts).sort((a, b) => a - b);
}

// Pick the most likely web-UI port (prefer common HTTP ports)
function pickWebPort(ports: number[]): number | null {
  if (ports.length === 0) return null;
  const preferred = [80, 8080, 8096, 3000, 8000, 443, 9000, 8123];
  for (const p of preferred) {
    if (ports.includes(p)) return p;
  }
  return ports.find((p) => p > 1024) ?? ports[0];
}

function toServiceApp(c: Container): ServiceApp {
  const allPorts = parsePorts(c.ports || "");
  const running = c.state === "running" || c.status?.toLowerCase().includes("up");
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    running,
    statusText: c.status,
    webPort: running ? pickWebPort(allPorts) : null,
    allPorts,
  };
}

// ─── App Card ─────────────────────────────────────────────────────────────────

function AppCard({ app }: { app: ServiceApp }) {
  const meta = metaFor(app.image);
  const displayName = meta.label ?? app.name;
  const url = app.webPort ? `http://${window.location.hostname}:${app.webPort}` : null;
  const initials = displayName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();

  return (
    <Card className="hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-11 h-11 rounded-xl bg-secondary/70 flex items-center justify-center shrink-0 text-sm font-bold",
            meta.accent
          )}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{displayName}</p>
              <span className={cn("status-dot shrink-0", app.running ? "running" : "stopped")} />
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{app.image}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {app.allPorts.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">No exposed ports</span>
          ) : (
            app.allPorts.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] font-mono">:{p}</Badge>
            ))
          )}
        </div>

        <div className="mt-3">
          {url ? (
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => window.open(url, "_blank", "noopener")}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open :{app.webPort}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="w-full" disabled>
              {app.running ? "No web UI" : "Stopped"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ServicesPage() {
  const navigate = useNavigate();

  const { data: containers = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["services-containers"],
    queryFn: async () => {
      const { data } = await apiClient.get("/docker/containers");
      return Array.isArray(data) ? (data as Container[]) : [];
    },
    refetchInterval: 15000,
  });

  const apps = containers.map(toServiceApp);
  const running = apps.filter((a) => a.running);
  const withUi = running.filter((a) => a.webPort !== null);

  return (
    <div className="p-6 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Services</h2>
          <PageHelp
            title="Services hub"
            points={[
              "Every Docker app with a launchable web UI",
              "Click Open to launch an app in a new tab",
              "Green dot = running, gray = stopped",
              "Install more apps from the App Store",
            ]}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          loading={isRefetching}
          onClick={() => refetch()}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Total apps</p>
          <p className="text-2xl font-bold tabular-nums">{apps.length}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">Running</p>
          <p className="text-2xl font-bold tabular-nums text-success">{running.length}</p>
        </div>
        <div className="surface-tile">
          <p className="text-xs text-muted-foreground">With web UI</p>
          <p className="text-2xl font-bold tabular-nums text-info">{withUi.length}</p>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <SkeletonCards count={6} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={Box}
          title="No services running"
          description="Install an app from the App Store or start a container, and it'll show up here ready to launch."
          action={{ label: "Open App Store", onClick: () => navigate("/app-store") }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
