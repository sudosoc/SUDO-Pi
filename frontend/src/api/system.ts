import { apiClient } from "./client";
import type { ProcessInfo, ServiceInfo, SystemStats } from "@/types";

export const systemApi = {
  getStats: async (): Promise<SystemStats> => {
    const { data } = await apiClient.get<SystemStats>("/system/stats");
    return data;
  },

  getProcesses: async (limit = 25): Promise<ProcessInfo[]> => {
    const { data } = await apiClient.get<ProcessInfo[]>(`/system/processes?limit=${limit}`);
    return data;
  },

  getServices: async (): Promise<ServiceInfo[]> => {
    const { data } = await apiClient.get<ServiceInfo[]>("/system/services");
    return data;
  },

  controlService: async (name: string, action: "start" | "stop" | "restart" | "reload"): Promise<void> => {
    await apiClient.post(`/system/services/${name}/${action}`);
  },

  getLogs: async (unit?: string, lines = 200): Promise<Record<string, string>[]> => {
    const params = new URLSearchParams();
    if (unit) params.set("unit", unit);
    params.set("lines", String(lines));
    const { data } = await apiClient.get<Record<string, string>[]>(`/system/logs?${params}`);
    return data;
  },

  getBootLog: async (boot = 0, lines = 500): Promise<Record<string, string>[]> => {
    const { data } = await apiClient.get<Record<string, string>[]>(
      `/system/boot-log?boot=${boot}&lines=${lines}`,
    );
    return Array.isArray(data) ? data : [];
  },

  killProcess: async (pid: number): Promise<void> => {
    await apiClient.post(`/system/processes/${pid}/kill`);
  },

  setHostname: async (hostname: string): Promise<void> => {
    await apiClient.post("/system/hostname", { hostname });
  },

  setTimezone: async (timezone: string): Promise<void> => {
    await apiClient.post("/system/timezone", { timezone });
  },

  reboot: async (): Promise<void> => {
    await apiClient.post("/system/reboot");
  },

  shutdown: async (): Promise<void> => {
    await apiClient.post("/system/shutdown");
  },
};
