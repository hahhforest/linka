import type { RuntimeAdapter } from "@linka/harness";
import {
  roomMessageId,
  unixMs,
  type Room,
  type RoomMessage,
  type RoomNotificationPolicy,
  type RoomVisibility,
  type RuntimeEvent,
  type UnixMs,
} from "@linka/shared";

import type { RoomHarnessRunner, RoomHarnessRunnerInput } from "../api/rooms.js";
import type { DaemonContainer } from "../container/index.js";
import type { DaemonEventEnvelope, PersistedDaemonEvent } from "../store/event-store.js";
import { startHarnessRun } from "./run-service.js";

export const DEFAULT_OPENCODE_MODEL = "azure/gpt-5.5";
export const DEFAULT_OPENCODE_VARIANT = "xhigh";

export interface CreateOpenCodeRoomHarnessRunnerOptions {
  readonly container: Pick<
    DaemonContainer,
    "roomStore" | "messageStore" | "docStore" | "harnessRunStore" | "eventStore" | "eventBus"
  >;
  readonly adapter?: RuntimeAdapter;
  readonly now?: () => Date | number;
}

const defaultVisibility: RoomVisibility = { scope: "room" };
const defaultNotificationPolicy: RoomNotificationPolicy = { level: "normal" };

const createMessageApiId = (): RoomMessage["id"] => roomMessageId(`rmsg_${crypto.randomUUID()}`);
const createDaemonEventId = (): string => `evt_${crypto.randomUUID()}`;

const readNow = (now: CreateOpenCodeRoomHarnessRunnerOptions["now"]): UnixMs => {
  const value = now?.() ?? Date.now();
  return unixMs(value instanceof Date ? value.getTime() : value);
};

const selectLastAdapterOutputText = (events: readonly RuntimeEvent[]): string | undefined => {
  let outputText: string | undefined;

  for (const event of events) {
    if (event.type !== "adapter.output" || event.payload.kind !== "adapter_output") {
      continue;
    }

    const { text } = event.payload;
    if (typeof text === "string" && text.trim().length > 0) {
      outputText = text;
    }
  }

  return outputText;
};

const formatFailureReplyText = (error: string | undefined): string => {
  const detail = error?.trim();
  return detail && detail.length > 0
    ? `LinkA 运行失败：${detail}`
    : "LinkA 运行失败，请查看运行状态。";
};

const publishRoomEvent = (
  container: Pick<DaemonContainer, "eventStore" | "eventBus">,
  event: Omit<DaemonEventEnvelope, "id" | "createdAt">,
  createdAt: UnixMs,
): PersistedDaemonEvent => {
  const persisted = container.eventStore.append({
    ...event,
    id: createDaemonEventId(),
    createdAt,
  });

  container.eventBus.publish(persisted);
  return persisted;
};

const publishMessageCreated = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  roomId: Room["id"],
  message: RoomMessage,
  createdAt: UnixMs,
): void => {
  publishRoomEvent(
    container,
    {
      roomId,
      type: "message.created",
      payload: { message },
    },
    createdAt,
  );
};

const appendOutputMessage = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  input: RoomHarnessRunnerInput,
  text: string,
  createdAt: UnixMs,
): RoomMessage =>
  container.messageStore.appendMessage({
    id: createMessageApiId(),
    roomId: input.room.id,
    sender: { kind: "member", memberId: input.targetMember.id },
    kind: "text",
    createdAt,
    text,
    replyTo: { messageId: input.message.id },
    visibility: defaultVisibility,
    notification: defaultNotificationPolicy,
  });

export const createOpenCodeRoomHarnessRunner = ({
  container,
  adapter,
  now,
}: CreateOpenCodeRoomHarnessRunnerOptions): RoomHarnessRunner => {
  if (!adapter) {
    throw new Error("OpenCode room harness runner requires a runtime adapter");
  }

  return async (input) => {
    const result = await startHarnessRun({
      container,
      adapter,
      roomId: input.room.id,
      targetMemberId: input.targetMember.id,
      triggerMessageId: input.message.id,
      now,
    });
    const outputText =
      selectLastAdapterOutputText(result.events) ??
      (result.run.status === "failed" ? formatFailureReplyText(result.run.error) : undefined);

    if (outputText === undefined) {
      return;
    }

    const createdAt = readNow(now);
    const message = appendOutputMessage(container, input, outputText, createdAt);
    publishMessageCreated(container, input.room.id, message, createdAt);
  };
};
