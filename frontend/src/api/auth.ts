import { apiClient } from "./client";
import type { AuthResponse, User } from "@/types";

export const authApi = {
  login: async (username: string, password: string, remember_me = false): Promise<AuthResponse> => {
    const { data } = await apiClient.post<AuthResponse>("/auth/login", {
      username,
      password,
      remember_me,
    });
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post("/auth/logout");
  },

  logoutAll: async (): Promise<void> => {
    await apiClient.post("/auth/logout-all");
  },

  refresh: async (): Promise<{ expires_in: number; csrf_token: string }> => {
    const { data } = await apiClient.post("/auth/refresh");
    return data;
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<User>("/auth/me");
    return data;
  },

  changePassword: async (
    current_password: string,
    new_password: string,
    confirm_password: string
  ): Promise<void> => {
    await apiClient.post("/auth/change-password", {
      current_password,
      new_password,
      confirm_password,
    });
  },
};
