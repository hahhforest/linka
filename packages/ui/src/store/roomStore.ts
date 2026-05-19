import { create } from "zustand";
import {
  roomMessageId,
  unixMs,
  type Announcement,
  type PinnedItem,
  type Room,
  type RoomFile,
  type RoomId,
  type RoomMember,
  type RoomMessage,
} from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import type { RealtimeRoomEvent } from "../services/realtime/index.js";
import {
  addRoomMember,
  createRoom,
  listRoomMembers,
  listRoomMessages,
  listRooms,
  sendRoomMessage,
} from "../services/roomsService.js";

export type RoomDataSource = "checking" | "api" | "fallback";

export interface RoomWorkspaceSnapshot {
  readonly room: Room;
  readonly members: readonly RoomMember[];
  readonly messages: readonly RoomMessage[];
  readonly files: readonly RoomFile[];
  readonly announcements: readonly Announcement[];
  readonly pinnedItems: readonly PinnedItem[];
  readonly source: RoomDataSource;
}

export interface RoomState {
  readonly rooms: readonly Room[];
  readonly activeRoomId?: RoomId;
  readonly membersByRoomId: Readonly<Record<string, readonly RoomMember[]>>;
  readonly messagesByRoomId: Readonly<Record<string, readonly RoomMessage[]>>;
  readonly filesByRoomId: Readonly<Record<string, readonly RoomFile[]>>;
  readonly announcementsByRoomId: Readonly<Record<string, readonly Announcement[]>>;
  readonly pinnedItemsByRoomId: Readonly<Record<string, readonly PinnedItem[]>>;
  readonly source: RoomDataSource;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly errorMessage?: string;
  readonly appliedRoomEventKeys: readonly string[];
  readonly initializeRoomWorkspace: () => Promise<void>;
  readonly selectRoom: (roomId: RoomId) => Promise<void>;
  readonly refreshActiveRoom: () => Promise<void>;
  readonly applyRoomEvent: (event: RealtimeRoomEvent) => void;
  readonly sendComposerMessage: (text: string) => Promise<void>;
}

const fallbackRooms = [demoRoom.room];
const fallbackMembersByRoomId = { [demoRoom.room.id]: demoRoom.members };
const fallbackMessagesByRoomId = { [demoRoom.room.id]: demoRoom.messages };
const fallbackFilesByRoomId = { [demoRoom.room.id]: demoRoom.files };
const fallbackAnnouncementsByRoomId = { [demoRoom.room.id]: demoRoom.announcements };
const fallbackPinnedItemsByRoomId = { [demoRoom.room.id]: demoRoom.pinnedItems };

const getActiveSnapshot = (
  state: Pick<
    RoomState,
    | "rooms"
    | "activeRoomId"
    | "membersByRoomId"
    | "messagesByRoomId"
    | "filesByRoomId"
    | "announcementsByRoomId"
    | "pinnedItemsByRoomId"
    | "source"
  >,
): RoomWorkspaceSnapshot => {
  const room =
    state.rooms.find((candidate) => candidate.id === state.activeRoomId) ?? demoRoom.room;

  return {
    room,
    members: state.membersByRoomId[room.id] ?? [],
    messages: state.messagesByRoomId[room.id] ?? [],
    files: state.filesByRoomId[room.id] ?? [],
    announcements: state.announcementsByRoomId[room.id] ?? [],
    pinnedItems: state.pinnedItemsByRoomId[room.id] ?? [],
    source: state.source,
  };
};

const loadFallback = (set: (state: Partial<RoomState>) => void, error?: unknown): void => {
  const errorMessage = error instanceof Error ? error.message : undefined;

  set({
    rooms: fallbackRooms,
    activeRoomId: demoRoom.room.id,
    membersByRoomId: fallbackMembersByRoomId,
    messagesByRoomId: fallbackMessagesByRoomId,
    filesByRoomId: fallbackFilesByRoomId,
    announcementsByRoomId: fallbackAnnouncementsByRoomId,
    pinnedItemsByRoomId: fallbackPinnedItemsByRoomId,
    source: "fallback",
    isLoading: false,
    isSending: false,
    errorMessage,
    appliedRoomEventKeys: [],
  });
};

