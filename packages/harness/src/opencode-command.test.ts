import assert from "node:assert/strict";

import { probeOpenCodeCommand, type OpenCodeCommandRunner } from "./index.js";

const successfulRunner: OpenCodeCommandRunner = async (command, args) => {
  assert.equal(command, "opencode");
  assert.deepEqual(args, ["--version"]);

  return { stdout: "opencode 1.2.3\nextra output\n" };
};

assert.deepEqual(await probeOpenCodeCommand({ runner: successfulRunner }), {
  available: true,
  command: "opencode",
  version: "opencode 1.2.3",
});

assert.deepEqual(
  await probeOpenCodeCommand({
    runner: async () => ({ stdout: "   \n" }),
  }),
  {
    available: false,
    command: "opencode",
    errorMessage: "OpenCode command returned empty stdout.",
  },
);

assert.deepEqual(
  await probeOpenCodeCommand({
    runner: async () => {
      throw new Error("spawn opencode ENOENT");
    },
  }),
  {
    available: false,
    command: "opencode",
    errorMessage: "spawn opencode ENOENT",
  },
);

assert.deepEqual(
  await probeOpenCodeCommand({
    command: "custom-opencode",
    runner: async (command, args) => {
      assert.equal(command, "custom-opencode");
      assert.deepEqual(args, ["--version"]);

      return { stdout: "custom 0.0.1\n" };
    },
  }),
  {
    available: true,
    command: "custom-opencode",
    version: "custom 0.0.1",
  },
);

console.log("opencode command probe: ok");
