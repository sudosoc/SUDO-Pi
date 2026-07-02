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

// A stale backend can answer unknown API paths with the SPA's index.html
// (200 + HTML string), so never trust the payload shape blindly.
function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export const metricsApi = {
  getHistory: async (hours: number = 1): Promise<MetricsPoint[]> => {
    const { data } = await apiClient.get(`/metrics/history?hours=${hours}`);
    return asArray<MetricsPoint>(data);
  },

  getAnomalies: async (): Promise<AnomalyEntry[]> => {
    const { data } = await apiClient.get("/metrics/anomalies");
    return asArray<AnomalyEntry>(data);
  },

  getAnomalyHistory: async (hours: number = 24): Promise<AnomalyHistoryEntry[]> => {
    const { data } = await apiClient.get(`/metrics/anomalies/history?hours=${hours}`);
    return asArray<AnomalyHistoryEntry>(data);
  },
};
