import { apiClient } from "./client";

export interface MetricsPoint {
  t: number;
  cpu: number;
  ram: number;
  disk: number | null;
  temp: number | null;
  rx: number;
  tx: number;
}

export const metricsApi = {
  getHistory: async (hours: number = 1): Promise<MetricsPoint[]> => {
    const { data } = await apiClient.get<MetricsPoint[]>(`/metrics/history?hours=${hours}`);
    return data;
  },
};
