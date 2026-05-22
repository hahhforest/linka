import { useMemo, useState } from "react";

import type { RoomDataSource } from "../../store/roomStore.js";
import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;

interface ComposerProps {
  readonly source: RoomDataSource;
}

const appendMentionText = (draft: string, displayName: string): string => {
  const trimmedEnd = draft.replace(/\s+$/u, "");
  const prefix = trimmedEnd.length === 0 ? "" : `${trimmedEnd} `;
  return `${prefix}@${displayName} `;
};

export const Composer = ({ source }: ComposerProps) => {
  const [draft, setDraft] = useState("");
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const errorMessage = useRoomStore((state) => state.errorMessage);
  const isSending = useRoomStore((state) => state.isSending);
  const sendComposerMessage = useRoomStore((state) => state.sendComposerMessage);
  const agentMembers = useMemo(
    () => members.filter((member) => member.kind === "agent" && member.status === "active"),
    [members],
  );
  const canSend = source === "api" && activeRoomId !== undefined;
  const submitLabel = canSend ? "发送" : "选择 Room";

  return (
    <section className="border-t border-line bg-panel/95 px-3 py-3 sm:px-5">
      {errorMessage ? (
        <p className="mb-2 rounded-md border border-danger/30 bg-[#fae8e2] px-3 py-2 text-xs text-danger">
          {errorMessage}
        </p>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted">发送给</span>
        {agentMembers.map((member) => (
          <button
            key={member.id}
            className="rounded-md border border-line bg-[#fbf7ed] px-2 py-1 text-xs font-semibold text-ink hover:border-linka hover:bg-[#f0ecff] hover:text-linka"
            type="button"
            onClick={() => setDraft((current) => appendMentionText(current, member.displayName))}
          >
            @{member.displayName}
          </button>
        ))}
        {agentMembers.length === 0 ? (
          <span className="text-xs text-muted">暂无可提及 Agent</span>
        ) : null}
      </div>

      <form
        className="grid gap-2 rounded-md border border-line bg-[#fffaf0] p-2 shadow-sketch sm:grid-cols-[minmax(0,1fr)_92px]"
        onSubmit={(event) => {
          event.preventDefault();
          const nextDraft = draft.trim();
          if (!canSend || nextDraft.length === 0 || isSending) {
            return;
          }

          setDraft("");
          void sendComposerMessage(nextDraft);
        }}
      >
        <label className="sr-only" htmlFor="room-composer">
          Room composer
        </label>
        <textarea
          id="room-composer"
          className="min-h-16 resize-none rounded-md border border-transparent bg-transparent px-2 py-2 text-sm leading-6 text-ink placeholder:text-muted focus:border-line focus:bg-panel"
          maxLength={360}
          placeholder="发送到当前 Room..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-stretch">
          <span className="px-1 text-right font-mono text-[11px] text-muted">
            {draft.length}/360
          </span>
          <button
            className="rounded-md bg-linka px-3 py-2 text-sm font-semibold text-white shadow-sketch hover:bg-[#6750ca] disabled:cursor-not-allowed disabled:bg-muted"
            type="submit"
            disabled={!canSend || draft.trim().length === 0 || isSending}
            title={!canSend ? "需要先创建或选择真实 Room" : undefined}
          >
            {isSending ? "发送中" : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
};
