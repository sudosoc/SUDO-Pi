import { apiClient } from "./client";

export const bluetoothApi = {
  listDevices: async () => {
    const { data } = await apiClient.get("/bluetooth/devices");
    return data;
  },

  scan: async () => {
    const { data } = await apiClient.get("/bluetooth/scan");
    return data;
  },

  pair: async (mac: string) => {
    const { data } = await apiClient.post("/bluetooth/pair", { mac });
    return data;
  },

  connect: async (mac: string) => {
    const { data } = await apiClient.post("/bluetooth/connect", { mac });
    return data;
  },

  disconnect: async (mac: string) => {
    const { data } = await apiClient.post("/bluetooth/disconnect", { mac });
    return data;
  },

  removeDevice: async (mac: string) => {
    const { data } = await apiClient.delete(`/bluetooth/devices/${encodeURIComponent(mac)}`);
    return data;
  },
};
