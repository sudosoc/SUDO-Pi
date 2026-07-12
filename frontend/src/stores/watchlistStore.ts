import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WatchlistState {
  watched: string[];
  toggle:    (mac: string) => void;
  isWatched: (mac: string) => boolean;
  clear:     () => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      watched: [],
      toggle: (mac) =>
        set((s) => ({
          watched: s.watched.includes(mac)
            ? s.watched.filter((m) => m !== mac)
            : [...s.watched, mac],
        })),
      isWatched: (mac) => get().watched.includes(mac),
      clear: () => set({ watched: [] }),
    }),
    { name: "sudo-pi-watchlist" },
  ),
);
