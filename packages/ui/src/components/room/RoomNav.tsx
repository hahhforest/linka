import { selectActiveRoomSnapshot, useRoomStore } from "../../store/roomStore.js";

export const RoomNav = () => {
  const rooms = useRoomStore((state) => state.rooms);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const selectRoom = useRoomStore((state) => state.selectRoom);
  const snapshot = useRoomStore(selectActiveRoomSnapshot);
  const activeAgentCount = snapshot.members.filter(
    (member) => member.kind === "agent" && member.status === "active",
  ).length;

  return (
    <aside className="border-b border-line bg-[#f3efe6]/95 p-4 lg:border-b-0 lg:border-r lg:p-5">
      <div className="flex items-start justify-between gap-3 lg:block">
        <div>
          <p className="font-mono text-xs uppercase text-linka">LinkA</p>
          <h2 className="mt-1 text-lg font-semibold">Agent Team Rooms</h2>
        </div>
        <span className="rounded-md border border-line bg-panel px-2.5 py-1 font-mono text-xs text-muted lg:mt-4 lg:inline-flex">
          {snapshot.source === "api" ? "daemon api" : "local demo"}
        </span>
      </div>

      <nav className="mt-5 grid gap-2" aria-label="Room navigation">
        {rooms.map((room) => (
          <button
            key={room.id}
            className={`rounded-lg border bg-panel p-3 text-left shadow-rail ${
              room.id === activeRoomId ? "border-linka" : "border-line"
            }`}
            type="button"
            aria-current={room.id === activeRoomId ? "page" : undefined}
            onClick={() => void selectRoom(room.id)}
          >
            <span className="block truncate text-sm font-semibold">{room.displayName}</span>
            <span className="mt-1 block text-xs leading-5 text-muted">
              {room.id === activeRoomId
                ? `${activeAgentCount} 个 Agent 在场 · ${snapshot.messages.length} 条消息`
                : "点击载入 room"}
            </span>
          </button>
        ))}
      </nav>

      {snapshot.pinnedItems.length > 0 ? (
        <section className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold">置顶现场</h3>
          <div className="mt-3 grid gap-2">
            {snapshot.pinnedItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-line bg-panel p-3">
                <p className="truncate text-sm font-medium">{item.label ?? "置顶条目"}</p>
                <p className="mt-1 font-mono text-xs text-muted">{item.kind}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {snapshot.files.length > 0 ? (
        <section className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold">共享材料</h3>
          <div className="mt-3 grid gap-2">
            {snapshot.files.map((file) => (
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
    </aside>
  );
};
