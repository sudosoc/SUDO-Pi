import { apiClient } from "./client";
import type { ApStatus, WifiProfile, WifiScanResult, WifiStatus } from "@/types";

export const networkApi = {
  getApStatus: async (): Promise<ApStatus> => {
    const { data } = await apiClient.get<ApStatus>("/network/ap");
    return data;
  },

  updateAp: async (config: {
    ssid: string;
    password: string | null;
    channel: number;
    country_code: string;
    hide_ssid: boolean;
    max_clients: number;
  }): Promise<void> => {
    await apiClient.put("/network/ap", config);
  },

  getApClients: async () => {
    const { data } = await apiClient.get("/network/ap/clients");
    return data;
  },

  getWifiStatus: async (): Promise<WifiStatus> => {
    const { data } = await apiClient.get<WifiStatus>("/network/wifi/status");
    return data;
  },

  scanWifi: async (): Promise<WifiScanResult[]> => {
    const { data } = await apiClient.get<WifiScanResult[]>("/network/wifi/scan");
    return data;
  },

  getSavedNetworks: async (): Promise<WifiProfile[]> => {
    const { data } = await apiClient.get<WifiProfile[]>("/network/wifi/saved");
    return data;
  },

  connectWifi: async (request: {
    ssid: string;
    password?: string;
    security?: string;
    use_dhcp?: boolean;
    save?: boolean;
    priority?: number;
  }): Promise<void> => {
    await apiClient.post("/network/wifi/connect", request);
  },

  disconnectWifi: async (): Promise<void> => {
    await apiClient.post("/network/wifi/disconnect");
  },

  deleteSavedNetwork: async (profileId: number): Promise<void> => {
    await apiClient.delete(`/network/wifi/${profileId}`);
  },

  updatePriority: async (profileId: number, priority: number): Promise<void> => {
    await apiClient.put(`/network/wifi/${profileId}/priority`, { priority });
  },

  getArpTable: async (): Promise<Record<string, unknown>[]> => {
    const { data } = await apiClient.get<Record<string, unknown>[]>("/network/arp");
    return data;
  },
};
