import type { PersistedDaemonEvent } from "../store/event-store.js";

export type EventSubscriber = (event: PersistedDaemonEvent) => void;

export interface EventSubscription {
  readonly unsubscribe: () => void;
}

export interface EventBus {
  readonly subscribe: (subscriber: EventSubscriber) => EventSubscription;
  readonly publish: (event: PersistedDaemonEvent) => void;
  readonly getSubscriberCount: () => number;
}

export const createEventBus = (): EventBus => {
  const subscribers = new Set<EventSubscriber>();

  return {
    subscribe: (subscriber) => {
      subscribers.add(subscriber);

      return {
        unsubscribe: () => {
          subscribers.delete(subscriber);
        },
      };
    },

    publish: (event) => {
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    },

    getSubscriberCount: () => subscribers.size,
  };
};
