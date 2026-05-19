import { create } from "zustand";

import {
  connectRealtimeStream,
  type RealtimeRoomEvent,
  type RealtimeSourceFactory,
  type RealtimeStreamConnection,
} from "../services/realtime/index.js";

export type RealtimeConnectionStatus = "idle" | "connecting" | "open" | "error";

export interface RealtimeConnectOptions {
  readonly sourceFactory?: RealtimeSourceFactory;
  readonly onRoomEvent: (event: RealtimeRoomEvent) => void;
}

export interface RealtimeState {
  readonly status: RealtimeConnectionStatus;
  readonly lastCursor: number;
  readonly errorMessage?: string;
  readonly connect: (options: RealtimeConnectOptions) => void;
  readonly disconnect: () => void;
}

let activeConnection: RealtimeStreamConnection | undefined;

const closeActiveConnection = (): void => {
  activeConnection?.close();
  activeConnection = undefined;
};

const getRealtimeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Realtime stream error";

export const useRealtimeStore = create<RealtimeState>((set, get) => {
  const setRealtimeError = (errorMessage: string): void => {
    set((current) => {
      if (current.status === "error" && current.errorMessage === errorMessage) {
        return current;
      }

      return { status: "error", errorMessage };
    });
  };

  return {
    status: "idle",
    lastCursor: 0,
    errorMessage: undefined,
    connect: ({ sourceFactory, onRoomEvent }) => {
      const current = get();
      if (activeConnection && (current.status === "connecting" || current.status === "open")) {
        return;
      }

      closeActiveConnection();
      set({ status: "connecting", errorMessage: undefined });

      try {
        activeConnection = connectRealtimeStream({
          cursor: get().lastCursor,
          sourceFactory,
          onOpen: () => set({ status: "open", errorMessage: undefined }),
          onError: (error) => {
            closeActiveConnection();
            setRealtimeError(getRealtimeErrorMessage(error));
          },
          onEvent: (event) => {
            set((currentState) => ({
              lastCursor: Math.max(currentState.lastCursor, event.cursor),
              errorMessage: undefined,
            }));
            onRoomEvent(event);
          },
        });
      } catch (error) {
        closeActiveConnection();
        const errorMessage =
          error instanceof Error ? error.message : "Unable to connect realtime stream";
        setRealtimeError(errorMessage);
      }
    },
    disconnect: () => {
      closeActiveConnection();
      const current = get();
      if (current.status !== "idle" || current.errorMessage !== undefined) {
        set({ status: "idle", errorMessage: undefined });
      }
    },
  };
});
