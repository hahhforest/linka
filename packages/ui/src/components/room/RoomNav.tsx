import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;
const emptyMessages = [] as const;
const emptyPinnedItems = [] as const;
const emptyFiles = [] as const;

const formatRoomTime = (updatedAt: number): string =>
  new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(
    new Date(updatedAt),
  );

export const RoomNav = () => {
  const rooms = useRoomStore((state) => state.rooms);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const source = useRoomStore((state) => state.source);
  const selectRoom = useRoomStore((state) => state.selectRoom);
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const messages = useRoomStore((state) =>
    activeRoomId ? (state.messagesByRoomId[activeRoomId] ?? emptyMessages) : emptyMessages,
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

  return (
    <aside className="flex min-h-0 flex-col border-b border-line bg-[#f6f1e7]/95 p-4 lg:border-b-0 lg:border-r lg:p-5">
      <div className="rounded-lg border border-line bg-panel p-4">
        <p className="font-mono text-xs uppercase text-linka">✦ LinkA</p>
        <h2 className="mt-2 text-xl font-semibold">Agent Team Rooms</h2>
        <p className="mt-2 text-sm leading-5 text-muted">
          Room 是现场，Doc 是现场资料，LinkA Harness 负责让 Agent 进入现场。
        </p>
        <span className="mt-3 inline-flex rounded-md border border-line bg-paper px-2.5 py-1 font-mono text-xs text-muted">
          {source === "api" ? "daemon api" : "local demo"}
        </span>
      </div>

      <button
        className="mt-4 rounded-lg bg-[#6f52d9] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-linka"
        type="button"
      >
        ＋ 新建 Room
      </button>

      <nav
        className="linka-scrollbar mt-4 grid min-h-0 gap-2 overflow-y-auto"
        aria-label="Room navigation"
      >
        {rooms.map((room) => (
          <button
            key={room.id}
            className={`rounded-lg border p-3 text-left ${
              room.id === activeRoomId ? "border-[#6f52d9] bg-[#ede8ff]" : "border-line bg-panel"
            }`}
            type="button"
            aria-current={room.id === activeRoomId ? "page" : undefined}
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
            {room.id === activeRoomId ? (
              <span className="mt-2 block font-mono text-xs text-muted">
                {activeAgentCount} agents · {messages.length} messages
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-5 grid gap-4 border-t border-line pt-4">
        {pinnedItems.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold">置顶</h3>
            <div className="mt-2 grid gap-2">
              {pinnedItems.slice(0, 2).map((item) => (
                <div key={item.id} className="rounded-lg border border-line bg-panel p-3">
                  <p className="truncate text-sm font-medium">{item.label ?? "置顶条目"}</p>
                  <p className="mt-1 font-mono text-xs text-muted">{item.kind}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {files.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold">共享材料</h3>
            <div className="mt-2 grid gap-2">
              {files.slice(0, 2).map((file) => (
                <div key={file.id} className="min-w-0 rounded-lg border border-line bg-panel p-3">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {file.contentType ?? "file"} ·{" "}
                    {file.sizeBytes ? `${Math.round(file.sizeBytes / 1024)} KB` : "size n/a"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
};
