import { apiClient } from "./client";

export const securityApi = {
  getFail2ban: async () => {
    const { data } = await apiClient.get("/security/fail2ban");
    return data;
  },

  unbanIp: async (jail: string, ip: string) => {
    const { data } = await apiClient.post(`/security/fail2ban/${encodeURIComponent(jail)}/unban`, { ip });
    return data;
  },

  getSessions: async () => {
    const { data } = await apiClient.get("/security/sessions");
    return data;
  },

  revokeSession: async (jti: string) => {
    const { data } = await apiClient.delete(`/security/sessions/${encodeURIComponent(jti)}`);
    return data;
  },

  revokeAllSessions: async () => {
    const { data } = await apiClient.delete("/security/sessions");
    return data;
  },

  getAuditLog: async (params: { skip?: number; limit?: number; username?: string; action?: string; status?: string } = {}) => {
    const { data } = await apiClient.get("/security/audit", { params });
    return data;
  },

  getFirewall: async () => {
    const { data } = await apiClient.get("/security/firewall");
    return data;
  },
};
