# Phase 03D UI Realtime SSE

## 目标

UI 在 daemon Room API 在线模式下接入 `/linka/events` SSE persisted event stream，同步 room、member、message 的实时变化。fallback demo room 不建立 SSE 连接。

## 实现范围

- `packages/ui/src/services/realtime/parser.ts`：解析 daemon persisted event，支持 `room.created`、`member.joined`、`message.created`。
- `packages/ui/src/services/realtime/source.ts`：封装浏览器 realtime source 生命周期，负责创建连接、绑定事件、关闭连接。`EventSource` 只在该目录出现。
- `packages/ui/src/store/realtimeStore.ts`：维护 realtime `status`、`lastCursor`、`connect`、`disconnect`。
- `packages/ui/src/store/roomStore.ts`：新增 `applyRoomEvent(event)`，按 cursor 和 id 去重后应用 room/member/message 变化。
- `packages/ui/src/app/App.tsx`：当 room 数据源为 `api` 且存在 active room 时连接 SSE，否则断开。
- `packages/ui/src/components/shell/ConnectionBar.tsx`：显示 realtime 状态和最新 cursor。

## 事件应用规则

- `message.created`：只追加当前 active room 的 message；重复 cursor、重复 id 或重复 message id 不重复渲染。
- `member.joined`：追加对应 room 的 member；重复 cursor、重复 id 或重复 member id 不重复渲染。
- `room.created`：加入 room 列表并初始化该 room 的本地集合；重复 cursor、重复 id 或重复 room id 不重复渲染。

## 不变量

- UI 不引入 WebSocket。
- app、components、store 不直接引用 `EventSource`。
- fallback source 不连接 realtime stream。
- `lastCursor` 由成功解析并投递到 store 的 daemon event 推进。

## 验证

- `parser.test.ts` 覆盖 persisted daemon event parser。
- `roomStore.test.ts` 覆盖 message append once、duplicate ignored、member duplicate ignored、room duplicate ignored。
- `realtimeStore.test.ts` 使用 fake source factory 覆盖 connect、disconnect、lastCursor。
