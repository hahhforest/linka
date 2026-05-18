import { create } from "zustand";

import { getDaemonHealth, type DaemonHealthSnapshot } from "../services/healthService.js";

export type DaemonConnectionStatus = "checking" | "online" | "offline" | "error";

export interface ConnectionState {
  readonly status: DaemonConnectionStatus;
  readonly health?: DaemonHealthSnapshot;
  readonly errorMessage?: string;
  readonly checkDaemonConnection: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "checking",
  health: undefined,
  errorMessage: undefined,
  checkDaemonConnection: async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3_000);

    set({ status: "checking", errorMessage: undefined });

    try {
      const health = await getDaemonHealth(controller.signal);
      set({
        status: health.ok ? "online" : "offline",
        health,
        errorMessage: health.ok ? undefined : health.statusText,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown daemon connection error";
      set({ status: "error", health: undefined, errorMessage });
    } finally {
      window.clearTimeout(timeoutId);
    }
  },
}));
