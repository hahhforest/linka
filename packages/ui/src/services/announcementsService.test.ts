import assert from "node:assert/strict";

import { announcementId, unixMs, type Announcement, type RoomVisibility } from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import {
  createRoomAnnouncement,
  deleteAnnouncement,
  listRoomAnnouncements,
  updateAnnouncement,
} from "./announcementsService.js";

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
const roomVisibility: RoomVisibility = { scope: "room" };
const memberVisibility: RoomVisibility = { scope: "members", memberIds: [owner.id] };

const announcement: Announcement = {
  id: announcementId("ann_ui_service_review_standard"),
  roomId: demoRoom.room.id,
  title: "Review Standard",
  body: "Check evidence before merging.",
  createdAt: unixMs(1_716_000_000_000),
  updatedAt: unixMs(1_716_000_000_100),
  createdByMemberId: owner.id,
  visibility: roomVisibility,
};

const createdAnnouncement: Announcement = {
  ...announcement,
  id: announcementId("ann_ui_service_created"),
  title: "Created Announcement",
  body: "Created through service.",
  visibility: memberVisibility,
};

const updatedAnnouncement: Announcement = {
  ...createdAnnouncement,
  body: "Updated through service.",
  updatedAt: unixMs(1_716_000_000_200),
  visibility: roomVisibility,
};

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, announcements: [announcement] }),
  makeJsonResponse({ ok: true, announcement: createdAnnouncement }, 201),
  makeJsonResponse({ ok: true, announcement: updatedAnnouncement }),
  makeJsonResponse({ ok: true }),
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

assert.deepEqual(await listRoomAnnouncements(demoRoom.room.id, options), [announcement]);
assert.equal(
  requests[0]?.input,
  `http://daemon.test/linka/rooms/${demoRoom.room.id}/announcements`,
);
assert.equal(requests[0]?.init.method, "GET");

assert.equal(
  (
    await createRoomAnnouncement(
      demoRoom.room.id,
      {
        title: "Created Announcement",
        body: "Created through service.",
        createdByMemberId: owner.id,
        visibility: memberVisibility,
      },
      options,
    )
  ).id,
  createdAnnouncement.id,
);
assert.equal(
  requests[1]?.input,
  `http://daemon.test/linka/rooms/${demoRoom.room.id}/announcements`,
);
assert.equal(requests[1]?.init.method, "POST");
assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), {
  title: "Created Announcement",
  body: "Created through service.",
  createdByMemberId: owner.id,
  visibility: memberVisibility,
});

assert.deepEqual(
  await updateAnnouncement(
    createdAnnouncement.id,
    { title: null, body: "Updated through service.", visibility: roomVisibility },
    options,
  ),
  updatedAnnouncement,
);
assert.equal(
  requests[2]?.input,
  `http://daemon.test/linka/announcements/${createdAnnouncement.id}`,
);
assert.equal(requests[2]?.init.method, "PATCH");
assert.deepEqual(JSON.parse(String(requests[2]?.init.body)), {
  title: null,
  body: "Updated through service.",
  visibility: roomVisibility,
});

assert.equal(await deleteAnnouncement(createdAnnouncement.id, options), undefined);
assert.equal(
  requests[3]?.input,
  `http://daemon.test/linka/announcements/${createdAnnouncement.id}`,
);
assert.equal(requests[3]?.init.method, "DELETE");
assert.equal(requests[3]?.init.body, undefined);

console.log("announcements service api shape: ok");
