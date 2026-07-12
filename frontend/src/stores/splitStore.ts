import { create } from "zustand";

interface SplitState {
  enabled:      boolean;
  rightRoute:   string;
  setSplit:     (enabled: boolean, route?: string) => void;
  setRightRoute:(route: string) => void;
}

export const useSplitStore = create<SplitState>((set) => ({
  enabled:      false,
  rightRoute:   "/logs",
  setSplit:     (enabled, route) =>
    set((s) => ({ enabled, rightRoute: route ?? s.rightRoute })),
  setRightRoute: (route) => set({ rightRoute: route }),
}));
