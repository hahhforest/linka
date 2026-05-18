# Phase 02D Daemon SSE

## 目标

接入 daemon persisted event stream 的最小可验收版本，用 fake/dev event 验证核心不变量：先写入 SQLite event store，再通过内存 event bus 广播给 SSE 订阅者。

本阶段不实现真实 Room API、Member/Message repository、WebSocket 或轮询机制。

## 实现范围

- `packages/daemon/src/event-bus/index.ts`：提供进程内 event bus，支持 `subscribe()`、`publish()`、`getSubscriberCount()`；`publish()` 接收已经持久化的 event。
- `packages/daemon/src/event-bus/sse.ts`：提供 query cursor 解析、SSE event 编码和 stream 创建 helper。
- `packages/daemon/src/api/dev-events.ts`：提供 `POST /linka/dev/events` fake endpoint，接收 `{ type, roomId?, payload? }`，生成 daemon event id 和 `createdAt`，先 `eventStore.append()`，再 `eventBus.publish()`。
- `packages/daemon/src/api/events.ts`：提供 `GET /linka/events?cursor=N` SSE endpoint，连接时补发 cursor 之后的历史事件，之后订阅新事件。
- `packages/daemon/src/container/index.ts`：默认打开 `dataDir/linka.sqlite`，运行 migrations，创建 event store 和 event bus；测试可传入 `databasePath: ":memory:"` 或预构建 store/bus。
- `packages/daemon/src/app.ts`：只做 route 接线。

## API

### POST /linka/dev/events

请求体：

```json
{
  "type": "dev.message",
  "roomId": "room_alpha",
  "payload": { "text": "hello" }
}
```

返回 persisted event：

```json
{
  "ok": true,
  "event": {
    "cursor": 1,
    "id": "evt_...",
    "roomId": "room_alpha",
    "type": "dev.message",
    "createdAt": 1716000000000,
    "payload": { "text": "hello" }
  }
}
```

### GET /linka/events?cursor=N

返回 `text/event-stream`。没有 query cursor 时从 `0` 开始补发。SSE `id` 使用 persisted event `cursor`。

每条事件格式：

```text
id: 1
event: dev.message
data: {"cursor":1,"id":"evt_...","type":"dev.message","createdAt":1716000000000,"payload":{}}
```

## 不变量

- SQLite event store 是事实源，event bus 只负责进程内实时分发。
- fake/dev event 必须先 append，后 publish。
- SSE 建连时从 store 补发 cursor 之后的历史事件，再接收新广播事件。
- 断开连接释放 event bus subscriber。

## 验证

测试覆盖：

- `POST /linka/dev/events` append 后 publish，active SSE subscriber 可读到同一 persisted event。
- `GET /linka/events?cursor=N` 可补发 cursor 之后的历史事件。
