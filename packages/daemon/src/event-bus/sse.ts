import type { EventBus, EventSubscription } from "./index.js";
import type { EventStore, PersistedDaemonEvent } from "../store/event-store.js";

const HISTORY_LIMIT = 500;

export interface EventStreamOptions {
  readonly eventStore: EventStore;
  readonly eventBus: EventBus;
  readonly cursor: number;
}

export const parseCursor = (value: string | null): number => {
  if (value === null || value.trim().length === 0) {
    return 0;
  }

  const cursor = Number(value);

  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("cursor must be a non-negative integer");
  }

  return cursor;
};

export const encodeSseEvent = (event: PersistedDaemonEvent): string =>
  [`id: ${event.cursor}`, `event: ${event.type}`, `data: ${JSON.stringify(event)}`, "", ""].join("\n");

export const createEventStream = ({ eventStore, eventBus, cursor }: EventStreamOptions): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let subscription: EventSubscription | null = null;

  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      const write = (event: PersistedDaemonEvent): void => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };

      for (const event of eventStore.listAfter(cursor, HISTORY_LIMIT)) {
        write(event);
      }

      subscription = eventBus.subscribe(write);
    },

    cancel: () => {
      subscription?.unsubscribe();
      subscription = null;
    },
  });
};
