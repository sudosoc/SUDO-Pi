import { apiClient } from "./client";

export const dockerApi = {
  listContainers: async (all = true) => {
    const { data } = await apiClient.get("/docker/containers", { params: { all } });
    return data;
  },

  containerAction: async (id: string, action: "start" | "stop" | "restart" | "pause" | "unpause") => {
    const { data } = await apiClient.post(`/docker/containers/${encodeURIComponent(id)}/${action}`);
    return data;
  },

  removeContainer: async (id: string, force = false) => {
    const { data } = await apiClient.delete(`/docker/containers/${encodeURIComponent(id)}`, {
      params: { force },
    });
    return data;
  },

  listImages: async () => {
    const { data } = await apiClient.get("/docker/images");
    return data;
  },

  removeImage: async (id: string, force = false) => {
    const { data } = await apiClient.delete(`/docker/images/${encodeURIComponent(id)}`, {
      params: { force },
    });
    return data;
  },
};
