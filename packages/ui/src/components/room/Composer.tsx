import { useState } from "react";

export const Composer = () => {
  const [draft, setDraft] = useState("");
  const [localNote, setLocalNote] = useState<string | undefined>();

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
          if (nextDraft.length === 0) {
            return;
          }

          setLocalNote(nextDraft);
          setDraft("");
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
            disabled={draft.trim().length === 0}
          >
            本地暂存
          </button>
        </div>
      </form>
    </section>
  );
};
