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

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  status: "idle",
  lastCursor: 0,
  errorMessage: undefined,
  connect: ({ sourceFactory, onRoomEvent }) => {
    closeActiveConnection();
    set({ status: "connecting", errorMessage: undefined });

    try {
      activeConnection = connectRealtimeStream({
        cursor: get().lastCursor,
        sourceFactory,
        onOpen: () => set({ status: "open", errorMessage: undefined }),
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : "Realtime stream error";
          set({ status: "error", errorMessage });
        },
        onEvent: (event) => {
          set((current) => ({
            lastCursor: Math.max(current.lastCursor, event.cursor),
            errorMessage: undefined,
          }));
          onRoomEvent(event);
        },
      });
    } catch (error) {
      closeActiveConnection();
      const errorMessage =
        error instanceof Error ? error.message : "Unable to connect realtime stream";
      set({ status: "error", errorMessage });
    }
  },
  disconnect: () => {
    closeActiveConnection();
    set({ status: "idle", errorMessage: undefined });
  },
}));
