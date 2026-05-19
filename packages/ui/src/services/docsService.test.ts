import assert from "node:assert/strict";

import {
  docCommentId,
  docId,
  docRevisionId,
  unixMs,
  type Doc,
  type DocComment,
  type DocRevision,
  type RoomVisibility,
} from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import { createRoomDoc, getDoc, listRoomDocs } from "./docsService.js";

interface CapturedRequest {
  readonly input: string;
  readonly init: RequestInit;
}

const makeJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 || status === 201 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });

const owner = demoRoom.members[0];
const reviewer = demoRoom.members[1];
const docVisibility: RoomVisibility = { scope: "room" };
const memberVisibility: RoomVisibility = { scope: "members", memberIds: [owner.id, reviewer.id] };

const doc: Doc = {
  id: docId("doc_ui_service_brief"),
  contextRoomId: demoRoom.room.id,
  title: "UI Service Brief",
  format: "markdown",
  status: "active",
  body: "# Brief\n\nService test fixture.",
  createdAt: unixMs(1_716_000_000_000),
  updatedAt: unixMs(1_716_000_000_100),
  createdByMemberId: owner.id,
  visibility: docVisibility,
};

const revision: DocRevision = {
  id: docRevisionId("drev_ui_service_brief_1"),
  docId: doc.id,
  contextRoomId: demoRoom.room.id,
  revisionNumber: 1,
  format: "markdown",
  status: "committed",
  body: doc.body,
  title: doc.title,
  createdAt: unixMs(1_716_000_000_010),
  createdByMemberId: owner.id,
  summary: "initial revision",
};

const comment: DocComment = {
  id: docCommentId("dcmt_ui_service_brief_1"),
  docId: doc.id,
  contextRoomId: demoRoom.room.id,
  revisionId: revision.id,
  body: "Review the service contract.",
  status: "open",
  createdAt: unixMs(1_716_000_000_020),
  updatedAt: unixMs(1_716_000_000_021),
  createdByMemberId: reviewer.id,
  mentions: [{ kind: "member", memberId: owner.id, displayText: "@owner" }],
  anchor: { revisionId: revision.id, lineStart: 1, lineEnd: 1, quote: "# Brief" },
  visibility: docVisibility,
};

const createdDoc: Doc = {
  ...doc,
  id: docId("doc_ui_service_created"),
  title: "Created Doc",
  status: "draft",
  body: "Created through service.",
  visibility: memberVisibility,
};

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, docs: [doc] }),
  makeJsonResponse({ ok: true, doc, revisions: [revision], comments: [comment] }),
  makeJsonResponse({ ok: true, doc: createdDoc }, 201),
];

const fetchImpl: typeof fetch = async (input, init = {}) => {
  requests.push({ input: String(input), init });
  const response = responses.shift();

  if (!response) {
    throw new Error("unexpected fetch call");
  }

  return response;
};

const options = { baseUrl: "http://daemon.test/", fetchImpl };

assert.deepEqual(await listRoomDocs(demoRoom.room.id, options), [doc]);
assert.equal(requests[0]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}/docs`);
assert.equal(requests[0]?.init.method, "GET");

const detail = await getDoc(doc.id, options);
assert.deepEqual(detail, { doc, revisions: [revision], comments: [comment] });
assert.equal(requests[1]?.input, `http://daemon.test/linka/docs/${doc.id}`);
assert.equal(requests[1]?.init.method, "GET");

assert.equal(
  (
    await createRoomDoc(
      demoRoom.room.id,
      {
        title: "Created Doc",
        body: "Created through service.",
        format: "markdown",
        status: "draft",
        createdByMemberId: owner.id,
        visibility: memberVisibility,
      },
      options,
    )
  ).id,
  createdDoc.id,
);
assert.equal(requests[2]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}/docs`);
assert.equal(requests[2]?.init.method, "POST");
assert.deepEqual(JSON.parse(String(requests[2]?.init.body)), {
  title: "Created Doc",
  body: "Created through service.",
  format: "markdown",
  status: "draft",
  createdByMemberId: owner.id,
  visibility: memberVisibility,
});

console.log("docs service api shape: ok");
