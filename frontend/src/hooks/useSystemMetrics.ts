import { useCallback } from "react";
import { useSystemStore } from "@/stores/systemStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useWebSocket } from "./useWebSocket";
import type { SystemStats, WebSocketMessage } from "@/types";

export function useSystemMetrics() {
  const { setStats, setWsConnected } = useSystemStore();
  const { addNotification } = useNotificationStore();

  const onMessage = useCallback(
    (msg: WebSocketMessage) => {
      if (msg.type === "system_metrics") {
        setStats(msg.data as SystemStats);
      } else if (msg.type === "notification") {
        const n = msg.data as { title: string; message: string; level: string };
        addNotification(n.title, n.message, n.level as "info" | "success" | "warning" | "error");
      }
    },
    [setStats, addNotification]
  );

  const onConnect = useCallback(() => {
    setWsConnected(true);
  }, [setWsConnected]);

  const onDisconnect = useCallback(() => {
    setWsConnected(false);
  }, [setWsConnected]);

  const { status, send } = useWebSocket("/api/v1/system/ws", {
    onMessage,
    onConnect,
    onDisconnect,
  });

  return { wsStatus: status, send };
}
