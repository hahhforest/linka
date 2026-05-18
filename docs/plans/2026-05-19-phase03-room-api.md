# Phase 03B Room API

## 交付范围

- `DaemonContainer` 注入 `RoomStore` 和 `MessageStore`，与既有 `EventStore`、`EventBus` 共用已迁移 SQLite 连接。
- `packages/daemon/src/api/rooms.ts` 提供最小 Room API：创建/列表/详情、成员添加/列表、消息追加/历史查询。
- 创建 room、添加 member、发送 message 后按顺序执行：先持久化 room/member/message，再 append daemon event，最后 publish 到进程内 EventBus。
- 事件类型使用 `room.created`、`member.joined`、`message.created`，payload 包含对应对象。
- API 层处理输入校验和 400/404 错误，不把 SQLite 裸错误暴露给客户端。

## API 行为

- `POST /linka/rooms` 接收 `{ displayName, topic? }`，服务端生成 `room_` id、默认可见性、通知策略和权限策略。
- `GET /linka/rooms` 返回全部 room。
- `GET /linka/rooms/:roomId` 返回 room；`?members=true` 时附带 members。
- `POST /linka/rooms/:roomId/members` 接收 `{ participantId?, kind, displayName, role? }`，服务端生成 `rmem_` id；未传 `participantId` 时生成 `part_` id。
- `GET /linka/rooms/:roomId/members` 返回 room members。
- `POST /linka/rooms/:roomId/messages` 接收 `{ senderMemberId, kind?, text?, mentions? }`，服务端生成 `rmsg_` id，`MessageStore` 分配 room 内递增 sequence。
- `GET /linka/rooms/:roomId/messages?afterSequence=&limit=` 返回 sequence 升序历史，`limit` 限制为 1 到 500。

## 验证覆盖

- create room -> add human + agent -> send 2 messages -> list history，确认 sequence 为 1/2。
- room/message 操作后通过 `/linka/events?cursor=0` 可补发 `room.created` event，EventStore 中包含 room/member/message 事件序列。
- bad member kind 返回 400。
- unknown sender member 返回 404。

## 非目标

- 不实现完整权限系统。
- 不接 UI。
- 不新增 shared contract。
- 不新增 fake harness、workflow、task 或 WebSocket API。
