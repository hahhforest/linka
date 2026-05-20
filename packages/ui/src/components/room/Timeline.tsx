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
  text: "border-line bg-paper text-ink",
  instruction: "border-[#6f52d9]/30 bg-[#ede8ff] text-[#6f52d9]",
  status: "border-line bg-paper text-muted",
  question: "border-caution/40 bg-[#fff3d8] text-caution",
  decision: "border-linka/40 bg-[#dceee8] text-linka",
  approval_request: "border-caution/40 bg-[#fff3d8] text-caution",
  intervention: "border-danger/30 bg-[#f7e5e1] text-danger",
  evidence: "border-signal/40 bg-[#e8f2f6] text-signal",
  tool_result_summary: "border-line bg-paper text-muted",
  system: "border-line bg-[#ede7db] text-muted",
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

const avatarClass = (kind: string): string =>
  kind === "agent" ? "bg-[#dceee8] text-linka" : "bg-[#d8ecf5] text-signal";

export const Timeline = ({ messages, members }: TimelineProps) => (
  <section className="linka-scrollbar max-h-none overflow-visible px-4 py-4 sm:px-6 lg:max-h-[calc(100vh-322px)] lg:overflow-y-auto">
    <ol className="grid gap-4" aria-label="Room timeline">
      {messages.map((message) => {
        const senderKind = getSenderKind(message, members);
        const senderName = getSenderName(message, members);

        return (
          <li key={message.id} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${avatarClass(senderKind)}`}
            >
              {senderName.slice(0, 1)}
            </span>
            <article className="min-w-0 border-b border-line pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{senderName}</span>
                <span className="font-mono text-xs text-muted">{senderKind}</span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${kindClassName[message.kind]}`}
                >
                  {kindLabel[message.kind]}
                </span>
                <time
                  className="ml-auto font-mono text-xs text-muted"
                  dateTime={new Date(message.createdAt).toISOString()}
                >
                  #{message.sequence} · {formatTime(message.createdAt)}
                </time>
              </div>

              {message.replyTo ? (
                <p className="mt-3 rounded-md border-l-4 border-line bg-paper px-3 py-2 font-mono text-xs text-muted">
                  reply to {message.replyTo.messageId}
                </p>
              ) : null}

              {message.text ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {message.text}
                </p>
              ) : null}

              {message.mentions && message.mentions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.mentions.map((mention) => (
                    <span
                      key={`${message.id}-${mention.memberId}`}
                      className="rounded-md border border-linka/30 bg-[#dceee8] px-2 py-1 text-xs font-semibold text-linka"
                    >
                      {mention.displayText ?? mention.memberId}
                    </span>
                  ))}
                </div>
              ) : null}

              {message.evidence && message.evidence.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {message.evidence.map((evidence) => (
                    <div
                      key={`${message.id}-${evidence.label}`}
                      className="rounded-lg border border-signal/30 bg-[#f1f8fa] p-3"
                    >
                      <p className="text-sm font-semibold text-signal">{evidence.label}</p>
                      {evidence.summary ? (
                        <p className="mt-1 break-words text-sm leading-5 text-muted">
                          {evidence.summary}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {message.attachments && message.attachments.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {message.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="min-w-0 rounded-lg border border-line bg-paper p-3"
                    >
                      <p className="truncate text-sm font-medium">{attachment.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted">
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