const createDemoLikeApiRoom = async (): Promise<Room> => {
  const room = await createRoom({
    displayName: demoRoom.room.displayName,
    topic: demoRoom.room.topic,
  });

  const human = await addRoomMember(room.id, {
    participantId: demoRoom.members[0]?.participantId,
    kind: "human",
    role: "owner",
    displayName: "用户",
  });
  const linka = await addRoomMember(room.id, {
    participantId: demoRoom.members[1]?.participantId,
    kind: "agent",
    role: "admin",
    displayName: "LinkA",
  });

  await addRoomMember(room.id, {
    participantId: demoRoom.members[2]?.participantId,
    kind: "agent",
    role: "member",
    displayName: "资料 Agent",
  });
  await addRoomMember(room.id, {
    participantId: demoRoom.members[3]?.participantId,
    kind: "agent",
    role: "member",
    displayName: "核验 Agent",
  });

  await sendRoomMessage(room.id, {
    senderMemberId: human.id,
    kind: "instruction",
    text: demoRoom.messages.find((message) => message.id === "rmsg_user_initial_request")?.text,
    mentions: [{ memberId: linka.id, displayText: "@LinkA" }],
  });

  return room;
};

const loadApiRoomData = async (
  room: Room,
): Promise<{
  readonly members: readonly RoomMember[];
  readonly messages: readonly RoomMessage[];
}> => {
  const [members, messages] = await Promise.all([
    listRoomMembers(room.id),
    listRoomMessages(room.id, { afterSequence: 0, limit: 500 }),
  ]);

  return { members, messages };
};

const findHumanSender = (members: readonly RoomMember[]): RoomMember | undefined =>
  members.find((member) => member.kind === "human" && member.status === "active") ??
  members.find((member) => member.kind === "human");

const makeLocalFallbackMessage = (
  room: Room,
  members: readonly RoomMember[],
  messages: readonly RoomMessage[],
  text: string,
): RoomMessage => {
  const sender = findHumanSender(members);
  const nextSequence = Math.max(0, ...messages.map((message) => message.sequence)) + 1;

  return {
    id: roomMessageId(`rmsg_local_${Date.now()}`),
    roomId: room.id,
    sequence: nextSequence,
    sender: sender
      ? { kind: "member", memberId: sender.id }
      : { kind: "system", label: "Local Draft" },
    kind: "text",
    createdAt: unixMs(Date.now()),
    text,
    visibility: room.defaultVisibility,
    notification: { level: "silent" },
  };
};

const getRoomEventKeys = (event: RealtimeRoomEvent): readonly string[] => [
  `cursor:${event.cursor}`,
  `id:${event.id}`,
];

const hasAppliedRoomEvent = (keys: readonly string[], eventKeys: readonly string[]): boolean =>
  eventKeys.some((eventKey) => keys.includes(eventKey));

