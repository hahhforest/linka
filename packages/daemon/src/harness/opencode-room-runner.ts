import { OpenCodeCliRuntimeAdapter, type RuntimeAdapter } from "@linka/harness";

import type { RoomHarnessRunner } from "../api/rooms.js";
import type { DaemonContainer } from "../container/index.js";
import { startHarnessRun } from "./run-service.js";

export const DEFAULT_OPENCODE_MODEL = "azure/gpt-5.5";
export const DEFAULT_OPENCODE_VARIANT = "xhigh";

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
  adapter = new OpenCodeCliRuntimeAdapter({
    agent: "build",
    model: DEFAULT_OPENCODE_MODEL,
    variant: DEFAULT_OPENCODE_VARIANT,
  }),
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
