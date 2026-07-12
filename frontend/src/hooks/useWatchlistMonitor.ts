import { useEffect, useRef } from "react";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { apiClient } from "@/api/client";

interface DeviceEntry { mac_address: string }

export function useWatchlistMonitor() {
  const { watched }       = useWatchlistStore();
  const { addNotification } = useNotificationStore();
  const onlineRef         = useRef<Set<string>>(new Set());
  const initializedRef    = useRef(false);

  useEffect(() => {
    if (watched.length === 0) { initializedRef.current = false; return; }

    const check = async () => {
      try {
        const [apRes, arpRes] = await Promise.allSettled([
          apiClient.get<DeviceEntry[]>("/network/ap/clients"),
          apiClient.get<DeviceEntry[]>("/network/arp"),
        ]);

        const allMacs = new Set<string>();
        if (apRes.status  === "fulfilled") apRes.value.data?.forEach((d) => allMacs.add(d.mac_address));
        if (arpRes.status === "fulfilled") arpRes.value.data?.forEach((d) => allMacs.add(d.mac_address));

        for (const mac of watched) {
          const wasOnline = onlineRef.current.has(mac);
          const isOnline  = allMacs.has(mac);

          if (initializedRef.current) {
            if (wasOnline && !isOnline) {
              addNotification("Watched device offline", `${mac} left the network`, "warning");
            }
            if (!wasOnline && isOnline) {
              addNotification("Watched device online", `${mac} joined the network`, "success");
            }
          }
        }

        onlineRef.current  = new Set(watched.filter((m) => allMacs.has(m)));
        initializedRef.current = true;
      } catch {
        // network errors are silently ignored — poll again next interval
      }
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [watched, addNotification]);
}
