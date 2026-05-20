import { create } from "zustand";
import {
  roomMessageId,
  unixMs,
  type Announcement,
  type Doc,
  type HarnessRun,
  type PinnedItem,
  type Room,
  type RoomFile,
  type RoomId,
  type RoomMember,
  type RoomMention,
  type RoomMessage,
  type RuntimeEvent,
} from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import { parseComposerMentions } from "./composerMentions.js";
import type { RealtimeRoomEvent } from "../services/realtime/index.js";
import { createRoomDoc, listRoomDocs } from "../services/docsService.js";
import { listHarnessRunEvents, listRoomHarnessRuns } from "../services/harnessRunsService.js";
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
  readonly docs: readonly Doc[];
  readonly harnessRuns: readonly HarnessRun[];
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
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
  readonly docsByRoomId: Readonly<Record<string, readonly Doc[]>>;
  readonly harnessRunsByRoomId: Readonly<Record<string, readonly HarnessRun[]>>;
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
  readonly filesByRoomId: Readonly<Record<string, readonly RoomFile[]>>;
  readonly announcementsByRoomId: Readonly<Record<string, readonly Announcement[]>>;
  readonly pinnedItemsByRoomId: Readonly<Record<string, readonly PinnedItem[]>>;
  readonly source: RoomDataSource;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly isCreatingDoc: boolean;
  readonly errorMessage?: string;
  readonly appliedRoomEventKeys: readonly string[];
  readonly initializeRoomWorkspace: () => Promise<void>;
  readonly selectRoom: (roomId: RoomId) => Promise<void>;
  readonly refreshActiveRoom: () => Promise<void>;
  readonly applyRoomEvent: (event: RealtimeRoomEvent) => void;
  readonly sendComposerMessage: (text: string) => Promise<void>;
  readonly createActiveRoomDoc: (input: {
    readonly title: string;
    readonly body?: string;
    readonly notifyLinkA?: boolean;
  }) => Promise<void>;
}

const fallbackRooms = [demoRoom.room];
const fallbackMembersByRoomId = { [demoRoom.room.id]: demoRoom.members };
const fallbackMessagesByRoomId = { [demoRoom.room.id]: demoRoom.messages };
const fallbackDocsByRoomId = { [demoRoom.room.id]: [] };
const fallbackHarnessRunsByRoomId = { [demoRoom.room.id]: [] };
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
    | "docsByRoomId"
    | "harnessRunsByRoomId"
    | "runtimeEventsByRunId"
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
    docs: state.docsByRoomId[room.id] ?? [],
    harnessRuns: state.harnessRunsByRoomId[room.id] ?? [],
    runtimeEventsByRunId: state.runtimeEventsByRunId,
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
    docsByRoomId: fallbackDocsByRoomId,
    harnessRunsByRoomId: fallbackHarnessRunsByRoomId,
    runtimeEventsByRunId: {},
    filesByRoomId: fallbackFilesByRoomId,
    announcementsByRoomId: fallbackAnnouncementsByRoomId,
    pinnedItemsByRoomId: fallbackPinnedItemsByRoomId,
    source: "fallback",
    isLoading: false,
    isSending: false,
    isCreatingDoc: false,
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
  readonly docs: readonly Doc[];
  readonly harnessRuns: readonly HarnessRun[];
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
}> => {
  const [members, messages, docs, harnessRuns] = await Promise.all([
    listRoomMembers(room.id),
    listRoomMessages(room.id, { afterSequence: 0, limit: 500 }),
    listRoomDocs(room.id),
    listRoomHarnessRuns(room.id),
  ]);
  const runtimeEventsByRunId = Object.fromEntries(
    await Promise.all(
      harnessRuns.map(async (run) => [run.id, await listHarnessRunEvents(run.id)] as const),
    ),
  );

  return { members, messages, docs, harnessRuns, runtimeEventsByRunId };
};

const findHumanSender = (members: readonly RoomMember[]): RoomMember | undefined =>
  members.find((member) => member.kind === "human" && member.status === "active") ??
  members.find((member) => member.kind === "human");

const findLinkAAgent = (members: readonly RoomMember[]): RoomMember | undefined =>
  members.find(
    (member) =>
      member.kind === "agent" &&
      member.status === "active" &&
      member.displayName.toLocaleLowerCase("zh-CN").includes("linka"),
  ) ?? members.find((member) => member.kind === "agent" && member.status === "active");

const makeLocalFallbackMessage = (
  room: Room,
  members: readonly RoomMember[],
  messages: readonly RoomMessage[],
  text: string,
  mentions: readonly RoomMention[],
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
    mentions: mentions.length > 0 ? mentions : undefined,
    visibility: room.defaultVisibility,
    notification: { level: "silent" },
  };
};

const mergeRoomDoc = (docs: readonly Doc[], doc: Doc): readonly Doc[] =>
  docs.some((candidate) => candidate.id === doc.id)
    ? docs.map((candidate) => (candidate.id === doc.id ? doc : candidate))
    : [...docs, doc];

const getRoomEventKeys = (event: RealtimeRoomEvent): readonly string[] => [
  `cursor:${event.cursor}`,
  `id:${event.id}`,
];

const hasAppliedRoomEvent = (keys: readonly string[], eventKeys: readonly string[]): boolean =>
  eventKeys.some((eventKey) => keys.includes(eventKey));

