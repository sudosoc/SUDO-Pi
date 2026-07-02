import { Link, useLocation } from "react-router-dom";
import { Home, ChevronRight } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "":                "Dashboard",
  "system":          "System Monitor",
  "processes":       "Processes",
  "terminal":        "Terminal",
  "files":           "Files",
  "network":         "Network",
  "network-traffic": "Traffic Monitor",
  "packages":        "Packages",
  "docker":          "Docker",
  "compose":         "Compose Stacks",
  "app-store":       "App Store",
  "bluetooth":       "Bluetooth",
  "gpio":            "GPIO",
  "devices":         "Devices",
  "logs":            "Logs",
  "vpn":             "VPN",
  "firewall":        "Firewall",
  "cron":            "Cron Jobs",
  "ssh":             "SSH",
  "metrics":         "Metrics",
  "speedtest":       "Speed Test",
  "alerts":          "Alerts",
  "storage":         "Storage",
  "backup":          "Backup",
  "display":         "Display",
  "users":           "Users",
  "security":        "Security",
  "settings":        "Settings",
};

interface BreadcrumbSegment {
  label: string;
  path: string;
}

export function Breadcrumb() {
  const location = useLocation();

  // Split pathname into segments, filter empty strings
  const rawSegments = location.pathname.split("/").filter(Boolean);

  const segments: BreadcrumbSegment[] = rawSegments.map((seg, idx) => {
    const path = "/" + rawSegments.slice(0, idx + 1).join("/");
    const label = ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    return { label, path };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="h-8 px-6 flex items-center gap-1 text-xs text-muted-foreground border-b border-border bg-background/50 shrink-0"
    >
      {/* Home crumb */}
      <Link
        to="/"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <Home className="w-3 h-3" />
        <span>Home</span>
      </Link>

      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        return (
          <span key={seg.path} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 shrink-0" />
            {isLast ? (
              <span className="text-foreground font-medium">{seg.label}</span>
            ) : (
              <Link
                to={seg.path}
                className="hover:text-foreground transition-colors"
              >
                {seg.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
