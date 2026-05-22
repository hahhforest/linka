import type { Doc, HarnessRun, RoomMember, RuntimeEvent } from "@linka/shared";

import { useConnectionStore } from "../../store/connectionStore.js";
import { useRoomStore } from "../../store/roomStore.js";
import { Composer } from "../room/Composer.js";
import { MemberRail } from "../room/MemberRail.js";
import { RoomNav } from "../room/RoomNav.js";
import { Timeline } from "../room/Timeline.js";
import { ConnectionBar } from "./ConnectionBar.js";

const emptyMembers = [] as const;
const emptyMessages = [] as const;
const emptyDocs = [] as const;
const emptyRuns = [] as const;
const emptyRuntimeEventsByRunId = {} as const;

const EmptyRoomState = ({ source }: { readonly source: string }) => {
  const isOffline = source === "offline";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center border-b border-line px-4 py-8">
      <section className="max-w-md rounded-md border border-line bg-panel/80 p-4 text-center shadow-sketch">
        <p className="font-mono text-[11px] uppercase text-linka">
          {isOffline ? "daemon offline" : "empty room list"}
        </p>
        <h2 className="mt-2 text-lg font-semibold">
          {isOffline ? "等待 LinkA daemon" : "当前 daemon 没有 Room"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {isOffline
            ? "连接恢复后会重新载入真实 Room；不会自动注入 demo 数据。"
            : "从左侧创建一个真实 Room 后，成员、消息、Docs 和 Activity 会从 daemon 载入。"}
        </p>
      </section>
    </div>
  );
};

const formatVersionTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const getDocPreviewLines = (doc: Doc): readonly string[] =>
  doc.body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);

const getRunSummary = (
  run: HarnessRun | undefined,
  runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>,
): string => {
  if (!run) return "等待 LinkA 运行";
  if (run.error) return run.error;

  const events = runtimeEventsByRunId[run.id] ?? [];
  const output = [...events]
    .reverse()
    .find((event) => event.type === "adapter.output" && event.payload.kind === "adapter_output");

  if (output?.payload.kind === "adapter_output" && output.payload.text) {
    return output.payload.text;
  }

  return run.summary ?? "运行中，等待 runtime 输出";
};

