import { useState } from "react";

import type { Doc, RoomMember } from "@linka/shared";

import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;
const emptyAnnouncements = [] as const;
const emptyDocs = [] as const;
const emptyFiles = [] as const;
const emptyPins = [] as const;
const emptyRuns = [] as const;
const emptySessions = [] as const;
const emptyRuntimeEventsByRunId = {} as const;

type RailTab = "info" | "members" | "announcements" | "docs" | "activity" | "files";

const tabs: readonly { readonly id: RailTab; readonly label: string }[] = [
  { id: "info", label: "信息" },
  { id: "members", label: "成员" },
  { id: "announcements", label: "公告" },
  { id: "docs", label: "Docs" },
  { id: "activity", label: "活动" },
  { id: "files", label: "文件" },
];

const memberAccent = (kind: string): string =>
  kind === "agent"
    ? "border-linka/35 bg-[#f0ecff] text-linka"
    : "border-danger/25 bg-[#f9dfd2] text-danger";

const formatShortTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const getBodyFirstLine = (body: string): string | undefined =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

const runStatusLabel = (status: string): string => (status === "succeeded" ? "completed" : status);

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

const permissionSummary = (member: RoomMember): string => {
  const permissions = member.permissions;
  const enabled = [
    permissions.canPostMessage ? "发言" : undefined,
    permissions.canMentionMembers ? "提及" : undefined,
    permissions.canUploadFiles ? "上传" : undefined,
    permissions.canManageMembers ? "管理" : undefined,
  ].filter((value): value is string => value !== undefined);

  return enabled.length > 0 ? enabled.join(" / ") : "只读";
};

const renderDocBody = (doc: Doc): readonly string[] =>
  doc.body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 10);

