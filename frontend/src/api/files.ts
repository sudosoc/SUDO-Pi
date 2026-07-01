import { apiClient } from "./client";
import type { DirectoryListing } from "@/types";

export const filesApi = {
  listDirectory: async (path: string): Promise<DirectoryListing> => {
    const { data } = await apiClient.get<DirectoryListing>(`/files/list?path=${encodeURIComponent(path)}`);
    return data;
  },

  readFile: async (path: string) => {
    const { data } = await apiClient.get(`/files/content?path=${encodeURIComponent(path)}`);
    return data;
  },

  writeFile: async (path: string, content: string): Promise<void> => {
    await apiClient.put("/files/content", { path, content });
  },

  getDownloadUrl: (path: string): string => {
    return `/api/v1/files/download?path=${encodeURIComponent(path)}`;
  },

  uploadFile: async (
    destination: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    await apiClient.post(`/files/upload?destination=${encodeURIComponent(destination)}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (evt) => {
        if (evt.total && onProgress) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    });
  },

  deletePath: async (path: string): Promise<void> => {
    await apiClient.delete(`/files/delete?path=${encodeURIComponent(path)}`);
  },

  rename: async (path: string, new_name: string): Promise<string> => {
    const { data } = await apiClient.post("/files/rename", { path, new_name });
    return data.path;
  },

  move: async (source: string, destination: string): Promise<string> => {
    const { data } = await apiClient.post("/files/move", { source, destination });
    return data.path;
  },

  copy: async (source: string, destination: string): Promise<string> => {
    const { data } = await apiClient.post("/files/copy", { source, destination });
    return data.path;
  },

  mkdir: async (path: string, name: string): Promise<string> => {
    const { data } = await apiClient.post("/files/mkdir", { path, name });
    return data.path;
  },

  compress: async (paths: string[], destination: string, format: string): Promise<string> => {
    const { data } = await apiClient.post("/files/compress", { paths, destination, format });
    return data.path;
  },

  extract: async (path: string, destination: string): Promise<string> => {
    const { data } = await apiClient.post("/files/extract", { path, destination });
    return data.path;
  },

  chmod: async (path: string, mode: string, recursive = false): Promise<void> => {
    await apiClient.post("/files/chmod", { path, mode, recursive });
  },
};
