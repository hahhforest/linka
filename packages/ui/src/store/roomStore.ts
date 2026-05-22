import { create } from "zustand";
import {
  type Announcement,
  type AnnouncementId,
  type Doc,
  type DocComment,
  type DocId,
  type DocRevision,
  type DocStatus,
  type HarnessRun,
  type HarnessSession,
  type PendingInteraction,
  type PendingInteractionId,
  type PendingInteractionStatus,
  type PinnedItem,
  type Room,
  type RoomFile,
  type RoomId,
  type RoomMember,
  type RoomMessage,
  type RuntimeEvent,
} from "@linka/shared";

import { parseComposerMentions } from "./composerMentions.js";
import type { RealtimeRoomEvent } from "../services/realtime/index.js";
import {
  createDocComment,
  createRoomDoc,
  getDoc,
  listRoomDocs,
  updateDoc,
} from "../services/docsService.js";
import {
  createRoomAnnouncement,
  deleteAnnouncement,
  listRoomAnnouncements,
  updateAnnouncement,
} from "../services/announcementsService.js";
import { listHarnessRunEvents, listRoomHarnessRuns } from "../services/harnessRunsService.js";
import { listRoomHarnessSessions } from "../services/harnessSessionsService.js";
import {
  listRoomPendingInteractions,
  respondPendingInteraction,
} from "../services/pendingInteractionsService.js";
import {
  addRoomMember,
  createRoom,
  listRoomMembers,
  listRoomMessages,
  listRooms,
  sendRoomMessage,
} from "../services/roomsService.js";

export type RoomDataSource = "checking" | "api" | "offline" | "demo";

export interface DocDetailSnapshot {
  readonly revisions: readonly DocRevision[];
  readonly comments: readonly DocComment[];
}

export interface RoomState {
  readonly rooms: readonly Room[];
  readonly activeRoomId?: RoomId;
  readonly membersByRoomId: Readonly<Record<string, readonly RoomMember[]>>;
  readonly messagesByRoomId: Readonly<Record<string, readonly RoomMessage[]>>;
  readonly docsByRoomId: Readonly<Record<string, readonly Doc[]>>;
  readonly docDetailsByDocId: Readonly<Record<string, DocDetailSnapshot>>;
  readonly harnessRunsByRoomId: Readonly<Record<string, readonly HarnessRun[]>>;
  readonly harnessSessionsByRoomId: Readonly<Record<string, readonly HarnessSession[]>>;
  readonly pendingInteractionsByRoomId: Readonly<Record<string, readonly PendingInteraction[]>>;
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
  readonly filesByRoomId: Readonly<Record<string, readonly RoomFile[]>>;
  readonly announcementsByRoomId: Readonly<Record<string, readonly Announcement[]>>;
  readonly pinnedItemsByRoomId: Readonly<Record<string, readonly PinnedItem[]>>;
  readonly source: RoomDataSource;
  readonly isLoading: boolean;
  readonly isCreatingRoom: boolean;
  readonly isSending: boolean;
  readonly isCreatingDoc: boolean;
  readonly errorMessage?: string;
  readonly appliedRoomEventKeys: readonly string[];
  readonly initializeRoomWorkspace: () => Promise<void>;
  readonly createRoomWithDefaults: (input: {
    readonly displayName: string;
    readonly topic?: string;
  }) => Promise<Room | undefined>;
  readonly selectRoom: (roomId: RoomId) => Promise<void>;
  readonly refreshActiveRoom: () => Promise<void>;
  readonly applyRoomEvent: (event: RealtimeRoomEvent) => void;
  readonly sendComposerMessage: (text: string) => Promise<void>;
  readonly respondToPendingInteraction: (
    interactionId: PendingInteractionId,
    input: {
      readonly text: string;
      readonly status?: Exclude<PendingInteractionStatus, "requested">;
    },
  ) => Promise<PendingInteraction | undefined>;
  readonly createActiveRoomDoc: (input: {
    readonly title: string;
    readonly body?: string;
    readonly notifyLinkA?: boolean;
  }) => Promise<Doc | undefined>;
  readonly loadActiveRoomDocDetail: (docId: DocId) => Promise<DocDetailSnapshot | undefined>;
  readonly updateActiveRoomDoc: (
    docId: DocId,
    input: {
      readonly title?: string;
      readonly body?: string;
      readonly status?: DocStatus;
      readonly summary?: string;
    },
  ) => Promise<Doc | undefined>;
  readonly createActiveDocComment: (
    docId: DocId,
    input: { readonly body: string },
  ) => Promise<DocComment | undefined>;
  readonly createActiveRoomAnnouncement: (input: {
    readonly title?: string;
    readonly body: string;
  }) => Promise<Announcement | undefined>;
  readonly updateActiveRoomAnnouncement: (
    announcementId: AnnouncementId,
    input: { readonly title?: string | null; readonly body?: string },
  ) => Promise<Announcement | undefined>;
  readonly deleteActiveRoomAnnouncement: (announcementId: AnnouncementId) => Promise<boolean>;
}

