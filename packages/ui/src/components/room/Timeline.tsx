import type { RoomMember, RoomMessage, RoomMessageKind } from "@linka/shared";

interface TimelineProps {
  readonly messages: readonly RoomMessage[];
  readonly members: readonly RoomMember[];
}

const kindLabel: Record<RoomMessageKind, string> = {
  text: "发言",
  instruction: "指令",
  status: "状态",
  question: "提问",
  decision: "判断",
  approval_request: "审批",
  intervention: "干预",
  evidence: "证据",
  tool_result_summary: "工具摘要",
  system: "系统",
};

const kindClassName: Record<RoomMessageKind, string> = {
  text: "border-line bg-[#fbf7ed] text-ink",
  instruction: "border-linka/30 bg-[#f0ecff] text-linka",
  status: "border-line bg-[#fbf7ed] text-muted",
  question: "border-caution/35 bg-[#fff3d8] text-caution",
  decision: "border-success/35 bg-[#edf7f1] text-success",
  approval_request: "border-caution/35 bg-[#fff3d8] text-caution",
  intervention: "border-danger/30 bg-[#fae8e2] text-danger",
  evidence: "border-signal/35 bg-[#edf7f9] text-signal",
  tool_result_summary: "border-line bg-[#fbf7ed] text-muted",
  system: "border-line bg-[#f0e8dc] text-muted",
};

const formatTime = (createdAt: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));

const getSender = (
  message: RoomMessage,
  members: readonly RoomMember[],
): RoomMember | undefined => {
  const { sender } = message;
  if (sender.kind === "system") return undefined;
  return members.find((member) => member.id === sender.memberId);
};

const getSenderName = (message: RoomMessage, members: readonly RoomMember[]): string => {
  if (message.sender.kind === "system") return message.sender.label ?? "System";
  return getSender(message, members)?.displayName ?? "未知成员";
};

const getSenderKind = (message: RoomMessage, members: readonly RoomMember[]): string => {
  if (message.sender.kind === "system") return "system";
  return getSender(message, members)?.kind ?? "member";
};

const avatarClass = (kind: string): string => {
  if (kind === "agent") return "border-linka/35 bg-[#f0ecff] text-linka";
  if (kind === "system") return "border-line bg-[#f0e8dc] text-muted";
  return "border-danger/25 bg-[#f9dfd2] text-danger";
};

const senderKindLabel = (kind: string): string => {
  if (kind === "agent") return "Agent";
  if (kind === "human") return "Human";
  if (kind === "system") return "System";
  return kind;
};

export const Timeline = ({ messages, members }: TimelineProps) => (
  <section className="linka-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
    <ol className="grid gap-3" aria-label="Room timeline">
      {messages.map((message) => {
        const senderKind = getSenderKind(message, members);
        const senderName = getSenderName(message, members);

        return (
          <li key={message.id} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
            <span
              className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold shadow-sketch ${avatarClass(senderKind)}`}
              title={`${senderName} · ${senderKindLabel(senderKind)}`}
            >
              {senderName.slice(0, 1)}
            </span>
            <article className="min-w-0 border-b border-line/80 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{senderName}</span>
                <span className="font-mono text-[11px] text-muted">
                  {senderKindLabel(senderKind)}
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${kindClassName[message.kind]}`}
                >
                  {kindLabel[message.kind]}
                </span>
                <time
                  className="ml-auto font-mono text-[11px] text-muted"
                  dateTime={new Date(message.createdAt).toISOString()}
                >
                  #{message.sequence} · {formatTime(message.createdAt)}
                </time>
              </div>

              {message.replyTo ? (
                <p className="mt-2 rounded-md border-l-4 border-line bg-[#fbf7ed] px-3 py-1.5 font-mono text-[11px] text-muted">
                  reply to {message.replyTo.messageId}
                </p>
              ) : null}

              {message.text ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-ink">
                  {message.text}
                </p>
              ) : null}

              {message.mentions && message.mentions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.mentions.map((mention) => (
                    <span
                      key={`${message.id}-${mention.memberId}`}
                      className="rounded-md border border-linka/25 bg-[#f0ecff] px-2 py-0.5 text-[11px] font-semibold text-linka"
                    >
                      {mention.displayText ?? mention.memberId}
                    </span>
                  ))}
                </div>
              ) : null}

              {message.evidence && message.evidence.length > 0 ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {message.evidence.map((evidence) => (
                    <div
                      key={`${message.id}-${evidence.label}`}
                      className="rounded-md border border-signal/25 bg-[#f4fbfb] p-2 shadow-sketch"
                    >
                      <p className="text-xs font-semibold text-signal">{evidence.label}</p>
                      {evidence.summary ? (
                        <p className="mt-1 break-words text-xs leading-5 text-muted">
                          {evidence.summary}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {message.attachments && message.attachments.length > 0 ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {message.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="min-w-0 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 shadow-sketch"
                    >
                      <p className="truncate text-xs font-semibold">{attachment.name}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        {attachment.kind} · {attachment.contentType ?? "link"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  </section>
);