const DocWorkspace = ({
  docs,
  runs,
  members,
  runtimeEventsByRunId,
}: {
  readonly docs: readonly Doc[];
  readonly runs: readonly HarnessRun[];
  readonly members: readonly RoomMember[];
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
}) => {
  const activeDoc = docs[0];
  const latestRun = [...runs].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const runTarget = latestRun
    ? members.find((member) => member.id === latestRun.targetMemberId)?.displayName
    : undefined;
  const previewLines = activeDoc ? getDocPreviewLines(activeDoc) : [];

  return (
    <section className="grid min-h-[280px] border-t border-line bg-panel/88 lg:grid-cols-[minmax(0,1.35fr)_300px_220px]">
      <div className="min-w-0 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
          <p className="font-mono text-[11px] uppercase text-linka">Doc</p>
          <h2 className="min-w-0 truncate text-base font-semibold">
            {activeDoc?.title ?? "任务 Doc"}
          </h2>
          <span className="rounded-md border border-linka/25 bg-[#f0ecff] px-2 py-0.5 font-mono text-[11px] text-linka">
            编辑
          </span>
          <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
            评论
          </span>
          <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
            历史版本
          </span>
        </div>

        {activeDoc ? (
          <article className="mt-3 max-w-3xl text-sm leading-6 text-ink">
            {previewLines.map((line, index) => {
              if (/^#{1,3}\s/u.test(line) || /^\d+\.\s/u.test(line)) {
                return (
                  <h3 key={`${activeDoc.id}-${index}`} className="mt-3 text-sm font-semibold">
                    {line.replace(/^#{1,3}\s/u, "")}
                  </h3>
                );
              }

              return (
                <p key={`${activeDoc.id}-${index}`} className="mt-2 break-words text-sm text-muted">
                  {line}
                </p>
              );
            })}
          </article>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-line bg-[#fbf7ed] p-4 text-sm text-muted">
            新建 Doc 后，这里会显示 Room 同级上下文。
          </div>
        )}
      </div>

      <aside className="border-t border-line p-3 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
          <h3 className="text-sm font-semibold">评论</h3>
          <span className="font-mono text-[11px] text-muted">thread</span>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="rounded-md border border-line bg-[#fbf7ed] p-2.5 text-xs leading-5 text-muted shadow-sketch">
            <span className="font-semibold text-ink">{runTarget ?? "LinkA"}：</span>
            {getRunSummary(latestRun, runtimeEventsByRunId)}
          </div>
          <div className="rounded-md border border-line bg-[#fbf7ed] p-2.5 text-xs leading-5 text-muted shadow-sketch">
            <span className="font-semibold text-ink">Alice：</span>
            需要时继续在 Room 中插话纠偏。
          </div>
        </div>
      </aside>

      <aside className="border-t border-line p-3 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
          <h3 className="text-sm font-semibold">版本历史</h3>
          <span className="font-mono text-[11px] text-muted">v{docs.length || 0}</span>
        </div>
        <div className="mt-3 grid gap-2">
          {docs.slice(0, 4).map((doc, index) => (
            <div
              key={doc.id}
              className="rounded-md border border-line bg-[#fbf7ed] p-2.5 shadow-sketch"
            >
              <p className="font-mono text-[11px] text-linka">v{docs.length - index}</p>
              <p className="mt-1 truncate text-sm font-medium">{doc.title}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {formatVersionTime(doc.updatedAt)}
              </p>
            </div>
          ))}
          {docs.length === 0 ? <p className="text-sm text-muted">暂无版本</p> : null}
        </div>
      </aside>
    </section>
  );
};

export const RoomWorkspace = () => {
  const status = useConnectionStore((state) => state.status);
  const connectionErrorMessage = useConnectionStore((state) => state.errorMessage);
  const roomErrorMessage = useRoomStore((state) => state.errorMessage);
  const isLoading = useRoomStore((state) => state.isLoading);
  const source = useRoomStore((state) => state.source);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const room = useRoomStore((state) =>
    state.rooms.find((candidate) => candidate.id === state.activeRoomId),
  );
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const messages = useRoomStore((state) =>
    activeRoomId ? (state.messagesByRoomId[activeRoomId] ?? emptyMessages) : emptyMessages,
  );
  const docs = useRoomStore((state) =>
    activeRoomId ? (state.docsByRoomId[activeRoomId] ?? emptyDocs) : emptyDocs,
  );
  const runs = useRoomStore((state) =>
    activeRoomId ? (state.harnessRunsByRoomId[activeRoomId] ?? emptyRuns) : emptyRuns,
  );
  const runtimeEventsByRunId = useRoomStore(
    (state) => state.runtimeEventsByRunId ?? emptyRuntimeEventsByRunId,
  );
  const offlineMessage = roomErrorMessage ?? connectionErrorMessage ?? "正在检查 /linka/health";
  const hasActiveRoom = room !== undefined;
  const showConnectionNotice = status !== "online" || source === "offline" || source === "demo";

  return (
    <div className="min-h-screen bg-paper px-2 py-2 text-ink sm:px-4 sm:py-4">
      <div className="mx-auto grid min-h-[calc(100vh-16px)] max-w-[1540px] overflow-hidden rounded-md border border-line bg-[#fbf6eb]/94 shadow-rail lg:min-h-[calc(100vh-32px)] lg:grid-cols-[268px_minmax(0,1fr)]">
        <RoomNav />
        <div className="flex min-w-0 flex-col lg:min-h-0">
          <ConnectionBar />
          {showConnectionNotice ? (
            <div className="border-b border-line bg-[#fff3d8] px-4 py-2 text-sm text-caution">
              Daemon 未连接：{offlineMessage}。不会自动载入 demo Room。
            </div>
          ) : null}
          <div className="grid min-h-0 flex-1 lg:grid-rows-[minmax(0,1fr)_minmax(270px,34vh)]">
            <div className="grid min-h-[620px] min-w-0 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <main className="paper-panel flex min-w-0 flex-col border-line lg:border-r">
                <div className="border-b border-line px-3 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[11px] uppercase text-linka">room workspace</p>
                    {isLoading ? (
                      <span className="font-mono text-[11px] text-muted">loading</span>
                    ) : null}
                    <span className="text-sm text-[#d6a84f]">★</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="truncate text-xl font-semibold leading-tight sm:text-2xl">
                        {room?.displayName ?? "创建或选择 Room"}
                      </h1>
                      {room?.topic ? (
                        <p className="mt-1 max-w-3xl text-sm leading-5 text-muted">{room.topic}</p>
                      ) : (
                        <p className="mt-1 max-w-3xl text-sm leading-5 text-muted">
                          这里不会自动 seed demo 数据；请选择真实 Room 或新建 Room。
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                      <span className="rounded-md border border-linka/25 bg-[#f0ecff] px-2 py-1 font-semibold text-linka">
                        聊天
                      </span>
                      <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-1">
                        Docs {docs.length}
                      </span>
                      <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-1">
                        文件
                      </span>
                      <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-1">
                        公告
                      </span>
                      <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-1">
                        设置
                      </span>
                    </div>
                  </div>
                </div>
                {hasActiveRoom ? (
                  <Timeline messages={messages} members={members} />
                ) : (
                  <EmptyRoomState source={source} />
                )}
                <Composer source={source} />
              </main>
              <MemberRail />
            </div>
            <DocWorkspace
              docs={docs}
              runs={runs}
              members={members}
              runtimeEventsByRunId={runtimeEventsByRunId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