const hasMentionMarker = (text: string): boolean => /(^|\s)@/u.test(text);

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
  docsByRoomId: {},
  harnessRunsByRoomId: {},
  runtimeEventsByRunId: {},
  filesByRoomId: {},
  announcementsByRoomId: {},
  pinnedItemsByRoomId: {},
  source: "checking",
  isLoading: true,
  isSending: false,
  isCreatingDoc: false,
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
      const { members, messages, docs, harnessRuns, runtimeEventsByRunId } =
        await loadApiRoomData(activeRoom);

      set({
        rooms,
        activeRoomId: activeRoom.id,
        membersByRoomId: { [activeRoom.id]: members },
        messagesByRoomId: { [activeRoom.id]: messages },
        docsByRoomId: { [activeRoom.id]: docs },
        harnessRunsByRoomId: { [activeRoom.id]: harnessRuns },
        runtimeEventsByRunId,
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
      const { members, messages, docs, harnessRuns, runtimeEventsByRunId } =
        await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [roomId]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [roomId]: messages },
        docsByRoomId: { ...current.docsByRoomId, [roomId]: docs },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [roomId]: harnessRuns },
        runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
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
      const { members, messages, docs, harnessRuns, runtimeEventsByRunId } =
        await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
        docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
        runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
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
          docsByRoomId: {
            ...current.docsByRoomId,
            [room.id]: current.docsByRoomId[room.id] ?? [],
          },
          harnessRunsByRoomId: {
            ...current.harnessRunsByRoomId,
            [room.id]: current.harnessRunsByRoomId[room.id] ?? [],
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
    const mentions = parseComposerMentions(trimmed, snapshot.members);

    if (hasMentionMarker(trimmed) && mentions.length === 0) {
      set({
        isSending: false,
        errorMessage: "未识别 @ 成员，请使用输入框上方的 Agent 按钮或完整成员名。",
      });
      return;
    }

    if (snapshot.source !== "api" || !sender) {
      const message = makeLocalFallbackMessage(
        snapshot.room,
        snapshot.members,
        snapshot.messages,
        trimmed,
        mentions,
      );
      set((current) => ({
        messagesByRoomId: {
          ...current.messagesByRoomId,
          [snapshot.room.id]: [...(current.messagesByRoomId[snapshot.room.id] ?? []), message],
        },
        source: "fallback",
        errorMessage: undefined,
      }));
      return;
    }

    set({ isSending: true, errorMessage: undefined });

    try {
      await sendRoomMessage(snapshot.room.id, {
        senderMemberId: sender.id,
        kind: "text",
        text: trimmed,
        ...(mentions.length > 0 ? { mentions } : {}),
      });
      const { members, messages, docs, harnessRuns, runtimeEventsByRunId } = await loadApiRoomData(
        snapshot.room,
      );
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [snapshot.room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [snapshot.room.id]: messages },
        docsByRoomId: { ...current.docsByRoomId, [snapshot.room.id]: docs },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [snapshot.room.id]: harnessRuns },
        runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
        isSending: false,
        errorMessage: undefined,
      }));
    } catch (error) {
      const message = makeLocalFallbackMessage(
        snapshot.room,
        snapshot.members,
        snapshot.messages,
        trimmed,
        mentions,
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
  createActiveRoomDoc: async (input) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (state.source !== "api") {
      set({
        isCreatingDoc: false,
        errorMessage: "Creating room docs requires an API-backed room",
      });
      return;
    }

    if (!room) {
      set({ isCreatingDoc: false, errorMessage: "No active room selected" });
      return;
    }

    const members = state.membersByRoomId[room.id] ?? [];
    const sender = findHumanSender(members);

    if (!sender) {
      set({ isCreatingDoc: false, errorMessage: "No human room member available" });
      return;
    }

    set({ isCreatingDoc: true, errorMessage: undefined });

    try {
      const doc = await createRoomDoc(room.id, {
        title: input.title,
        ...(input.body === undefined ? {} : { body: input.body }),
        format: "markdown",
        status: "active",
        createdByMemberId: sender.id,
        visibility: { scope: "room" },
      });

      if (input.notifyLinkA) {
        const linka = findLinkAAgent(members);
        if (!linka) {
          set((current) => ({
            docsByRoomId: {
              ...current.docsByRoomId,
              [room.id]: mergeRoomDoc(current.docsByRoomId[room.id] ?? [], doc),
            },
            isCreatingDoc: false,
            errorMessage: "No active LinkA agent available",
          }));
          return;
        }

        await sendRoomMessage(room.id, {
          senderMemberId: sender.id,
          kind: "instruction",
          text: `@${linka.displayName} 请根据刚创建的 Doc「${doc.title}」继续推进。`,
          mentions: [{ memberId: linka.id, displayText: `@${linka.displayName}` }],
        });
        const {
          members: loadedMembers,
          messages,
          docs,
          harnessRuns,
          runtimeEventsByRunId,
        } = await loadApiRoomData(room);
        set((current) => ({
          membersByRoomId: { ...current.membersByRoomId, [room.id]: loadedMembers },
          messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
          docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
          harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
          runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
          isCreatingDoc: false,
          errorMessage: undefined,
        }));
        return;
      }

      set((current) => ({
        docsByRoomId: {
          ...current.docsByRoomId,
          [room.id]: mergeRoomDoc(current.docsByRoomId[room.id] ?? [], doc),
        },
        isCreatingDoc: false,
        errorMessage: undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to create room doc";
      set({ isCreatingDoc: false, errorMessage });
    }
  },
}));
