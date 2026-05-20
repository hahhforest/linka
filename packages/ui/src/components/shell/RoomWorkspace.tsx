import type { Doc, HarnessRun, RoomMember, RuntimeEvent } from "@linka/shared";

import { useConnectionStore } from "../../store/connectionStore.js";
import { useRoomStore } from "../../store/roomStore.js";
import { demoRoom } from "../../fixtures/demoRoom.js";
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

const formatVersionTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const getDocFirstLine = (doc: Doc): string =>
  doc.body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "空白文档";

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

  return (
    <section className="grid min-h-[260px] border-t border-line bg-[#fffdf8] lg:grid-cols-[minmax(0,1.35fr)_320px_220px]">
      <div className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <p className="font-mono text-xs uppercase text-linka">Doc</p>
          <h2 className="text-base font-semibold">{activeDoc?.title ?? "任务 Doc"}</h2>
          <span className="rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-xs text-muted">
            编辑
          </span>
          <span className="rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-xs text-muted">
            评论
          </span>
          <span className="rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-xs text-muted">
            历史版本
          </span>
        </div>
        {activeDoc ? (
          <article className="mt-4 max-w-3xl text-sm leading-7 text-ink">
            <h3 className="text-base font-semibold">1. 任务目标</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-muted">
              {getDocFirstLine(activeDoc)}
            </p>
            <h3 className="mt-5 text-base font-semibold">2. LinkA 上下文</h3>
            <p className="mt-2 text-muted">
              该 Doc 会作为 Room 同级上下文进入 Harness projection。
            </p>
          </article>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-paper/70 p-4 text-sm text-muted">
            右侧新建 Doc/ToDo 后，会在这里形成可交给 LinkA 的任务上下文。
          </div>
        )}
      </div>

      <aside className="border-t border-line p-4 lg:border-l lg:border-t-0">
        <h3 className="text-sm font-semibold">评论</h3>
        <div className="mt-3 grid gap-2">
          <div className="rounded-lg border border-line bg-panel p-3 text-sm text-muted">
            {runTarget ?? "LinkA"}: {getRunSummary(latestRun, runtimeEventsByRunId)}
          </div>
          <div className="rounded-lg border border-line bg-panel p-3 text-sm text-muted">
            Alice: 需要时可继续在 Room 中插话纠偏。
          </div>
        </div>
      </aside>

      <aside className="border-t border-line p-4 lg:border-l lg:border-t-0">
        <h3 className="text-sm font-semibold">版本历史</h3>
        <div className="mt-3 grid gap-2">
          {docs.slice(0, 4).map((doc, index) => (
            <div key={doc.id} className="rounded-lg border border-line bg-panel p-3">
              <p className="font-mono text-xs text-linka">v{docs.length - index}</p>
              <p className="mt-1 truncate text-sm font-medium">{doc.title}</p>
              <p className="mt-1 font-mono text-xs text-muted">
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
  const room = useRoomStore(
    (state) =>
      state.rooms.find((candidate) => candidate.id === state.activeRoomId) ?? demoRoom.room,
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

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1480px] border-x border-line bg-[#fbf8f0] shadow-rail lg:grid-cols-[300px_minmax(0,1fr)]">
        <RoomNav />
        <div className="flex min-w-0 flex-col">
          <ConnectionBar />
          {status !== "online" || source === "fallback" ? (
            <div className="border-b border-line bg-[#fff3d8] px-4 py-2 text-sm text-caution sm:px-5">
              Daemon 未连接：{offlineMessage}。Demo room 仍可浏览。
            </div>
          ) : null}
          <div className="grid min-h-[calc(100vh-350px)] min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <main className="flex min-w-0 flex-col border-line bg-panel/70 lg:border-r">
              <div className="border-b border-line px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs uppercase text-linka">room workspace</p>
                  {isLoading ? <span className="font-mono text-xs text-muted">loading</span> : null}
                  <span className="text-lg text-[#d6a84f]">★</span>
                </div>
                <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold leading-tight sm:text-2xl">
                      {room.displayName}
                    </h1>
                    {room.topic ? (
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{room.topic}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 font-mono text-xs text-muted">
                    <span className="rounded-md border border-line bg-paper px-2 py-1">聊天</span>
                    <span className="rounded-md border border-line bg-paper px-2 py-1">
                      Docs {docs.length}
                    </span>
                    <span className="rounded-md border border-line bg-paper px-2 py-1">文件</span>
                    <span className="rounded-md border border-line bg-paper px-2 py-1">设置</span>
                  </div>
                </div>
              </div>
              <Timeline messages={messages} members={members} />
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
  );
};
