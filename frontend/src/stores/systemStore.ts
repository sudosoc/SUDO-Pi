import { create } from "zustand";
import type { SystemStats } from "@/types";

interface SystemState {
  stats: SystemStats | null;
  wsConnected: boolean;
  lastUpdated: Date | null;
  cpuHistory: number[];
  ramHistory: number[];
  networkRxHistory: number[];
  networkTxHistory: number[];
  setStats: (stats: SystemStats) => void;
  setWsConnected: (connected: boolean) => void;
  clearStats: () => void;
}

const MAX_HISTORY = 60;

function pushHistory(arr: number[], value: number): number[] {
  const next = [...arr, value];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  stats: null,
  wsConnected: false,
  lastUpdated: null,
  cpuHistory: [],
  ramHistory: [],
  networkRxHistory: [],
  networkTxHistory: [],

  setStats: (stats) => {
    const prev = get();
    const mainIface = stats.network_interfaces.find((i) => i.name !== "lo");
    set({
      stats,
      lastUpdated: new Date(),
      cpuHistory: pushHistory(prev.cpuHistory, stats.cpu.percent),
      ramHistory: pushHistory(prev.ramHistory, stats.memory.percent),
      networkRxHistory: pushHistory(prev.networkRxHistory, mainIface?.bytes_recv ?? 0),
      networkTxHistory: pushHistory(prev.networkTxHistory, mainIface?.bytes_sent ?? 0),
    });
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),

  clearStats: () =>
    set({
      stats: null,
      lastUpdated: null,
      cpuHistory: [],
      ramHistory: [],
      networkRxHistory: [],
      networkTxHistory: [],
    }),
}));
