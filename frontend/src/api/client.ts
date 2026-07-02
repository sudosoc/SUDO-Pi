import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { loadingBus } from "@/components/layout/GlobalLoadingBar";

const BASE_URL = import.meta.env.VITE_API_URL || "";

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ─── Global loading bar wiring ───────────────────────────────────────────────
// Dedicated interceptor pair so every start() is matched by exactly one done().
// The response pair is registered FIRST so it runs before any other response
// interceptor (HTML guard, 401 refresh) — done() therefore fires whether those
// later interceptors fulfill, reject, or retry. Retries issued through
// apiClient() re-enter the chain and get their own balanced start()/done().
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    loadingBus.start();
    return config;
  },
  (error) => {
    loadingBus.done();
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    loadingBus.done();
    return response;
  },
  (error) => {
    loadingBus.done();
    return Promise.reject(error);
  }
);

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = config.method?.toUpperCase();
  if (method && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: Error | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(undefined);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => {
    // Guard against the SPA catch-all: a stale or misconfigured backend can
    // answer an unknown /api/v1/* path with index.html + 200. Pages then get
    // an HTML string where they expect JSON and crash on .map/.filter/.toFixed.
    // Detect it here and turn it into a clean rejection so React Query surfaces
    // an error state instead of poisoning the component.
    const contentType = String(response.headers?.["content-type"] ?? "");
    if (
      contentType.includes("text/html") ||
      (typeof response.data === "string" && response.data.trimStart().startsWith("<!"))
    ) {
      return Promise.reject(
        new Error(
          "The API returned an HTML page instead of data. The backend is likely out of date — run scripts/deploy.sh on the Pi."
        )
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes("/auth/")) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => apiClient(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post("/auth/refresh");
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error);
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.detail) {
      if (typeof data.detail === "string") return data.detail;
      if (Array.isArray(data.detail)) {
        return data.detail.map((d: { msg: string }) => d.msg).join(", ");
      }
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unknown error occurred";
}