export const MemberRail = () => {
  const [activeTab, setActiveTab] = useState<RailTab>("info");
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [docTitle, setDocTitle] = useState("");
  const [docBody, setDocBody] = useState("");
  const [handoffToLinkA, setHandoffToLinkA] = useState(true);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const room = useRoomStore((state) =>
    state.rooms.find((candidate) => candidate.id === activeRoomId),
  );
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const docs = useRoomStore((state) =>
    activeRoomId ? (state.docsByRoomId[activeRoomId] ?? emptyDocs) : emptyDocs,
  );
  const files = useRoomStore((state) =>
    activeRoomId ? (state.filesByRoomId[activeRoomId] ?? emptyFiles) : emptyFiles,
  );
  const pins = useRoomStore((state) =>
    activeRoomId ? (state.pinnedItemsByRoomId[activeRoomId] ?? emptyPins) : emptyPins,
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
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const selectedDoc = docs.find((doc) => doc.id === selectedDocId) ?? docs[0];
  const recentSessions = [...sessions]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 4);
  const recentRuns = [...runs].sort((left, right) => right.createdAt - left.createdAt).slice(0, 4);

  return (
    <aside className="linka-scrollbar min-h-0 overflow-y-auto border-t border-line bg-[#f7f0e3]/90 p-3 lg:border-l lg:border-t-0">
      <div className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${
              tab.id === activeTab
                ? "border-linka/35 bg-[#f0ecff] text-linka"
                : "border-line bg-panel/72 text-muted hover:border-linka hover:text-linka"
            }`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" ? (
        <section className="mt-4 grid gap-3">
          <div className="rounded-md border border-line bg-panel/72 p-3 shadow-sketch">
            <p className="font-mono text-[11px] uppercase text-linka">Room</p>
            <h2 className="mt-1 text-base font-semibold">{room?.displayName ?? "未选择 Room"}</h2>
            <p className="mt-2 text-xs leading-5 text-muted">{room?.topic ?? "暂无 topic"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">成员</p>
              <p className="mt-1 text-lg font-semibold">{members.length}</p>
            </div>
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">置顶</p>
              <p className="mt-1 text-lg font-semibold">{pins.length}</p>
            </div>
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">Docs</p>
              <p className="mt-1 text-lg font-semibold">{docs.length}</p>
            </div>
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">文件</p>
              <p className="mt-1 text-lg font-semibold">{files.length}</p>
            </div>
          </div>
          {room ? (
            <div className="rounded-md border border-line bg-[#fbf7ed] p-3 text-xs leading-5 text-muted shadow-sketch">
              <p>默认可见性：{room.defaultVisibility.scope}</p>
              <p>通知策略：{room.notificationPolicy.level}</p>
              <p>创建时间：{formatShortTime(room.createdAt)}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "members" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">成员 ({members.length})</h2>
            <button
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted shadow-sketch disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled
              title="邀请成员将在 Phase 30 后接入"
            >
              邀请
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <button
                key={member.id}
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold shadow-sketch ${memberAccent(member.kind)}`}
                title={`${member.displayName} · ${member.kind}`}
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
              >
                {member.displayName.slice(0, 1)}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            {members.map((member) => (
              <button
                key={member.id}
                className="rounded-md border border-line bg-panel/72 p-2.5 text-left shadow-sketch hover:border-linka"
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{member.displayName}</span>
                  <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
                    {member.kind} · {member.role}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted">{permissionSummary(member)}</p>
              </button>
            ))}
          </div>
          {selectedMember ? (
            <section className="rounded-md border border-linka/30 bg-[#f0ecff] p-3 shadow-sketch">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{selectedMember.displayName}</h3>
                <button
                  className="rounded-md border border-linka/25 bg-panel px-2 py-1 text-xs text-linka"
                  type="button"
                  onClick={() => setSelectedMemberId(undefined)}
                >
                  收起
                </button>
              </div>
              <dl className="mt-2 grid gap-1 text-xs leading-5 text-muted">
                <div className="flex justify-between gap-3">
                  <dt>身份</dt>
                  <dd>{selectedMember.kind}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>角色</dt>
                  <dd>{selectedMember.role}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>状态</dt>
                  <dd>{selectedMember.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>权限</dt>
                  <dd className="text-right">{permissionSummary(selectedMember)}</dd>
                </div>
                {selectedMember.lastSeenAt ? (
                  <div className="flex justify-between gap-3">
                    <dt>最后可见</dt>
                    <dd>{formatShortTime(selectedMember.lastSeenAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "announcements" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">公告板</h2>
            <button
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled
              title="公告编辑将在 Phase 30 接入"
            >
              编辑
            </button>
          </div>
          {announcements.length > 0 ? (
            announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-md border border-line bg-[#fff8df] p-2.5 shadow-sketch"
              >
                <h3 className="text-sm font-semibold">{announcement.title ?? "公告"}</h3>
                <p className="mt-2 break-words text-xs leading-5 text-muted">{announcement.body}</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-line bg-panel/62 p-3 text-xs leading-5 text-muted">
              暂无公告。
            </p>
          )}
          <p className="rounded-md border border-caution/30 bg-[#fff3d8] p-2.5 text-xs leading-5 text-caution">
            公告是 Room 的长期信息。编辑和删除会在 Doc/Announcement CRUD 阶段接入。
          </p>
        </section>
      ) : null}

      {activeTab === "docs" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">关联 Docs</h2>
            <span className="font-mono text-[11px] text-muted">{docs.length}</span>
          </div>
          <form
            className="grid gap-2 rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
            onSubmit={(event) => {
              event.preventDefault();
              const nextTitle = docTitle.trim();

              if (nextTitle.length === 0 || isCreatingDoc) return;

              const nextBody = docBody.trim();

              void createActiveRoomDoc({
                title: nextTitle,
                ...(nextBody.length > 0 ? { body: nextBody } : {}),
                notifyLinkA: handoffToLinkA,
              }).then((doc) => {
                if (doc && useRoomStore.getState().errorMessage === undefined) {
                  setDocTitle("");
                  setDocBody("");
                  setSelectedDocId(doc.id);
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
            <div className="grid gap-2">
              {docs.slice(0, 6).map((doc) => {
                const firstLine = getBodyFirstLine(doc.body);

                return (
                  <button
                    key={doc.id}
                    className={`rounded-md border p-2.5 text-left shadow-sketch hover:border-linka ${
                      selectedDoc?.id === doc.id
                        ? "border-linka/35 bg-[#f0ecff]"
                        : "border-line bg-panel/72"
                    }`}
                    type="button"
                    onClick={() => setSelectedDocId(doc.id)}
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
                  </button>
                );
              })}
            </div>
          ) : null}

          {selectedDoc ? (
            <section className="rounded-md border border-linka/30 bg-panel/90 p-3 shadow-sketch">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase text-linka">Doc detail</p>
                  <h3 className="mt-1 truncate text-sm font-semibold">{selectedDoc.title}</h3>
                </div>
                <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
                  {selectedDoc.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs leading-5 text-muted">
                {renderDocBody(selectedDoc).map((line, index) =>
                  /^#{1,3}\s/u.test(line) ? (
                    <h4
                      key={`${selectedDoc.id}-${index}`}
                      className="text-sm font-semibold text-ink"
                    >
                      {line.replace(/^#{1,3}\s/u, "")}
                    </h4>
                  ) : (
                    <p key={`${selectedDoc.id}-${index}`} className="break-words">
                      {line}
                    </p>
                  ),
                )}
              </div>
              <p className="mt-3 rounded-md border border-caution/30 bg-[#fff3d8] p-2 text-xs leading-5 text-caution">
                编辑、评论和版本写入将在 Phase 30 接入；当前视图用于浏览和确认 Doc 内容。
              </p>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="mt-4 grid gap-3">
          <h2 className="text-sm font-semibold">Agent 活动</h2>
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
        </section>
      ) : null}

      {activeTab === "files" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">群文件</h2>
            <button
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled
              title="上传文件将在后续文件阶段接入"
            >
              上传
            </button>
          </div>
          {files.length > 0 ? (
            files.map((file) => (
              <article
                key={file.id}
                className="rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
              >
                <h3 className="truncate text-sm font-semibold">{file.name}</h3>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {file.contentType ?? "file"} ·{" "}
                  {file.sizeBytes ? `${Math.round(file.sizeBytes / 1024)} KB` : "size n/a"}
                </p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-line bg-panel/62 p-3 text-xs leading-5 text-muted">
              暂无文件。
            </p>
          )}
        </section>
      ) : null}
    </aside>
  );
};
