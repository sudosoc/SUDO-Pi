import { apiClient } from "./client";

export const packagesApi = {
  list: async (skip = 0, limit = 200) => {
    const { data } = await apiClient.get("/packages", { params: { skip, limit } });
    return data;
  },

  search: async (q: string) => {
    const { data } = await apiClient.get("/packages/search", { params: { q } });
    return data;
  },

  install: async (name: string) => {
    const { data } = await apiClient.post("/packages/install", { name });
    return data;
  },

  remove: async (name: string) => {
    const { data } = await apiClient.delete(`/packages/${encodeURIComponent(name)}`);
    return data;
  },

  upgradeAll: async () => {
    const { data } = await apiClient.post("/packages/upgrade");
    return data;
  },
};
