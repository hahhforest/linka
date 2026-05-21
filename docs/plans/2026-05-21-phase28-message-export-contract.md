# Phase 28 Message v2 Export Contract

## 交付范围

- 在 `RoomMessage` 上新增兼容式 v2 字段：`content`、`llmRole`、`thread`、`trace`、`exportMeta`。
- 新增结构化 content part 类型，用于文本、图片、文件引用、Doc 引用、证据引用、工具调用、工具结果和事件引用。
- SQLite migration `version 6` 为 `room_messages` 增加 `content_json`、`llm_role`、`thread_json`、`trace_json`、`export_meta_json`。
- `MessageStore` append/list 支持新字段 round trip，并保留旧 text-only message 行为。
- `POST /linka/rooms/:roomId/messages` 接收新字段并做轻量结构校验。
- `GET /linka/rooms/:roomId/exports/messages?format=hf-chat-jsonl` 导出 room history 为单行 JSONL，包含 `messages: [{ role, content }]` 和 metadata。
- `ProjectedRoomMessage` 暴露新字段，后续 Harness projection 可以读取结构化消息。

## 设计边界

本阶段只做 Message v2 和 room history 导出契约，不实现完整 context snapshot，也不引入训练 pipeline。

新增字段全部 optional。旧消息仍以 `text` 为主，旧 UI 和既有 Harness runner 不需要立即迁移。

导出 role 的默认派生规则：

- 显式 `llmRole` 优先，`observer` 不直接导出为 HF role。
- system sender 导出为 `system`。
- agent member 默认导出为 `assistant`。
- human member 默认导出为 `user`。

导出 content 的规则：

- 有 `content` 时，按 part 转为可读文本并用换行连接。
- 无 `content` 时，回退到 `text`。
- `tool_call`、`tool_result`、`doc_ref` 等结构化 part 先以可读标记导出，后续可扩展为更完整的 provider-specific tool call schema。

## API 行为

### Append Message

`POST /linka/rooms/:roomId/messages` 继续支持旧输入：

```json
{
  "senderMemberId": "rmem_...",
  "kind": "text",
  "text": "hello"
}
```

也支持结构化输入：

```json
{
  "senderMemberId": "rmem_...",
  "kind": "tool_result_summary",
  "text": "已找到证据。",
  "content": [
    { "type": "text", "text": "已找到证据。", "format": "plain" },
    {
      "type": "tool_call",
      "callId": "call_1",
      "name": "fetch_url",
      "argumentsJson": "{\"url\":\"https://example.test\"}"
    },
    { "type": "tool_result", "callId": "call_1", "status": "ok", "text": "updated 2026-05-01" }
  ],
  "llmRole": "assistant",
  "thread": { "topicKey": "url-check" },
  "trace": { "trajectoryId": "traj_..." },
  "exportMeta": { "includeInTraining": true, "lossMask": "assistant_only", "redactionState": "raw" }
}
```

API 会拒绝不支持的 `content[].type` 和非法 `llmRole`。

### Export

`GET /linka/rooms/:roomId/exports/messages?format=hf-chat-jsonl` 返回 `application/x-ndjson`：

```json
{
  "messages": [
    { "role": "user", "content": "请核验这个 URL。" },
    {
      "role": "assistant",
      "content": "已找到证据。\n[tool_call:fetch_url] {\"url\":\"https://example.test\"}\n[tool_result:ok] updated 2026-05-01"
    }
  ],
  "metadata": {
    "roomId": "room_...",
    "roomDisplayName": "Export Room",
    "messageIds": ["rmsg_..."],
    "sequences": [1, 2],
    "trajectoryIds": ["traj_..."]
  }
}
```

## 验证覆盖

- Migration test 覆盖 version 6 和新增 `room_messages` 列。
- Message store test 覆盖旧 text message 和 structured content message round trip。
- Daemon app test 覆盖 append structured message、history 读回、HF JSONL export、非法 content type 和非法 llmRole。
- 全仓验证：`pnpm typecheck`、`pnpm test`、`pnpm build`。

## 非目标

- 不实现 `harness_context_snapshots`。
- 不实现 `linka-trajectory-jsonl` 完整导出。
- 不迁移 UI message rendering 到 content parts。
- 不做 provider-specific tool call schema。
