## Announcement

- 新增 daemon SQLite `announcements` 表，字段覆盖 shared `Announcement`，通过独立 `AnnouncementStore` 提供按 Room 列表、创建、更新和删除能力。
- 新增 daemon API：`GET /linka/rooms/:roomId/announcements`、`POST /linka/rooms/:roomId/announcements`、`PATCH /linka/announcements/:announcementId`、`DELETE /linka/announcements/:announcementId`。
- API 创建时校验 Room 存在、`createdByMemberId` 是合法 Room member；更新和删除时校验 Announcement 及其 Room/member 仍存在。
- 新增 UI service `announcementsService` 封装 list/create/update/delete，供后续 UI worker 接入组件。
- Announcement 不写入 Room data，也不承载 task/workflow/runtime 状态。

## UI

- `docsService` 增加 Doc 更新和评论创建封装，Room store 通过 API-backed action 写入 Doc、revision 和 comment，并在 `docDetailsByDocId` 缓存版本与评论供详情面板展示。
- Room workspace 加载 API Room 时同步调用 `listRoomAnnouncements`，Announcement create/update/delete 走独立 service 和 `announcementsByRoomId`，不写入 Room data。
- `MemberRail` 的 Docs tab 支持编辑 title/body/status、保存、评论输入，以及版本和评论列表；fallback 模式禁用写入并提示需要 LinkA daemon。
- `MemberRail` 的 Announcements tab 支持创建、编辑、删除公告；fallback 模式禁用写入并提示需要 LinkA daemon。
