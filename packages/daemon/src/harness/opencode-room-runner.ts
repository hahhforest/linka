import { OpenCodeCliRuntimeAdapter, type RuntimeAdapter } from "@linka/harness";

import type { RoomHarnessRunner } from "../api/rooms.js";
import type { DaemonContainer } from "../container/index.js";
import { startHarnessRun } from "./run-service.js";

export interface CreateOpenCodeRoomHarnessRunnerOptions {
  readonly container: Pick<
    DaemonContainer,
    "roomStore" | "messageStore" | "docStore" | "harnessRunStore"
  >;
  readonly adapter?: RuntimeAdapter;
  readonly now?: () => Date | number;
}

export const createOpenCodeRoomHarnessRunner = ({
  container,
  adapter = new OpenCodeCliRuntimeAdapter({ agent: "build" }),
  now,
}: CreateOpenCodeRoomHarnessRunnerOptions): RoomHarnessRunner =>
  async (input) => {
    await startHarnessRun({
      container,
      adapter,
      roomId: input.room.id,
      targetMemberId: input.targetMember.id,
      triggerMessageId: input.message.id,
      now,
    });
  };
