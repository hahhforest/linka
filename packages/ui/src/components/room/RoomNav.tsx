import { useState } from "react";

import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;
const emptyMessages = [] as const;
const emptyDocs = [] as const;
const emptyPinnedItems = [] as const;
const emptyFiles = [] as const;

const formatRoomTime = (updatedAt: number): string =>
  new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(
    new Date(updatedAt),
  );

const statusDot = (source: string): string => (source === "api" ? "bg-success" : "bg-caution");

const sourceLabel = (source: string): string => {
  if (source === "api") return "daemon api";
  if (source === "offline") return "offline";
  if (source === "checking") return "checking";
  return "demo";
};

export const RoomNav = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState("证据核验 Room");
  const [topic, setTopic] = useState("围绕一个目标组织人类、LinkA 和 Agent 的协作现场。");
  const rooms = useRoomStore((state) => state.rooms);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const source = useRoomStore((state) => state.source);
  const errorMessage = useRoomStore((state) => state.errorMessage);
  const isCreatingRoom = useRoomStore((state) => state.isCreatingRoom);
  const selectRoom = useRoomStore((state) => state.selectRoom);
  const createRoomWithDefaults = useRoomStore((state) => state.createRoomWithDefaults);
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const messages = useRoomStore((state) =>
    activeRoomId ? (state.messagesByRoomId[activeRoomId] ?? emptyMessages) : emptyMessages,
  );
  const docs = useRoomStore((state) =>
    activeRoomId ? (state.docsByRoomId[activeRoomId] ?? emptyDocs) : emptyDocs,
  );
  const pinnedItems = useRoomStore((state) =>
    activeRoomId ? (state.pinnedItemsByRoomId[activeRoomId] ?? emptyPinnedItems) : emptyPinnedItems,
  );
  const files = useRoomStore((state) =>
    activeRoomId ? (state.filesByRoomId[activeRoomId] ?? emptyFiles) : emptyFiles,
  );
  const activeAgentCount = members.filter(
    (member) => member.kind === "agent" && member.status === "active",
  ).length;
  const canCreateRoom = source === "api" && displayName.trim().length > 0 && !isCreatingRoom;

  return (
    <aside className="flex min-h-0 flex-col border-b border-line bg-[#f4ecde]/92 p-3 lg:border-b-0 lg:border-r lg:p-4">
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-linka/40 bg-[#f0ecff] text-xl font-semibold text-linka shadow-sketch">
          ✦
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold leading-6 text-ink">LinkA</h2>
          <p className="font-mono text-[11px] text-muted">Agent Team Room</p>
        </div>
      </div>

      <button
        className="mt-4 rounded-md border border-linka/35 bg-linka px-3 py-2 text-sm font-semibold text-white shadow-sketch hover:bg-[#6750ca] disabled:cursor-not-allowed disabled:border-line disabled:bg-muted"
        type="button"
        onClick={() => setIsCreateOpen(true)}
      >
        ＋ 新建 Room
      </button>

      {isCreateOpen ? (
        <section className="mt-3 rounded-md border border-line bg-panel/90 p-3 shadow-sketch">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">新建 Room</h3>
            <button
              className="rounded-md border border-line bg-[#fbf7ed] px-2 py-1 text-xs text-muted hover:border-linka hover:text-linka"
              type="button"
              onClick={() => setIsCreateOpen(false)}
            >
              关闭
            </button>
          </div>
          <form
            className="mt-3 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canCreateRoom) return;
              void createRoomWithDefaults({ displayName, topic }).then((room) => {
                if (room) setIsCreateOpen(false);
              });
            }}
          >
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Room 名称
              <input
                className="rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm font-normal text-ink"
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Topic
              <textarea
                className="min-h-16 resize-none rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm font-normal leading-5 text-ink"
                maxLength={180}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            </label>
            <p className="rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-xs leading-5 text-muted">
              创建后会自动加入 Alice 和 LinkA。更多 Agent 模板在后续阶段接入。
            </p>
            {source !== "api" ? (
              <p className="rounded-md border border-caution/30 bg-[#fff3d8] px-2.5 py-2 text-xs leading-5 text-caution">
                需要先启动 LinkA daemon；不会自动写入 demo Room。
              </p>
            ) : null}
            {errorMessage ? (
              <p className="rounded-md border border-danger/30 bg-[#fae8e2] px-2.5 py-2 text-xs leading-5 text-danger">
                {errorMessage}
              </p>
            ) : null}
            <button
              className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white shadow-sketch hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
              type="submit"
              disabled={!canCreateRoom}
              title={source !== "api" ? "需要运行 LinkA daemon" : undefined}
            >
              {isCreatingRoom ? "创建中" : "创建并进入 Room"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-4 rounded-md border border-line bg-panel/68 p-3 shadow-sketch">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-xs text-muted">
          <div className="rounded-md border border-[#b9abd9] bg-[#f0ecff] px-2 py-1 text-linka">
            Room
          </div>
          <span className="font-mono text-[11px]">引导 / 置顶</span>
          <div className="rounded-md border border-[#bad1d9] bg-[#edf7f9] px-2 py-1 text-signal">
            Doc
          </div>
          <div className="col-span-3 flex items-center justify-center gap-2 font-mono text-[11px] text-muted">
            <span>message</span>
            <span className="h-px w-8 bg-line" />
            <span>projection</span>
          </div>
          <div className="col-span-3 mx-auto rounded-md border border-[#c7d5cb] bg-[#edf7f1] px-3 py-1 text-success">
            Harness
          </div>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">我的 Room</h3>
        <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
          <span className={`h-2 w-2 rounded-full ${statusDot(source)}`} />
          {sourceLabel(source)}
        </span>
      </div>

      <nav
        className="linka-scrollbar mt-2 grid min-h-0 gap-2 overflow-y-auto pr-1"
        aria-label="Room navigation"
      >
        {rooms.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-panel/58 px-3 py-4 text-sm leading-6 text-muted">
            {source === "api" ? "当前 daemon 还没有 Room。" : "连接 daemon 后载入真实 Room。"}
          </div>
        ) : null}
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;

          return (
            <button
              key={room.id}
              className={`rounded-md border px-3 py-2.5 text-left shadow-sketch transition ${
                isActive
                  ? "border-linka/45 bg-[#eee9ff] text-ink"
                  : "border-line bg-panel/72 text-ink hover:border-linka/35 hover:bg-[#fbf7ed]"
              }`}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => void selectRoom(room.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">{room.displayName}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {formatRoomTime(room.updatedAt)}
                </span>
              </div>
              <span className="mt-1 block truncate text-xs leading-5 text-muted">
                {room.topic ?? "点击载入 room"}
              </span>
              {isActive ? (
                <span className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-muted">
                  <span>{activeAgentCount} agents</span>
                  <span>·</span>
                  <span>{messages.length} msg</span>
                  <span>·</span>
                  <span>{docs.length} docs</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 grid gap-3 border-t border-line pt-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-line bg-panel/65 px-2 py-2">
            <p className="font-mono text-[11px] text-linka">Docs</p>
            <p className="mt-1 text-lg font-semibold">{docs.length}</p>
          </div>
          <div className="rounded-md border border-line bg-panel/65 px-2 py-2">
            <p className="font-mono text-[11px] text-signal">Files</p>
            <p className="mt-1 text-lg font-semibold">{files.length}</p>
          </div>
        </div>
        {pinnedItems.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold">置顶</h3>
            <div className="mt-2 grid gap-2">
              {pinnedItems.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-line bg-panel/72 p-2 shadow-sketch"
                >
                  <p className="truncate text-sm font-medium">{item.label ?? "置顶条目"}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">{item.kind}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
};
