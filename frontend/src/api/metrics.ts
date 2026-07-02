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

export interface AnomalyEntry {
  metric: string;
  label: string;
  unit: string;
  current_value: number;
  mean: number;
  stddev: number;
  z_score: number | null;
  severity: "warning" | "critical";
  message: string;
}

export interface AnomalyHistoryEntry {
  timestamp: number;
  recorded_at: string;
  anomalies: {
    metric: string;
    label: string;
    current_value: number;
    mean: number;
    z_score: number;
    severity: "warning" | "critical";
  }[];
}

export const metricsApi = {
  getHistory: async (hours: number = 1): Promise<MetricsPoint[]> => {
    const { data } = await apiClient.get<MetricsPoint[]>(`/metrics/history?hours=${hours}`);
    return data;
  },

  getAnomalies: async (): Promise<AnomalyEntry[]> => {
    const { data } = await apiClient.get<AnomalyEntry[]>("/metrics/anomalies");
    return data;
  },

  getAnomalyHistory: async (hours: number = 24): Promise<AnomalyHistoryEntry[]> => {
    const { data } = await apiClient.get<AnomalyHistoryEntry[]>(`/metrics/anomalies/history?hours=${hours}`);
    return data;
  },
};
