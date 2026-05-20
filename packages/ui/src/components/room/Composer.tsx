import { useMemo, useState } from "react";

import type { RoomDataSource } from "../../store/roomStore.js";
import { useRoomStore } from "../../store/roomStore.js";

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
  const [localNote, setLocalNote] = useState<string | undefined>();
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? []) : [],
  );
  const errorMessage = useRoomStore((state) => state.errorMessage);
  const isSending = useRoomStore((state) => state.isSending);
  const sendComposerMessage = useRoomStore((state) => state.sendComposerMessage);
  const agentMembers = useMemo(
    () => members.filter((member) => member.kind === "agent" && member.status === "active"),
    [members],
  );
  const submitLabel = source === "api" ? "发送" : "本地暂存";

  return (
    <section className="border-t border-line bg-[#fffdf8] px-4 py-4 sm:px-6">
      {localNote ? (
        <p className="mb-3 rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
          本地草稿：{localNote}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mb-3 rounded-md border border-[#a34032]/30 bg-[#f3ddd9] px-3 py-2 text-sm text-caution">
          {errorMessage}
        </p>
      ) : null}
      {agentMembers.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted">mention</span>
          {agentMembers.map((member) => (
            <button
              key={member.id}
              className="rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:border-linka hover:text-linka"
              type="button"
              onClick={() => setDraft((current) => appendMentionText(current, member.displayName))}
            >
              @{member.displayName}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const nextDraft = draft.trim();
          if (nextDraft.length === 0 || isSending) {
            return;
          }

          if (source !== "api") {
            setLocalNote(nextDraft);
          } else {
            setLocalNote(undefined);
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
          className="min-h-20 flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-6 text-ink placeholder:text-muted"
          maxLength={360}
          placeholder="补充判断、纠偏意见或给 Agent 的下一步要求..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-32 sm:flex-col sm:items-stretch">
          <span className="font-mono text-xs text-muted">{draft.length}/360</span>
          <button
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
            type="submit"
            disabled={draft.trim().length === 0 || isSending}
          >
            {isSending ? "发送中" : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
};
