import { useState } from "react";

import type { RoomDataSource } from "../../store/roomStore.js";
import { useRoomStore } from "../../store/roomStore.js";

interface ComposerProps {
  readonly source: RoomDataSource;
}

export const Composer = ({ source }: ComposerProps) => {
  const [draft, setDraft] = useState("");
  const [localNote, setLocalNote] = useState<string | undefined>();
  const isSending = useRoomStore((state) => state.isSending);
  const sendComposerMessage = useRoomStore((state) => state.sendComposerMessage);
  const submitLabel = source === "api" ? "发送" : "本地暂存";

  return (
    <section className="border-t border-line bg-[#fffdf8] px-4 py-4 sm:px-6">
      {localNote ? (
        <p className="mb-3 rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
          本地草稿：{localNote}
        </p>
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
