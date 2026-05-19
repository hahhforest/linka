import assert from "node:assert/strict";

import { demoRoom } from "../fixtures/demoRoom.js";
import { useRealtimeStore } from "./realtimeStore.js";

interface FakeStreamEvent {
  readonly data?: unknown;
}

class FakeRealtimeSource {
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: FakeStreamEvent) => void) | null = null;
  readonly listeners = new Map<string, Array<(event: FakeStreamEvent) => void>>();
  closed = false;

  addEventListener(type: string, listener: (event: FakeStreamEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: (event: FakeStreamEvent) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  open(): void {
    this.onopen?.({});
  }

  fail(error: unknown = new Error("stream failed")): void {
    this.onerror?.(error);
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }

  close(): void {
    this.closed = true;
  }
}

const resetRealtimeStore = (): void => {
  useRealtimeStore.getState().disconnect();
  useRealtimeStore.setState({ status: "idle", lastCursor: 0, errorMessage: undefined });
};

resetRealtimeStore();

let createdSource: FakeRealtimeSource | undefined;
let capturedUrl = "";
let sourceCreateCount = 0;
const receivedEvents: unknown[] = [];

useRealtimeStore.getState().connect({
  sourceFactory: (url) => {
    sourceCreateCount += 1;
    capturedUrl = url;
    createdSource = new FakeRealtimeSource();
    return createdSource;
  },
  onRoomEvent: (event) => receivedEvents.push(event),
});

assert.equal(useRealtimeStore.getState().status, "connecting");
assert.equal(capturedUrl, "/linka/events?cursor=0");
assert.ok(createdSource);

createdSource.open();
assert.equal(useRealtimeStore.getState().status, "open");

useRealtimeStore.getState().connect({
  sourceFactory: () => {
    throw new Error("already connected streams should be reused");
  },
  onRoomEvent: (event) => receivedEvents.push(event),
});
assert.equal(sourceCreateCount, 1);

createdSource.emit("message.created", {
  cursor: 8,
  id: "evt_message_8",
  type: "message.created",
  roomId: demoRoom.room.id,
  payload: { message: demoRoom.messages[0] },
});

assert.equal(receivedEvents.length, 1);
assert.equal(useRealtimeStore.getState().lastCursor, 8);

useRealtimeStore.getState().disconnect();
assert.equal(useRealtimeStore.getState().status, "idle");
assert.equal(createdSource.closed, true);
assert.equal(useRealtimeStore.getState().lastCursor, 8);

console.log("realtime store lifecycle: ok");

resetRealtimeStore();
let errorSource: FakeRealtimeSource | undefined;
let notifications = 0;
const unsubscribe = useRealtimeStore.subscribe(() => {
  notifications += 1;
});

useRealtimeStore.getState().connect({
  sourceFactory: () => {
    errorSource = new FakeRealtimeSource();
    return errorSource;
  },
  onRoomEvent: () => undefined,
});

assert.ok(errorSource);
errorSource.fail(new Error("daemon stream unavailable"));
const notificationsAfterFirstError = notifications;
assert.equal(useRealtimeStore.getState().status, "error");
assert.equal(useRealtimeStore.getState().errorMessage, "daemon stream unavailable");
assert.equal(errorSource.closed, true);

errorSource.fail(new Error("daemon stream unavailable"));
assert.equal(notifications, notificationsAfterFirstError);
assert.equal(useRealtimeStore.getState().status, "error");

unsubscribe();
console.log("realtime store controlled error handling: ok");
