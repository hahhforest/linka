import { useState } from "react";

import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;
const emptyAnnouncements = [] as const;
const emptyDocs = [] as const;
const emptyRuns = [] as const;
const emptySessions = [] as const;
const emptyRuntimeEventsByRunId = {} as const;

const memberAccent = (kind: string): string =>
  kind === "agent"
    ? "border-linka/35 bg-[#f0ecff] text-linka"
    : "border-danger/25 bg-[#f9dfd2] text-danger";

const formatShortTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const getBodyFirstLine = (body: string): string | undefined =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

const runStatusLabel = (status: string): string => {
  if (status === "succeeded") return "completed";
  return status;
};

const sessionStatusLabel = (status: string): string => {
  if (status === "idle") return "ready";
  if (status === "created") return "created";
  return status.replace(/_/gu, " ");
};

const getRuntimeLabel = (session: {
  readonly runtime?: { readonly kind: string; readonly label?: string };
}): string =>
  session.runtime?.label ??
  (session.runtime ? session.runtime.kind + " runtime" : "runtime pending");

const statusClass = (status: string): string => {
  if (status === "running" || status === "queued") {
    return "border-signal/30 bg-[#edf7f9] text-signal";
  }

  if (status === "succeeded" || status === "idle" || status === "created") {
    return "border-success/30 bg-[#edf7f1] text-success";
  }

  if (status === "failed" || status === "cancelled") {
    return "border-danger/30 bg-[#fae8e2] text-danger";
  }

  return "border-line bg-[#fbf7ed] text-muted";
};

