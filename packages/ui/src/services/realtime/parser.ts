import type { Room, RoomId, RoomMember, RoomMessage } from "@linka/shared";

export const SUPPORTED_REALTIME_ROOM_EVENT_TYPES = [
  "room.created",
  "member.joined",
  "message.created",
] as const;

export type RealtimeRoomEventType = (typeof SUPPORTED_REALTIME_ROOM_EVENT_TYPES)[number];

export interface RealtimeEventBase<Type extends RealtimeRoomEventType, Payload> {
  readonly cursor: number;
  readonly id: string;
  readonly type: Type;
  readonly roomId?: RoomId;
  readonly payload: Payload;
}

export type RealtimeRoomEvent =
  | RealtimeEventBase<"room.created", { readonly room: Room }>
  | RealtimeEventBase<"member.joined", { readonly member: RoomMember }>
  | RealtimeEventBase<"message.created", { readonly message: RoomMessage }>;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSupportedRealtimeEventType = (value: unknown): value is RealtimeRoomEventType =>
  typeof value === "string" &&
  SUPPORTED_REALTIME_ROOM_EVENT_TYPES.includes(value as RealtimeRoomEventType);

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readCursor = (record: Record<string, unknown>): number | undefined => {
  const value = record.cursor;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const readPayloadRecord = (
  record: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const payload = record.payload;
  return isObjectRecord(payload) ? payload : undefined;
};

const readPayloadObject = (
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const wrapped = payload[key];
  if (isObjectRecord(wrapped)) {
    return wrapped;
  }

  return typeof payload.id === "string" ? payload : undefined;
};

const hasStringId = (value: Record<string, unknown>): boolean => typeof value.id === "string";

export const parsePersistedDaemonEvent = (value: unknown): RealtimeRoomEvent | undefined => {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const cursor = readCursor(value);
  const id = readString(value, "id");
  const type = value.type;
  const payload = readPayloadRecord(value);

  if (cursor === undefined || !id || !isSupportedRealtimeEventType(type) || !payload) {
    return undefined;
  }

  const roomId = readString(value, "roomId") as RoomId | undefined;

  if (type === "room.created") {
    const room = readPayloadObject(payload, "room");
    if (!room || !hasStringId(room)) {
      return undefined;
    }

    return { cursor, id, type, roomId, payload: { room: room as unknown as Room } };
  }

  if (type === "member.joined") {
    const member = readPayloadObject(payload, "member");
    if (!member || !hasStringId(member)) {
      return undefined;
    }

    return { cursor, id, type, roomId, payload: { member: member as unknown as RoomMember } };
  }

  const message = readPayloadObject(payload, "message");
  if (!message || !hasStringId(message)) {
    return undefined;
  }

  return { cursor, id, type, roomId, payload: { message: message as unknown as RoomMessage } };
};

export const parsePersistedDaemonEventData = (data: string): RealtimeRoomEvent | undefined => {
  try {
    return parsePersistedDaemonEvent(JSON.parse(data));
  } catch {
    return undefined;
  }
};
