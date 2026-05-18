import type { DemoRoomFixture } from "../../fixtures/demoRoom.js";
import { useConnectionStore } from "../../store/connectionStore.js";
import { Composer } from "../room/Composer.js";
import { MemberRail } from "../room/MemberRail.js";
import { RoomNav } from "../room/RoomNav.js";
import { Timeline } from "../room/Timeline.js";
import { ConnectionBar } from "./ConnectionBar.js";

interface RoomWorkspaceProps {
  readonly demoRoom: DemoRoomFixture;
}

export const RoomWorkspace = ({ demoRoom }: RoomWorkspaceProps) => {
  const status = useConnectionStore((state) => state.status);
  const errorMessage = useConnectionStore((state) => state.errorMessage);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <ConnectionBar />
      {status !== "online" ? (
        <div className="border-b border-line bg-[#fff3d8] px-4 py-2 text-sm text-caution sm:px-5">
          Daemon 未连接：{errorMessage ?? "正在检查 /linka/health"}。Demo room 仍可浏览。
        </div>
      ) : null}
      <div className="grid min-h-[calc(100vh-45px)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <RoomNav demoRoom={demoRoom} />
        <main className="min-w-0 border-x-0 border-line bg-panel/70 lg:border-x">
          <div className="border-b border-line px-4 py-4 sm:px-6">
            <p className="font-mono text-xs uppercase text-linka">room workspace</p>
            <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">
              {demoRoom.room.displayName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{demoRoom.room.topic}</p>
          </div>
          <Timeline messages={demoRoom.messages} members={demoRoom.members} />
          <Composer />
        </main>
        <MemberRail demoRoom={demoRoom} />
      </div>
    </div>
  );
};
