import assert from "node:assert/strict";

import { demoRoom } from "./demoRoom.js";

const memberByName = new Map(demoRoom.members.map((member) => [member.displayName, member]));

assert.equal(memberByName.get("用户")?.kind, "human");
assert.equal(memberByName.get("LinkA")?.kind, "agent");
assert.equal(memberByName.get("资料 Agent")?.kind, "agent");
assert.equal(memberByName.get("核验 Agent")?.kind, "agent");

const messageKinds = new Set(demoRoom.messages.map((message) => message.kind));

assert.ok(messageKinds.has("evidence"), "demo room should include evidence messages");
assert.ok(messageKinds.has("intervention"), "demo room should include intervention messages");
assert.ok(messageKinds.has("system"), "demo room should include system messages");

assert.ok(demoRoom.announcements.length > 0, "demo room should include announcements");
assert.ok(demoRoom.pinnedItems.length > 0, "demo room should include pinned items");
assert.ok(demoRoom.files.length > 0, "demo room should include files");

const memberIds = new Set(demoRoom.members.map((member) => member.id));

for (const message of demoRoom.messages) {
  if (message.sender.kind === "member") {
    assert.ok(
      memberIds.has(message.sender.memberId),
      `message ${message.id} sender ${message.sender.memberId} should exist in members`,
    );
  }
}

console.log("demo room sanity: ok");
