import { apiClient } from "./client";

export const gpioApi = {
  getPins: async () => {
    const { data } = await apiClient.get("/gpio/pins");
    return data;
  },

  setMode: async (gpio: number, mode: "IN" | "OUT") => {
    const { data } = await apiClient.post(`/gpio/pins/${gpio}/mode`, { mode });
    return data;
  },

  setValue: async (gpio: number, value: 0 | 1) => {
    const { data } = await apiClient.post(`/gpio/pins/${gpio}/set`, { value });
    return data;
  },

  setPwm: async (gpio: number, frequency: number, duty_cycle: number) => {
    const { data } = await apiClient.post(`/gpio/pins/${gpio}/pwm`, { frequency, duty_cycle });
    return data;
  },
};
