import {
  SUPPORTED_REALTIME_ROOM_EVENT_TYPES,
  parsePersistedDaemonEventData,
  type RealtimeRoomEvent,
} from "./parser.js";

interface StreamMessageEvent {
  readonly data?: unknown;
  readonly lastEventId?: string;
}

interface BrowserRealtimeSource {
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: StreamMessageEvent) => void) | null;
  addEventListener?: (type: string, listener: (event: StreamMessageEvent) => void) => void;
  removeEventListener?: (type: string, listener: (event: StreamMessageEvent) => void) => void;
  close: () => void;
}

export type RealtimeSourceFactory = (url: string) => BrowserRealtimeSource;

export interface RealtimeStreamConnection {
  readonly close: () => void;
}

export interface ConnectRealtimeStreamOptions {
  readonly cursor?: number;
  readonly sourceFactory?: RealtimeSourceFactory;
  readonly onOpen?: () => void;
  readonly onError?: (error: unknown) => void;
  readonly onEvent: (event: RealtimeRoomEvent) => void;
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, "");

const getDefaultBaseUrl = (): string => {
  const env = (
    import.meta as ImportMeta & { readonly env?: { readonly VITE_LINKA_DAEMON_URL?: string } }
  ).env;
  const configuredUrl = env?.VITE_LINKA_DAEMON_URL;

  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return normalizeBaseUrl(configuredUrl.trim());
  }

  return "";
};

export const buildRealtimeEventsUrl = (cursor = 0): string => {
  const params = new URLSearchParams({ cursor: String(cursor) });
  return `${getDefaultBaseUrl()}/linka/events?${params.toString()}`;
};

const createBrowserRealtimeSource: RealtimeSourceFactory = (url) => {
  const SourceConstructor = globalThis.EventSource;

  if (!SourceConstructor) {
    throw new Error("EventSource is not available for LinkA realtime events");
  }

  return new SourceConstructor(url) as BrowserRealtimeSource;
};

export const connectRealtimeStream = ({
  cursor = 0,
  sourceFactory = createBrowserRealtimeSource,
  onOpen,
  onError,
  onEvent,
}: ConnectRealtimeStreamOptions): RealtimeStreamConnection => {
  const source = sourceFactory(buildRealtimeEventsUrl(cursor));
  const listeners: Array<readonly [string, (event: StreamMessageEvent) => void]> = [];
  let isClosed = false;

  const close = (): void => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (source.removeEventListener) {
      for (const [eventType, listener] of listeners) {
        source.removeEventListener(eventType, listener);
      }
    }

    source.onopen = null;
    source.onerror = null;
    source.onmessage = null;
    source.close();
  };

  const handleMessage = (event: StreamMessageEvent): void => {
    if (isClosed || typeof event.data !== "string") {
      return;
    }

    const parsed = parsePersistedDaemonEventData(event.data);
    if (parsed) {
      onEvent(parsed);
    }
  };

  source.onopen = () => {
    if (!isClosed) {
      onOpen?.();
    }
  };
  source.onerror = (event) => {
    if (isClosed) {
      return;
    }

    onError?.(event);
    close();
  };
  source.onmessage = handleMessage;

  if (source.addEventListener) {
    for (const eventType of SUPPORTED_REALTIME_ROOM_EVENT_TYPES) {
      source.addEventListener(eventType, handleMessage);
      listeners.push([eventType, handleMessage]);
    }
  }

  return { close };
};
