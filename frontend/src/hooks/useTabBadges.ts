import { useQuery } from "@tanstack/react-query";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSystemStore } from "@/stores/systemStore";
import { apiClient } from "@/api/client";

export type BadgeVariant = "error" | "warning" | "info" | "live";

export interface TabBadge {
  count?: number;
  dot?: boolean;
  variant: BadgeVariant;
}

interface DockerContainer { State?: string; state?: string; }

export function useTabBadges(): Record<string, TabBadge> {
  const { unreadCount } = useNotificationStore();
  const { stats }       = useSystemStore();

  const { data: containers } = useQuery<DockerContainer[]>({
    queryKey: ["tab-badge-docker"],
    queryFn: async () => {
      const { data } = await apiClient.get<DockerContainer[]>("/docker/containers");
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 20_000,
  });

  const badges: Record<string, TabBadge> = {};

  // Alerts: show unread notification count
  if (unreadCount > 0) {
    badges["/alerts"] = { count: unreadCount, variant: "error" };
  }

  // Docker: running container count
  const running = (containers ?? []).filter(
    (c) => (c.State ?? c.state) === "running",
  ).length;
  if (running > 0) {
    badges["/docker"] = { count: running, variant: "info" };
  }

  // System: warning when CPU is high
  if (stats) {
    const hotCpu  = stats.cpu.percent > 85;
    const hotTemp = (stats.temperature?.cpu ?? 0) > 75;
    if (hotCpu || hotTemp) {
      badges["/system"] = { dot: true, variant: hotTemp ? "error" : "warning" };
    }
  }

  // Logs: always a live dot to indicate streaming
  badges["/logs"] = { dot: true, variant: "live" };

  return badges;
}
