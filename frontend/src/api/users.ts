import { apiClient } from "./client";
import type { User } from "@/types";

interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  role: "admin" | "operator" | "viewer";
  full_name?: string;
}

interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  role?: "admin" | "operator" | "viewer";
  is_active?: boolean;
}

export const usersApi = {
  list: async (skip = 0, limit = 100) => {
    const { data } = await apiClient.get("/users", { params: { skip, limit } });
    return data as { items: User[]; total: number };
  },

  getById: async (id: number) => {
    const { data } = await apiClient.get(`/users/${id}`);
    return data as User;
  },

  create: async (payload: CreateUserPayload) => {
    const { data } = await apiClient.post("/users", payload);
    return data as User;
  },

  update: async (id: number, payload: UpdateUserPayload) => {
    const { data } = await apiClient.patch(`/users/${id}`, payload);
    return data as User;
  },

  delete: async (id: number) => {
    await apiClient.delete(`/users/${id}`);
  },
};
