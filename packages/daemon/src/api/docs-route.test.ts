import assert from "node:assert/strict";
import { test } from "node:test";

import { type Doc, type DocComment, type DocRevision } from "@linka/shared";

import { createDaemonApp } from "../app.js";
import { createDaemonContainer, type DaemonContainer } from "../container/index.js";

const createTestContainer = (): DaemonContainer =>
  createDaemonContainer({
    databasePath: ":memory:",
    env: { LINKA_PORT: "6202" },
    git: null,
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-doc-route-test",
    profile: "doc-route-test",
    version: "test-version",
    now: () => new Date("2026-05-21T00:00:00.000Z"),
  });

const createRoom = async (
  app: ReturnType<typeof createDaemonApp>,
  displayName: string,
): Promise<string> => {
  const response = await app.request("http://127.0.0.1/linka/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  const body = (await response.json()) as { ok: true; room: { id: string } };

  assert.equal(response.status, 201);
  return body.room.id;
};

const addMember = async (
  app: ReturnType<typeof createDaemonApp>,
  roomId: string,
  participantId: string,
): Promise<string> => {
  const response = await app.request(`http://127.0.0.1/linka/rooms/${roomId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, kind: "human", displayName: participantId }),
  });
  const body = (await response.json()) as { ok: true; member: { id: string } };

  assert.equal(response.status, 201);
  return body.member.id;
};

const createDoc = async (
  app: ReturnType<typeof createDaemonApp>,
  roomId: string,
  memberId: string,
): Promise<Doc> => {
  const response = await app.request(`http://127.0.0.1/linka/rooms/${roomId}/docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Draft Brief",
      body: "# Draft\n\nInitial body.",
      status: "draft",
      createdByMemberId: memberId,
    }),
  });
  const body = (await response.json()) as { ok: true; doc: Doc };

  assert.equal(response.status, 201);
  return body.doc;
};

test("PATCH /linka/docs/:docId commits monotonic revisions and comments can target them", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const roomId = await createRoom(app, "Doc Update Room");
    const memberId = await addMember(app, roomId, "part_doc_updater");
    const doc = await createDoc(app, roomId, memberId);

    const firstUpdateResponse = await app.request(`http://127.0.0.1/linka/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated Brief",
        body: "# Updated\n\nFirst committed body.",
        status: "active",
        updatedByMemberId: memberId,
        summary: "first update",
      }),
    });
    const firstUpdateBody = (await firstUpdateResponse.json()) as {
      ok: true;
      doc: Doc;
      revision: DocRevision;
    };

    assert.equal(firstUpdateResponse.status, 200);
    assert.equal(firstUpdateBody.doc.title, "Updated Brief");
    assert.equal(firstUpdateBody.doc.body, "# Updated\n\nFirst committed body.");
    assert.equal(firstUpdateBody.doc.status, "active");
    assert.equal(firstUpdateBody.doc.currentRevisionId, firstUpdateBody.revision.id);
    assert.equal(firstUpdateBody.revision.revisionNumber, 1);
    assert.equal(firstUpdateBody.revision.status, "committed");
    assert.equal(firstUpdateBody.revision.parentRevisionId, undefined);
    assert.equal(firstUpdateBody.revision.createdByMemberId, memberId);

    const secondUpdateResponse = await app.request(`http://127.0.0.1/linka/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: "# Updated\n\nSecond committed body.",
        updatedByMemberId: memberId,
      }),
    });
    const secondUpdateBody = (await secondUpdateResponse.json()) as {
      ok: true;
      doc: Doc;
      revision: DocRevision;
    };

    assert.equal(secondUpdateResponse.status, 200);
    assert.equal(secondUpdateBody.doc.title, "Updated Brief");
    assert.equal(secondUpdateBody.doc.currentRevisionId, secondUpdateBody.revision.id);
    assert.equal(secondUpdateBody.revision.revisionNumber, 2);
    assert.equal(secondUpdateBody.revision.parentRevisionId, firstUpdateBody.revision.id);

    const commentResponse = await app.request(
      `http://127.0.0.1/linka/docs/${doc.id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "Please verify the second paragraph.",
          createdByMemberId: memberId,
          revisionId: secondUpdateBody.revision.id,
          mentions: [{ kind: "member", memberId, displayText: "@updater" }],
          anchor: { revisionId: secondUpdateBody.revision.id, lineStart: 3, lineEnd: 3 },
        }),
      },
    );
    const commentBody = (await commentResponse.json()) as { ok: true; comment: DocComment };

    assert.equal(commentResponse.status, 201);
    assert.equal(commentBody.comment.docId, doc.id);
    assert.equal(commentBody.comment.contextRoomId, roomId);
    assert.equal(commentBody.comment.revisionId, secondUpdateBody.revision.id);
    assert.equal(commentBody.comment.createdByMemberId, memberId);
    assert.equal(commentBody.comment.status, "open");

    const detailResponse = await app.request(`http://127.0.0.1/linka/docs/${doc.id}`);
    const detailBody = (await detailResponse.json()) as {
      ok: true;
      doc: Doc;
      revisions: readonly DocRevision[];
      comments: readonly DocComment[];
    };

    assert.equal(detailResponse.status, 200);
    assert.deepEqual(
      detailBody.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        parentRevisionId: revision.parentRevisionId,
      })),
      [
        { id: firstUpdateBody.revision.id, revisionNumber: 1, parentRevisionId: undefined },
        {
          id: secondUpdateBody.revision.id,
          revisionNumber: 2,
          parentRevisionId: firstUpdateBody.revision.id,
        },
      ],
    );
    assert.deepEqual(detailBody.comments, [commentBody.comment]);
  } finally {
    container.close();
  }
});

