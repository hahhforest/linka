import type { Room, RoomMember, RoomMessage } from "@linka/shared";

export interface FakeHarnessReplyInput {
  readonly room: Room;
  readonly members: readonly RoomMember[];
  readonly messages: readonly RoomMessage[];
  readonly targetMember: RoomMember;
}

export interface FakeHarnessReply {
  readonly text: string;
}

const getSenderName = (message: RoomMessage, members: readonly RoomMember[]): string => {
  const { sender } = message;

  switch (sender.kind) {
    case "system":
      return sender.label ?? "System";
    case "member":
      return members.find((member) => member.id === sender.memberId)?.displayName ?? "某位成员";
  }
};

const getRecentUserFacingMessage = (messages: readonly RoomMessage[]): RoomMessage | undefined =>
  [...messages]
    .reverse()
    .find(
      (message) =>
        message.sender.kind === "member" &&
        ["text", "instruction", "intervention", "question"].includes(message.kind) &&
        typeof message.text === "string" &&
        message.text.trim().length > 0,
    );

const compactText = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

export const createFakeHarnessReply = ({
  room,
  members,
  messages,
  targetMember,
}: FakeHarnessReplyInput): FakeHarnessReply => {
  const recent = getRecentUserFacingMessage(messages);
  const source = recent ? getSenderName(recent, members) : "room";
  const summary = recent?.text ? compactText(recent.text) : "我已收到新的 room 上下文。";

  return {
    text: `${targetMember.displayName} 已读取「${room.displayName}」的 room 现场。针对 ${source} 的消息：${summary}`,
  };
};

export * from "./runtime-adapter.js";
export * from "./opencode-command.js";
