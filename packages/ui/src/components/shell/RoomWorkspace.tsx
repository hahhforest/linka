import { useConnectionStore } from "../../store/connectionStore.js";
import { selectActiveRoomSnapshot, useRoomStore } from "../../store/roomStore.js";
import { Composer } from "../room/Composer.js";
import { MemberRail } from "../room/MemberRail.js";
import { RoomNav } from "../room/RoomNav.js";
import { Timeline } from "../room/Timeline.js";
import { ConnectionBar } from "./ConnectionBar.js";

export const RoomWorkspace = () => {
  const status = useConnectionStore((state) => state.status);
  const connectionErrorMessage = useConnectionStore((state) => state.errorMessage);
  const roomErrorMessage = useRoomStore((state) => state.errorMessage);
  const isLoading = useRoomStore((state) => state.isLoading);
  const snapshot = useRoomStore(selectActiveRoomSnapshot);
  const offlineMessage = roomErrorMessage ?? connectionErrorMessage ?? "正在检查 /linka/health";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <ConnectionBar />
      {status !== "online" || snapshot.source === "fallback" ? (
        <div className="border-b border-line bg-[#fff3d8] px-4 py-2 text-sm text-caution sm:px-5">
          Daemon 未连接：{offlineMessage}。Demo room 仍可浏览。
        </div>
      ) : null}
      <div className="grid min-h-[calc(100vh-45px)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <RoomNav />
        <main className="min-w-0 border-x-0 border-line bg-panel/70 lg:border-x">
          <div className="border-b border-line px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs uppercase text-linka">room workspace</p>
              {isLoading ? <span className="font-mono text-xs text-muted">loading</span> : null}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">
              {snapshot.room.displayName}
            </h1>
            {snapshot.room.topic ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{snapshot.room.topic}</p>
            ) : null}
          </div>
          <Timeline messages={snapshot.messages} members={snapshot.members} />
          <Composer source={snapshot.source} />
        </main>
        <MemberRail />
      </div>
    </div>
  );
};