export const MemberRail = () => {
  const [docTitle, setDocTitle] = useState("");
  const [docBody, setDocBody] = useState("");
  const [handoffToLinkA, setHandoffToLinkA] = useState(true);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const docs = useRoomStore((state) =>
    activeRoomId ? (state.docsByRoomId[activeRoomId] ?? emptyDocs) : emptyDocs,
  );
  const runs = useRoomStore((state) =>
    activeRoomId ? (state.harnessRunsByRoomId[activeRoomId] ?? emptyRuns) : emptyRuns,
  );
  const sessions = useRoomStore((state) =>
    activeRoomId ? (state.harnessSessionsByRoomId[activeRoomId] ?? emptySessions) : emptySessions,
  );
  const runtimeEventsByRunId = useRoomStore(
    (state) => state.runtimeEventsByRunId ?? emptyRuntimeEventsByRunId,
  );
  const announcements = useRoomStore((state) =>
    activeRoomId
      ? (state.announcementsByRoomId[activeRoomId] ?? emptyAnnouncements)
      : emptyAnnouncements,
  );
  const isCreatingDoc = useRoomStore((state) => state.isCreatingDoc);
  const createActiveRoomDoc = useRoomStore((state) => state.createActiveRoomDoc);
  const trimmedDocTitle = docTitle.trim();
  const recentSessions = [...sessions]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 3);
  const recentRuns = [...runs].sort((left, right) => right.createdAt - left.createdAt).slice(0, 3);

  return (
    <aside className="linka-scrollbar min-h-0 overflow-y-auto border-t border-line bg-[#f7f0e3]/90 p-3 lg:border-l lg:border-t-0">
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">成员 ({members.length})</h2>
          <button
            className="h-7 w-7 rounded-full border border-line bg-panel text-sm text-muted shadow-sketch hover:border-linka hover:text-linka"
            type="button"
            aria-label="Add member"
          >
            +
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {members.map((member) => (
            <span
              key={member.id}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold shadow-sketch ${memberAccent(member.kind)}`}
              title={`${member.displayName} · ${member.kind}`}
            >
              {member.displayName.slice(0, 1)}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5 border-t border-line pt-4">
        <h2 className="text-sm font-semibold">活动</h2>
        <div className="mt-3 grid gap-2">
          {recentSessions.map((session) => {
            const target = members.find((member) => member.id === session.agentMemberId);
            const updatedAt = session.updatedAt;

            return (
              <article
                key={session.id}
                className="rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {target?.displayName ?? "Agent"}
                    </h3>
                    <time
                      className="mt-1 block font-mono text-[11px] text-muted"
                      dateTime={new Date(updatedAt).toISOString()}
                    >
                      {formatShortTime(updatedAt)}
                    </time>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] ${statusClass(session.status)}`}
                  >
                    {sessionStatusLabel(session.status)}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-muted">
                  {getRuntimeLabel(session)}
                </p>
              </article>
            );
          })}

          {recentRuns.map((run) => {
            const target = members.find((member) => member.id === run.targetMemberId);
            const events = runtimeEventsByRunId[run.id] ?? [];
            const latestEvent = events.at(-1);
            const latestOutput = [...events]
              .reverse()
              .find(
                (event) =>
                  event.type === "adapter.output" && event.payload.kind === "adapter_output",
              );
            const outputText =
              latestOutput?.payload.kind === "adapter_output"
                ? latestOutput.payload.text
                : undefined;
            const updatedAt = run.completedAt ?? latestEvent?.createdAt ?? run.updatedAt;

            return (
              <article
                key={run.id}
                className="rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {target?.displayName ?? "Agent"}
                    </h3>
                    <time
                      className="mt-1 block font-mono text-[11px] text-muted"
                      dateTime={new Date(updatedAt).toISOString()}
                    >
                      {formatShortTime(updatedAt)}
                    </time>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] ${statusClass(run.status)}`}
                  >
                    {runStatusLabel(run.status)}
                  </span>
                </div>
                {run.error ? (
                  <p className="mt-2 break-words text-xs leading-5 text-danger">{run.error}</p>
                ) : (outputText ?? run.summary) ? (
                  <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-muted">
                    {outputText ?? run.summary}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted">等待 runtime 事件</p>
                )}
              </article>
            );
          })}

          {recentRuns.length === 0 && recentSessions.length === 0 ? (
            <p className="rounded-md border border-line bg-panel/62 p-2.5 text-xs text-muted">
              暂无运行记录
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">关联 Docs</h2>
          <span className="font-mono text-[11px] text-muted">{docs.length}</span>
        </div>
        <form
          className="mt-3 grid gap-2 rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
          onSubmit={(event) => {
            event.preventDefault();
            const nextTitle = docTitle.trim();

            if (nextTitle.length === 0 || isCreatingDoc) {
              return;
            }

            const nextBody = docBody.trim();

            void createActiveRoomDoc({
              title: nextTitle,
              ...(nextBody.length > 0 ? { body: nextBody } : {}),
              notifyLinkA: handoffToLinkA,
            }).then(() => {
              if (useRoomStore.getState().errorMessage === undefined) {
                setDocTitle("");
                setDocBody("");
              }
            });
          }}
        >
          <label className="sr-only" htmlFor="room-doc-title">
            文档标题
          </label>
          <input
            id="room-doc-title"
            className="min-w-0 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
            maxLength={80}
            placeholder="新建 Doc / ToDo"
            type="text"
            value={docTitle}
            disabled={isCreatingDoc}
            onChange={(event) => setDocTitle(event.target.value)}
          />
          <label className="sr-only" htmlFor="room-doc-body">
            文档正文
          </label>
          <textarea
            id="room-doc-body"
            className="min-h-16 resize-none rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm leading-5 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
            maxLength={240}
            placeholder="任务目标、验收标准、资料链接..."
            value={docBody}
            disabled={isCreatingDoc}
            onChange={(event) => setDocBody(event.target.value)}
          />
          <label className="flex items-center gap-2 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-xs text-muted">
            <input
              checked={handoffToLinkA}
              className="h-3.5 w-3.5 accent-[#7760dc]"
              type="checkbox"
              disabled={isCreatingDoc}
              onChange={(event) => setHandoffToLinkA(event.target.checked)}
            />
            创建后 @LinkA
          </label>
          <button
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white shadow-sketch hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
            type="submit"
            disabled={trimmedDocTitle.length === 0 || isCreatingDoc}
          >
            {isCreatingDoc ? "创建中" : handoffToLinkA ? "保存并交给 LinkA" : "新建 Doc"}
          </button>
        </form>

        {docs.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {docs.slice(0, 4).map((doc) => {
              const firstLine = getBodyFirstLine(doc.body);

              return (
                <article
                  key={doc.id}
                  className="rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
                >
                  <h3 className="truncate text-sm font-semibold">{doc.title}</h3>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {doc.format} · {doc.status}
                  </p>
                  {firstLine ? (
                    <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-muted">
                      {firstLine}
                    </p>
                  ) : (
                    <time
                      className="mt-2 block font-mono text-[11px] text-muted"
                      dateTime={new Date(doc.updatedAt).toISOString()}
                    >
                      更新于 {formatShortTime(doc.updatedAt)}
                    </time>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      {announcements.length > 0 ? (
        <section className="mt-5 border-t border-line pt-4">
          <h2 className="text-sm font-semibold">公告板</h2>
          <div className="mt-3 grid gap-2">
            {announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-md border border-line bg-[#fff8df] p-2.5 shadow-sketch"
              >
                <h3 className="text-sm font-semibold">{announcement.title ?? "公告"}</h3>
                <p className="mt-2 break-words text-xs leading-5 text-muted">{announcement.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
};