const resetWorkspaceState = (
  set: (state: Partial<RoomState>) => void,
  source: RoomDataSource,
  error?: unknown,
): void => {
  const errorMessage = error instanceof Error ? error.message : undefined;

  set({
    rooms: [],
    activeRoomId: undefined,
    membersByRoomId: {},
    messagesByRoomId: {},
    docsByRoomId: {},
    docDetailsByDocId: {},
    harnessRunsByRoomId: {},
    harnessSessionsByRoomId: {},
    pendingInteractionsByRoomId: {},
    runtimeEventsByRunId: {},
    filesByRoomId: {},
    announcementsByRoomId: {},
    pinnedItemsByRoomId: {},
    source,
    isLoading: false,
    isCreatingRoom: false,
    isSending: false,
    isCreatingDoc: false,
    errorMessage,
    appliedRoomEventKeys: [],
  });
};

const loadApiRoomData = async (
  room: Room,
): Promise<{
  readonly members: readonly RoomMember[];
  readonly messages: readonly RoomMessage[];
  readonly docs: readonly Doc[];
  readonly announcements: readonly Announcement[];
  readonly harnessRuns: readonly HarnessRun[];
  readonly harnessSessions: readonly HarnessSession[];
  readonly pendingInteractions: readonly PendingInteraction[];
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
}> => {
  const [
    members,
    messages,
    docs,
    announcements,
    harnessRuns,
    harnessSessions,
    pendingInteractions,
  ] = await Promise.all([
    listRoomMembers(room.id),
    listRoomMessages(room.id, { afterSequence: 0, limit: 500 }),
    listRoomDocs(room.id),
    listRoomAnnouncements(room.id),
    listRoomHarnessRuns(room.id),
    listRoomHarnessSessions(room.id),
    listRoomPendingInteractions(room.id),
  ]);
  const runtimeEventsByRunId = Object.fromEntries(
    await Promise.all(
      harnessRuns.map(async (run) => [run.id, await listHarnessRunEvents(run.id)] as const),
    ),
  );

  return {
    members,
    messages,
    docs,
    announcements,
    harnessRuns,
    harnessSessions,
    pendingInteractions,
    runtimeEventsByRunId,
  };
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

const mergeRoomDoc = (docs: readonly Doc[], doc: Doc): readonly Doc[] =>
  docs.some((candidate) => candidate.id === doc.id)
    ? docs.map((candidate) => (candidate.id === doc.id ? doc : candidate))
    : [...docs, doc];

const mergeRoomAnnouncement = (
  announcements: readonly Announcement[],
  announcement: Announcement,
): readonly Announcement[] =>
  announcements.some((candidate) => candidate.id === announcement.id)
    ? announcements.map((candidate) =>
        candidate.id === announcement.id ? announcement : candidate,
      )
    : [announcement, ...announcements];

const removeRoomAnnouncement = (
  announcements: readonly Announcement[],
  announcementId: AnnouncementId,
): readonly Announcement[] =>
  announcements.filter((announcement) => announcement.id !== announcementId);

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
  docDetailsByDocId: {},
  harnessRunsByRoomId: {},
  harnessSessionsByRoomId: {},
  pendingInteractionsByRoomId: {},
  runtimeEventsByRunId: {},
  filesByRoomId: {},
  announcementsByRoomId: {},
  pinnedItemsByRoomId: {},
  source: "checking",
  isLoading: true,
  isCreatingRoom: false,
  isSending: false,
  isCreatingDoc: false,
  errorMessage: undefined,
  appliedRoomEventKeys: [],
  initializeRoomWorkspace: async () => {
    set({ source: "checking", isLoading: true, errorMessage: undefined });

    try {
      const rooms = await listRooms();

      if (rooms.length === 0) {
        resetWorkspaceState(set, "api");
        return;
      }

      const activeRoom = rooms[0];
      if (!activeRoom) {
        resetWorkspaceState(set, "api");
        return;
      }

      const {
        members,
        messages,
        docs,
        announcements,
        harnessRuns,
        harnessSessions,
        pendingInteractions,
        runtimeEventsByRunId,
      } = await loadApiRoomData(activeRoom);

      set({
        rooms,
        activeRoomId: activeRoom.id,
        membersByRoomId: { [activeRoom.id]: members },
        messagesByRoomId: { [activeRoom.id]: messages },
        docsByRoomId: { [activeRoom.id]: docs },
        docDetailsByDocId: {},
        harnessRunsByRoomId: { [activeRoom.id]: harnessRuns },
        harnessSessionsByRoomId: { [activeRoom.id]: harnessSessions },
        pendingInteractionsByRoomId: { [activeRoom.id]: pendingInteractions },
        runtimeEventsByRunId,
        filesByRoomId: { [activeRoom.id]: [] },
        announcementsByRoomId: { [activeRoom.id]: announcements },
        pinnedItemsByRoomId: { [activeRoom.id]: [] },
        source: "api",
        isLoading: false,
        errorMessage: undefined,
        appliedRoomEventKeys: [],
      });
    } catch (error) {
      resetWorkspaceState(set, "offline", error);
    }
  },
  createRoomWithDefaults: async (input) => {
    const displayName = input.displayName.trim();
    const topic = input.topic?.trim();

    if (displayName.length === 0) {
      set({ isCreatingRoom: false, errorMessage: "Room name is required" });
      return undefined;
    }

    const state = get();
    if (state.source !== "api") {
      set({
        isCreatingRoom: false,
        errorMessage: "Creating rooms requires a running LinkA daemon",
      });
      return undefined;
    }

    set({ isCreatingRoom: true, errorMessage: undefined });

    try {
      const room = await createRoom({
        displayName,
        ...(topic && topic.length > 0 ? { topic } : {}),
      });

      await addRoomMember(room.id, {
        kind: "human",
        role: "owner",
        displayName: "Alice",
      });
      await addRoomMember(room.id, {
        kind: "agent",
        role: "admin",
        displayName: "LinkA",
      });

      const {
        members,
        messages,
        docs,
        announcements,
        harnessRuns,
        harnessSessions,
        pendingInteractions,
        runtimeEventsByRunId,
      } = await loadApiRoomData(room);

      set((current) => ({
        rooms: current.rooms.some((candidate) => candidate.id === room.id)
          ? current.rooms.map((candidate) => (candidate.id === room.id ? room : candidate))
          : [room, ...current.rooms],
        activeRoomId: room.id,
        membersByRoomId: { ...current.membersByRoomId, [room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
        docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
        harnessSessionsByRoomId: {
          ...current.harnessSessionsByRoomId,
          [room.id]: harnessSessions,
        },
        pendingInteractionsByRoomId: {
          ...current.pendingInteractionsByRoomId,
          [room.id]: pendingInteractions,
        },
        runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
        filesByRoomId: { ...current.filesByRoomId, [room.id]: [] },
        announcementsByRoomId: { ...current.announcementsByRoomId, [room.id]: announcements },
        pinnedItemsByRoomId: { ...current.pinnedItemsByRoomId, [room.id]: [] },
        isCreatingRoom: false,
        errorMessage: undefined,
      }));

      return room;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to create room";
      set({ isCreatingRoom: false, errorMessage });
      return undefined;
    }
  },
  selectRoom: async (roomId) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === roomId);

    if (!room) {
      return undefined;
    }

    set({ activeRoomId: roomId });

    if (state.source !== "api") {
      return;
    }

    try {
      const {
        members,
        messages,
        docs,
        announcements,
        harnessRuns,
        harnessSessions,
        pendingInteractions,
        runtimeEventsByRunId,
      } = await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [roomId]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [roomId]: messages },
        docsByRoomId: { ...current.docsByRoomId, [roomId]: docs },
        announcementsByRoomId: { ...current.announcementsByRoomId, [roomId]: announcements },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [roomId]: harnessRuns },
        harnessSessionsByRoomId: {
          ...current.harnessSessionsByRoomId,
          [roomId]: harnessSessions,
        },
        pendingInteractionsByRoomId: {
          ...current.pendingInteractionsByRoomId,
          [roomId]: pendingInteractions,
        },
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
      const {
        members,
        messages,
        docs,
        announcements,
        harnessRuns,
        harnessSessions,
        pendingInteractions,
        runtimeEventsByRunId,
      } = await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
        docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
        announcementsByRoomId: { ...current.announcementsByRoomId, [room.id]: announcements },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
        harnessSessionsByRoomId: {
          ...current.harnessSessionsByRoomId,
          [room.id]: harnessSessions,
        },
        pendingInteractionsByRoomId: {
          ...current.pendingInteractionsByRoomId,
          [room.id]: pendingInteractions,
        },
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
          harnessSessionsByRoomId: {
            ...current.harnessSessionsByRoomId,
            [room.id]: current.harnessSessionsByRoomId[room.id] ?? [],
          },
          pendingInteractionsByRoomId: {
            ...current.pendingInteractionsByRoomId,
            [room.id]: current.pendingInteractionsByRoomId[room.id] ?? [],
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
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (state.source !== "api") {
      set({
        isSending: false,
        errorMessage: "Sending messages requires a running LinkA daemon",
      });
      return;
    }

    if (!room) {
      set({ isSending: false, errorMessage: "Create or select a Room before sending" });
      return;
    }

    const members = state.membersByRoomId[room.id] ?? [];
    const sender = findHumanSender(members);
    const mentions = parseComposerMentions(trimmed, members);

    if (hasMentionMarker(trimmed) && mentions.length === 0) {
      set({
        isSending: false,
        errorMessage: "未识别 @ 成员，请使用输入框上方的 Agent 按钮或完整成员名。",
      });
      return;
    }

    if (!sender) {
      set({ isSending: false, errorMessage: "No human room member available" });
      return;
    }

    set({ isSending: true, errorMessage: undefined });

    try {
      await sendRoomMessage(room.id, {
        senderMemberId: sender.id,
        kind: "text",
        text: trimmed,
        ...(mentions.length > 0 ? { mentions } : {}),
      });
      const {
        members,
        messages,
        docs,
        announcements,
        harnessRuns,
        harnessSessions,
        pendingInteractions,
        runtimeEventsByRunId,
      } = await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
        docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
        announcementsByRoomId: {
          ...current.announcementsByRoomId,
          [room.id]: announcements,
        },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
        harnessSessionsByRoomId: {
          ...current.harnessSessionsByRoomId,
          [room.id]: harnessSessions,
        },
        pendingInteractionsByRoomId: {
          ...current.pendingInteractionsByRoomId,
          [room.id]: pendingInteractions,
        },
        runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
        isSending: false,
        errorMessage: undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to send room message";
      set({ isSending: false, errorMessage });
    }
  },
  respondToPendingInteraction: async (interactionId, input) => {
    const text = input.text.trim();
    if (text.length === 0) {
      set({ errorMessage: "Pending interaction response cannot be empty" });
      return undefined;
    }

    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);
    if (state.source !== "api" || !room) {
      set({ errorMessage: "Responding to pending interactions requires an API-backed room" });
      return undefined;
    }

    const sender = findHumanSender(state.membersByRoomId[room.id] ?? []);
    if (!sender) {
      set({ errorMessage: "No human room member available" });
      return undefined;
    }

    try {
      const { interaction } = await respondPendingInteraction(interactionId, {
        senderMemberId: sender.id,
        text,
        ...(input.status === undefined ? {} : { status: input.status }),
      });
      const {
        members,
        messages,
        docs,
        announcements,
        harnessRuns,
        harnessSessions,
        pendingInteractions,
        runtimeEventsByRunId,
      } = await loadApiRoomData(room);
      set((current) => ({
        membersByRoomId: { ...current.membersByRoomId, [room.id]: members },
        messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
        docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
        announcementsByRoomId: { ...current.announcementsByRoomId, [room.id]: announcements },
        harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
        harnessSessionsByRoomId: {
          ...current.harnessSessionsByRoomId,
          [room.id]: harnessSessions,
        },
        pendingInteractionsByRoomId: {
          ...current.pendingInteractionsByRoomId,
          [room.id]: pendingInteractions,
        },
        runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
        errorMessage: undefined,
      }));
      return interaction;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to respond to pending interaction";
      set({ errorMessage });
      return undefined;
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
          return doc;
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
          announcements,
          harnessRuns,
          harnessSessions,
          pendingInteractions,
          runtimeEventsByRunId,
        } = await loadApiRoomData(room);
        set((current) => ({
          membersByRoomId: { ...current.membersByRoomId, [room.id]: loadedMembers },
          messagesByRoomId: { ...current.messagesByRoomId, [room.id]: messages },
          docsByRoomId: { ...current.docsByRoomId, [room.id]: docs },
          announcementsByRoomId: { ...current.announcementsByRoomId, [room.id]: announcements },
          harnessRunsByRoomId: { ...current.harnessRunsByRoomId, [room.id]: harnessRuns },
          harnessSessionsByRoomId: {
            ...current.harnessSessionsByRoomId,
            [room.id]: harnessSessions,
          },
          pendingInteractionsByRoomId: {
            ...current.pendingInteractionsByRoomId,
            [room.id]: pendingInteractions,
          },
          runtimeEventsByRunId: { ...current.runtimeEventsByRunId, ...runtimeEventsByRunId },
          isCreatingDoc: false,
          errorMessage: undefined,
        }));
        return doc;
      }

      set((current) => ({
        docsByRoomId: {
          ...current.docsByRoomId,
          [room.id]: mergeRoomDoc(current.docsByRoomId[room.id] ?? [], doc),
        },
        isCreatingDoc: false,
        errorMessage: undefined,
      }));
      return doc;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to create room doc";
      set({ isCreatingDoc: false, errorMessage });
      return undefined;
    }
  },
  loadActiveRoomDocDetail: async (docId) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (state.source !== "api") {
      set({ errorMessage: "Loading doc details requires an API-backed room" });
      return undefined;
    }

    if (!room) {
      set({ errorMessage: "No active room selected" });
      return undefined;
    }

    try {
      const detail = await getDoc(docId);
      set((current) => ({
        docsByRoomId: {
          ...current.docsByRoomId,
          [room.id]: mergeRoomDoc(current.docsByRoomId[room.id] ?? [], detail.doc),
        },
        docDetailsByDocId: {
          ...current.docDetailsByDocId,
          [docId]: { revisions: detail.revisions, comments: detail.comments },
        },
        errorMessage: undefined,
      }));
      return { revisions: detail.revisions, comments: detail.comments };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to load doc detail";
      set({ errorMessage });
      return undefined;
    }
  },
  updateActiveRoomDoc: async (docId, input) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (state.source !== "api") {
      set({ errorMessage: "Editing docs requires an API-backed room" });
      return undefined;
    }

    if (!room) {
      set({ errorMessage: "No active room selected" });
      return undefined;
    }

    const sender = findHumanSender(state.membersByRoomId[room.id] ?? []);

    if (!sender) {
      set({ errorMessage: "No human room member available" });
      return undefined;
    }

    try {
      const result = await updateDoc(docId, {
        ...input,
        updatedByMemberId: sender.id,
      });
      set((current) => {
        const detail = current.docDetailsByDocId[docId];

        return {
          docsByRoomId: {
            ...current.docsByRoomId,
            [room.id]: mergeRoomDoc(current.docsByRoomId[room.id] ?? [], result.doc),
          },
          docDetailsByDocId: {
            ...current.docDetailsByDocId,
            [docId]: {
              revisions: detail ? [...detail.revisions, result.revision] : [result.revision],
              comments: detail?.comments ?? [],
            },
          },
          errorMessage: undefined,
        };
      });
      return result.doc;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to update doc";
      set({ errorMessage });
      return undefined;
    }
  },
  createActiveDocComment: async (docId, input) => {
    const body = input.body.trim();
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (body.length === 0) {
      set({ errorMessage: "Comment body is required" });
      return undefined;
    }

    if (state.source !== "api") {
      set({ errorMessage: "Commenting on docs requires an API-backed room" });
      return undefined;
    }

    if (!room) {
      set({ errorMessage: "No active room selected" });
      return undefined;
    }

    const sender = findHumanSender(state.membersByRoomId[room.id] ?? []);

    if (!sender) {
      set({ errorMessage: "No human room member available" });
      return undefined;
    }

    const doc = (state.docsByRoomId[room.id] ?? []).find((candidate) => candidate.id === docId);

    try {
      const comment = await createDocComment(docId, {
        body,
        createdByMemberId: sender.id,
        ...(doc?.currentRevisionId ? { revisionId: doc.currentRevisionId } : {}),
        visibility: { scope: "room" },
      });
      set((current) => {
        const detail = current.docDetailsByDocId[docId];

        return {
          docDetailsByDocId: {
            ...current.docDetailsByDocId,
            [docId]: {
              revisions: detail?.revisions ?? [],
              comments: [...(detail?.comments ?? []), comment],
            },
          },
          errorMessage: undefined,
        };
      });
      return comment;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to create doc comment";
      set({ errorMessage });
      return undefined;
    }
  },
  createActiveRoomAnnouncement: async (input) => {
    const title = input.title?.trim();
    const body = input.body.trim();
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (body.length === 0) {
      set({ errorMessage: "Announcement body is required" });
      return undefined;
    }

    if (state.source !== "api") {
      set({ errorMessage: "Creating announcements requires a running LinkA daemon" });
      return undefined;
    }

    if (!room) {
      set({ errorMessage: "No active room selected" });
      return undefined;
    }

    const sender = findHumanSender(state.membersByRoomId[room.id] ?? []);

    if (!sender) {
      set({ errorMessage: "No human room member available" });
      return undefined;
    }

    try {
      const announcement = await createRoomAnnouncement(room.id, {
        ...(title && title.length > 0 ? { title } : {}),
        body,
        createdByMemberId: sender.id,
        visibility: { scope: "room" },
      });
      set((current) => ({
        announcementsByRoomId: {
          ...current.announcementsByRoomId,
          [room.id]: mergeRoomAnnouncement(
            current.announcementsByRoomId[room.id] ?? [],
            announcement,
          ),
        },
        errorMessage: undefined,
      }));
      return announcement;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to create announcement";
      set({ errorMessage });
      return undefined;
    }
  },
  updateActiveRoomAnnouncement: async (announcementId, input) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (state.source !== "api") {
      set({ errorMessage: "Editing announcements requires a running LinkA daemon" });
      return undefined;
    }

    if (!room) {
      set({ errorMessage: "No active room selected" });
      return undefined;
    }

    try {
      const announcement = await updateAnnouncement(announcementId, input);
      set((current) => ({
        announcementsByRoomId: {
          ...current.announcementsByRoomId,
          [room.id]: mergeRoomAnnouncement(
            current.announcementsByRoomId[room.id] ?? [],
            announcement,
          ),
        },
        errorMessage: undefined,
      }));
      return announcement;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to update announcement";
      set({ errorMessage });
      return undefined;
    }
  },
  deleteActiveRoomAnnouncement: async (announcementId) => {
    const state = get();
    const room = state.rooms.find((candidate) => candidate.id === state.activeRoomId);

    if (state.source !== "api") {
      set({ errorMessage: "Deleting announcements requires a running LinkA daemon" });
      return false;
    }

    if (!room) {
      set({ errorMessage: "No active room selected" });
      return false;
    }

    try {
      await deleteAnnouncement(announcementId);
      set((current) => ({
        announcementsByRoomId: {
          ...current.announcementsByRoomId,
          [room.id]: removeRoomAnnouncement(
            current.announcementsByRoomId[room.id] ?? [],
            announcementId,
          ),
        },
        errorMessage: undefined,
      }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to delete announcement";
      set({ errorMessage });
      return false;
    }
  },
}));