const addRoomEventKeys = (
  keys: readonly string[],
  eventKeys: readonly string[],
): readonly string[] => {
  const nextKeys = [...keys];

  for (const eventKey of eventKeys) {
    if (!nextKeys.includes(eventKey)) {
      nextKeys.push(eventKey);
    }
  }

  return nextKeys;
};

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  activeRoomId: undefined,
  membersByRoomId: {},
  messagesByRoomId: {},
  filesByRoomId: {},
  announcementsByRoomId: {},
  pinnedItemsByRoomId: {},
  source: "checking",
  isLoading: true,
  isSending: false,
  errorMessage: undefined,
  appliedRoomEventKeys: [],
  initializeRoomWorkspace: async () => {
    set({ source: "checking", isLoading: true, errorMessage: undefined });

    try {
      let rooms = await listRooms();

      if (rooms.length === 0) {
        const room = await createDemoLikeApiRoom();
        rooms = [room];
      }

      const activeRoom = rooms[0] ?? demoRoom.room;
      const { members, messages } = await loadApiRoomData(activeRoom);

      set({
        rooms,
        activeRoomId: activeRoom.id,
        membersByRoomId: { [activeRoom.id]: members },
        messagesByRoomId: { [activeRoom.id]: messages },
        filesByRoomId: { [activeRoom.id]: [] },
        announcementsByRoomId: { [activeRoom.id]: [] },
        pinnedItemsByRoomId: { [activeRoom.id]: [] },
        source: "api",
        isLoading: false,
        errorMessage: undefined,
        appliedRoomEventKeys: [],
      });
    } catch (error) {
      loadFallback(set, error);
    }
  },
  selectRoom: async (roomId) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === roomId);

    if (!room) {
      return;
    }

    set({ activeRoomId: roomId });

    if (state.source !== "api") {
      return;
    }

    try {
      const { members, messages } = await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [roomId]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [roomId]: messages },
        errorMessage: undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to refresh room";
      set({ errorMessage });
    }
  },
  refreshActiveRoom: async () => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (!room || state.source !== "api") {
      return;
    }

    try {
      const { members, messages } = await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
        errorMessage: undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to refresh room";
      set({ errorMessage });
    }
  },
  applyRoomEvent: (event) => {
    const eventKeys = getRoomEventKeys(event);

    set((current) => {
      if (hasAppliedRoomEvent(current.appliedRoomEventKeys, eventKeys)) {
        return current;
      }

      const appliedRoomEventKeys = addRoomEventKeys(current.appliedRoomEventKeys, eventKeys);

      if (event.type === "room.created") {
        const room = event.payload.room;
        const roomExists = current.rooms.some((candidate) => candidate.id === room.id);

        return {
          rooms: roomExists ? current.rooms : [...current.rooms, room],
          membersByRoomId: {
            ...current.membersByRoomId,
            [room.id]: current.membersByRoomId[room.id] ?? [],
          },
          messagesByRoomId: {
            ...current.messagesByRoomId,
            [room.id]: current.messagesByRoomId[room.id] ?? [],
          },
          filesByRoomId: {
            ...current.filesByRoomId,
            [room.id]: current.filesByRoomId[room.id] ?? [],
          },
          announcementsByRoomId: {
            ...current.announcementsByRoomId,
            [room.id]: current.announcementsByRoomId[room.id] ?? [],
          },
          pinnedItemsByRoomId: {
            ...current.pinnedItemsByRoomId,
            [room.id]: current.pinnedItemsByRoomId[room.id] ?? [],
          },
          appliedRoomEventKeys,
        };
      }

      if (event.type === "member.joined") {
        const member = event.payload.member;
        const roomId = event.roomId ?? member.roomId;
        const currentMembers = current.membersByRoomId[roomId] ?? [];

        return {
          membersByRoomId: {
            ...current.membersByRoomId,
            [roomId]: currentMembers.some((candidate) => candidate.id === member.id)
              ? currentMembers
              : [...currentMembers, member],
          },
          appliedRoomEventKeys,
        };
      }

      const message = event.payload.message;
      const roomId = event.roomId ?? message.roomId;

      if (roomId !== current.activeRoomId) {
        return { appliedRoomEventKeys };
      }

      const currentMessages = current.messagesByRoomId[roomId] ?? [];
      return {
        messagesByRoomId: {
          ...current.messagesByRoomId,
          [roomId]: currentMessages.some((candidate) => candidate.id === message.id)
            ? currentMessages
            : [...currentMessages, message],
        },
        appliedRoomEventKeys,
      };
    });
  },
  sendComposerMessage: async (text) => {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return;
    }

    const state = get();
    const snapshot = getActiveSnapshot(state);
    const sender = findHumanSender(snapshot.members);

    if (snapshot.source !== "api" || !sender) {
      const message = makeLocalFallbackMessage(
        snapshot.room,
        snapshot.members,
        snapshot.messages,
        trimmed,
      );
      set((current) => ({
        messagesByRoomId: {
          ...current.messagesByRoomId,
          [snapshot.room.id]: [...(current.messagesByRoomId[snapshot.room.id] ?? []), message],
        },
        source: "fallback",
        errorMessage: state.errorMessage,
      }));
      return;
    }

    set({ isSending: true, errorMessage: undefined });

    try {
      await sendRoomMessage(snapshot.room.id, {
        senderMemberId: sender.id,
        kind: "text",
        text: trimmed,
      });
      const { members, messages } = await loadApiRoomData(snapshot.room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [snapshot.room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [snapshot.room.id]: messages },
        isSending: false,
        errorMessage: undefined,
      }));
    } catch (error) {
      const message = makeLocalFallbackMessage(
        snapshot.room,
        snapshot.members,
        snapshot.messages,
        trimmed,
      );
      const errorMessage = error instanceof Error ? error.message : "Unable to send room message";
      set((current) => ({
        messagesByRoomId: {
          ...current.messagesByRoomId,
          [snapshot.room.id]: [...(current.messagesByRoomId[snapshot.room.id] ?? []), message],
        },
        source: "fallback",
        isSending: false,
        errorMessage,
      }));
    }
  },
}));