test("doc mutation routes return uniform errors for bad ids and missing docs", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);

    const badPatchResponse = await app.request("http://127.0.0.1/linka/docs/not-a-doc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updatedByMemberId: "rmem_missing" }),
    });
    assert.equal(badPatchResponse.status, 400);
    assert.deepEqual(await badPatchResponse.json(), {
      ok: false,
      error: { code: "BAD_REQUEST", message: "docId must be a valid doc id" },
    });

    const badCommentResponse = await app.request(
      "http://127.0.0.1/linka/docs/not-a-doc/comments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "comment", createdByMemberId: "rmem_missing" }),
      },
    );
    assert.equal(badCommentResponse.status, 400);
    assert.deepEqual(await badCommentResponse.json(), {
      ok: false,
      error: { code: "BAD_REQUEST", message: "docId must be a valid doc id" },
    });

    const missingPatchResponse = await app.request("http://127.0.0.1/linka/docs/doc_missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updatedByMemberId: "rmem_missing" }),
    });
    assert.equal(missingPatchResponse.status, 404);
    assert.deepEqual(await missingPatchResponse.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "doc not found" },
    });
  } finally {
    container.close();
  }
});

test("doc mutation routes reject missing and cross-room members", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const firstRoomId = await createRoom(app, "First Doc Room");
    const secondRoomId = await createRoom(app, "Second Doc Room");
    const firstMemberId = await addMember(app, firstRoomId, "part_first_doc_member");
    const secondMemberId = await addMember(app, secondRoomId, "part_second_doc_member");
    const doc = await createDoc(app, firstRoomId, firstMemberId);

    const missingUpdaterResponse = await app.request(`http://127.0.0.1/linka/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "missing updater", updatedByMemberId: "rmem_missing" }),
    });
    assert.equal(missingUpdaterResponse.status, 404);
    assert.deepEqual(await missingUpdaterResponse.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "updater member not found" },
    });

    const crossRoomUpdaterResponse = await app.request(`http://127.0.0.1/linka/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "cross room updater", updatedByMemberId: secondMemberId }),
    });
    assert.equal(crossRoomUpdaterResponse.status, 404);
    assert.deepEqual(await crossRoomUpdaterResponse.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "updater member not found" },
    });

    const missingCommenterResponse = await app.request(
      `http://127.0.0.1/linka/docs/${doc.id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "missing commenter", createdByMemberId: "rmem_missing" }),
      },
    );
    assert.equal(missingCommenterResponse.status, 404);
    assert.deepEqual(await missingCommenterResponse.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "creator member not found" },
    });

    const crossRoomCommenterResponse = await app.request(
      `http://127.0.0.1/linka/docs/${doc.id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "cross room commenter", createdByMemberId: secondMemberId }),
      },
    );
    assert.equal(crossRoomCommenterResponse.status, 404);
    assert.deepEqual(await crossRoomCommenterResponse.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "creator member not found" },
    });
  } finally {
    container.close();
  }
});
