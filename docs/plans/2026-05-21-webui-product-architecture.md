# WebUI Product Architecture Plan

## 背景判断

上一轮 WebUI 重做解决了外观和四区布局问题，但它仍然更接近前端 demo，而不是 LinkA 的产品工作台。下一阶段不能继续只堆 React 组件，必须先把 Room、Message、Doc、Announcement、Member、Activity 的对象边界、API 行为和数据导出目标固定下来。

LinkA 的 WebUI 应该接近飞书/Slack/Discord 这类群聊产品的工作界面：Room 是群聊现场，中间是消息时间线，右侧是群管理和上下文管理，Doc 是 Room 的共享材料，Activity 是 Agent 参与层的可观察动作。它不是普通 chatbot，也不是任务 dashboard。

本计划的目标是把 WebUI 从“可看 demo”推进到“可操作产品骨架”。实现前必须接受以下判断：

- 每个可见按钮都要么有真实行为，要么显式进入 disabled/coming-soon 状态并说明原因；不能出现假按钮。
- Room 的群管理能力要按 IM 产品理解：成员、公告、置顶、群文件、权限、历史，而不是随意放一些卡片。
- Agent 活动栏不是日志流，也不是任务状态写入 Room；它是 Harness/Runtime 事件的产品化投影。
- Message 数据结构必须同时服务三件事：人类群聊可读、Agent context projection 可重放、训练/评测数据可导出。
- Doc 必须有浏览、编辑、评论、版本视图；仅能新建但不能打开和编辑不算完成。

## 产品面目标

### 1. Room 主界面

WebUI 主界面采用稳定三栏加详情层模型：

```text
左侧：Room 列表 / 创建 Room / 本地 daemon 状态
中间：Room 时间线 / composer / reply / mention / attachments
右侧：群信息 / 成员 / 公告 / 置顶 / Docs / 文件 / Agent Activity
详情层：Member drawer / Doc view / Announcement editor / Run detail / Export dialog
```

左侧 Room 列表要支持真实 `POST /linka/rooms`。创建 Room 不只是生成 room 本体，还要完成默认成员初始化：当前用户、LinkA，以及可选 Agent 模板。MVP 可以先用本地固定用户和默认 LinkA，但 UI 不能再是死按钮。

中间时间线要继续保持 IM 语义：message 按 room 内 sequence 排序，支持 sender、kind、reply、mention、attachment/evidence 展示。下一阶段不做复杂富文本编辑器，但必须为结构化 message content 留接口。

右侧栏改成群管理面板，而不是泛 dashboard。建议使用 tabs 或 segment：`信息`、`成员`、`公告`、`Docs`、`活动`、`文件`。头像点击打开 Member drawer，Doc 点击打开 Doc view，公告点击进入可编辑状态。

Daemon 状态区不能写“下载 daemon”但无行为。短期方案：按钮改为“启动说明”或“复制启动命令”，打开本地说明弹窗；长期方案再做桌面端/安装包。

### 2. 右侧群管理设计

右侧群管理需要明确每栏的职责。

`信息`：Room 名称、topic、owner、创建时间、默认可见性、通知策略。MVP 先只读，后续加编辑。

`成员`：列出 human/agent 成员，显示 role、status、lastSeen、权限摘要。点击头像或列表项打开 Member drawer：基本信息、权限、参与策略、对应 Harness session、最近被 mention 的消息。

`公告`：显示当前公告列表，支持创建/编辑/删除。公告是 Room 的长期信息，不是任务状态。公告可被置顶，可进入 Harness projection。

`Docs`：列出 Room Docs，点击打开 Doc view。新建 Doc 后应自动选中新 Doc 并进入可编辑视图。Doc 列表不是最终浏览面。

`活动`：只显示 Agent 参与层动作，不显示所有 runtime stdout。活动从 Harness session/trigger/turn/run/runtime event 派生，作为可观察过程摘要。

`文件`：RoomFile 和 message attachments 的索引。MVP 可先只读，后续加上传。

### 3. Doc 工作流

Doc 下一阶段要做到最小闭环：

- `GET /linka/docs/:docId` 进入详情视图，显示正文、comments、revisions。
- `PATCH /linka/docs/:docId` 更新 title/body/status，自动创建 revision 或要求显式 `POST /revisions`。
- `POST /linka/docs/:docId/comments` 创建评论。
- `GET /linka/docs/:docId/revisions` 或详情响应附带 revisions。
- UI 支持浏览、编辑、保存、查看版本、查看评论。

Doc 的编辑不要先做复杂协同编辑。MVP 用 textarea/markdown preview 足够，但必须有真实持久化和版本记录。

## Message / Trace / Export 数据结构

### 当前问题

当前 `RoomMessage` 结构是可用的 IM v0：`sender + kind + text + mentions + replyTo + references + attachments + evidence`。它适合展示和简单 Harness projection，但不适合长期训练/评测数据导出，原因是：

- `text` 是单字段，无法表达多 part content、tool call、tool result、doc reference、evidence reference 的结构。
- 没有显式 LLM chat role，导出时只能从 sender/kind 猜 `user/assistant/system/tool`。
- 没有把 message 与 Harness trigger/turn/run、runtime session、projection snapshot 绑定起来。
- 无法记录“Agent 当时看到了什么上下文”，后续 reconstruct 会被 Doc 编辑、消息删除、公告修改污染。
- 没有 loss mask、eval label、dataset split、trajectory id 等导出辅助元数据。

### 设计原则

LinkA 的 Message 要保留 IM 对象边界，但额外支持 LLM 数据导出。不要把 LLM runtime 内部字段直接暴露成 Room 本体，也不要把所有训练字段塞进 UI 必须理解的展示层。

推荐采用兼容式 v2：保留现有字段，同时新增结构化字段，逐步迁移。

```ts
interface RoomMessageV2 {
  id: RoomMessageId;
  roomId: RoomId;
  sequence: number;
  sender: RoomMessageSender;
  kind: RoomMessageKind;
  createdAt: UnixMs;
  editedAt?: UnixMs;

  text?: string;                 // 兼容旧 UI 和简单搜索
  content?: RoomMessageContentPart[];
  llmRole?: "system" | "user" | "assistant" | "tool" | "observer";

  thread?: {
    rootMessageId?: RoomMessageId;
    replyToMessageId?: RoomMessageId;
    topicKey?: string;
  };

  mentions?: RoomMention[];
  references?: RoomReference[];
  attachments?: RoomAttachment[];
  evidence?: RoomEvidence[];

  trace?: RoomMessageTrace;
  exportMeta?: RoomMessageExportMeta;
  visibility: RoomVisibility;
  notification: RoomNotificationPolicy;
}
```

`content` 采用 part union：

```ts
type RoomMessageContentPart =
  | { type: "text"; text: string; format?: "plain" | "markdown" }
  | { type: "image"; attachmentId: AttachmentId; alt?: string }
  | { type: "file_ref"; fileId: RoomFileId; label?: string }
  | { type: "doc_ref"; docId: DocId; revisionId?: DocRevisionId; quote?: string }
  | { type: "evidence_ref"; evidenceId?: string; label: string; uri?: string }
  | { type: "tool_call"; callId: string; name: string; argumentsJson: string }
  | { type: "tool_result"; callId: string; status: "ok" | "error"; resultJson?: string; text?: string }
  | { type: "event_ref"; eventId: RoomEventId; label?: string };
```

`trace` 绑定 Agent 轨迹：

```ts
interface RoomMessageTrace {
  trajectoryId?: string;
  harnessSessionId?: HarnessSessionId;
  harnessTriggerId?: HarnessTriggerId;
  harnessTurnId?: HarnessTurnId;
  harnessRunId?: HarnessRunId;
  runtimeSessionId?: RuntimeSessionId;
  projectionSnapshotId?: string;
  sourceMessageIds?: RoomMessageId[];
  visibleMessageIds?: RoomMessageId[];
  visibleDocRevisionIds?: DocRevisionId[];
}
```

`exportMeta` 服务训练/评测：

```ts
interface RoomMessageExportMeta {
  includeInTraining?: boolean;
  lossMask?: "include" | "exclude" | "assistant_only";
  evalLabels?: Record<string, string | number | boolean>;
  tags?: string[];
  redactionState?: "raw" | "redacted" | "excluded";
}
```

SQLite 存储建议分两步：

- Phase A：在 `room_messages` 上新增 `content_json`、`llm_role`、`thread_json`、`trace_json`、`export_meta_json`，保持现有查询最小改动。
- Phase B：如果需要高性能检索，再把 mentions/references/content parts 中的关键索引拆表。

### Agent Context Snapshot

为了让每个 Agent 的上下文轨迹可导出，必须保存不可变 projection snapshot。不能只保存最终 Room 状态后再重建。

新增对象建议：

```ts
interface HarnessContextSnapshot {
  id: string;
  roomId: RoomId;
  agentMemberId: RoomMemberId;
  harnessSessionId?: HarnessSessionId;
  harnessTriggerId?: HarnessTriggerId;
  harnessTurnId?: HarnessTurnId;
  createdAt: UnixMs;
  projectionVersion: number;
  projectionJson: string;
  sourceMessageIds: RoomMessageId[];
  sourceDocRevisionIds: DocRevisionId[];
  tokenEstimate?: number;
  redactionState: "raw" | "redacted";
}
```

Harness 在 dispatch runtime 前写 snapshot。Runtime 输出转换成 RoomMessage 时，把 `projectionSnapshotId` 写入 `trace`。这样导出一条训练样本时可以拿到：输入 snapshot、Agent 输出、工具调用、最终 message、用户干预和验证结果。

### Hugging Face 风格导出

Hugging Face chat template 的核心输入是 `messages` 列表，每条 message 包含 `role` 和 `content`，再由 tokenizer/chat template 渲染成模型需要的 token 格式。工具和文档上下文也应该作为结构化输入处理，而不是只拼成不可恢复的文本。

LinkA 导出建议提供两种格式：

`hf-chat-jsonl`：适合训练/评测工具直接读取。

```json
{
  "messages": [
    { "role": "system", "content": "Room rules and agent role framing..." },
    { "role": "user", "content": "@Researcher 请核验这些 URL" },
    { "role": "assistant", "content": "我会先收集页面时间..." }
  ],
  "metadata": {
    "roomId": "room_...",
    "trajectoryId": "traj_...",
    "agentMemberId": "rmem_...",
    "projectionSnapshotId": "ctx_...",
    "sourceMessageIds": ["rmsg_..."],
    "sourceDocRevisionIds": ["drev_..."]
  }
}
```

`linka-trajectory-jsonl`：保留完整 LinkA 对象，适合调试和离线分析。

```json
{
  "room": {},
  "viewer": {},
  "projection": {},
  "messages": [],
  "runtimeEvents": [],
  "outputMessages": [],
  "labels": {}
}
```

导出 API 可以从只读开始：

- `GET /linka/rooms/:roomId/exports/messages?format=hf-chat-jsonl`
- `GET /linka/harness/context-snapshots/:snapshotId`
- `GET /linka/harness/turns/:turnId/export?format=linka-trajectory-jsonl`

## Activity 栏设计

Activity 栏应该回答：“哪些 Agent 正在做什么，为什么被触发，当前需要人类做什么？”

不要放入 Activity 栏的内容：

- 每一行 stdout/stderr。
- token 级增量输出。
- Room message 的重复镜像。
- workflow/task 状态字段。

应该放入 Activity 栏的动作：

- `trigger.received`：Agent 因 mention/manual/scheduled 被触发。
- `context.projected`：已生成上下文，展示 message/doc/comment 数量和 snapshot id。
- `runtime.dispatched`：已发送到底层 runtime，展示 runtime session。
- `tool.called` / `tool.completed`：工具调用摘要，必要时进入详情。
- `output.translated`：runtime 输出已转换为 Room message。
- `waiting_user`：需要用户判断、批准、补充信息。
- `failed` / `retrying`：失败和重试摘要。
- `completed`：本轮完成，链接到输出 message。

数据来源优先复用 `harness_sessions`、`harness_triggers`、`harness_runs`、`harness_run_events`。如果需要统一 UI，可新增 `AgentActivityEvent` projection，不一定新增 Room data。

## API 和 Store 推进路线

### Phase 27：本计划

交付：本文档、协作规则更新、下一阶段拆分。

验证：文档与 `docs/PRD.md`、`docs/TECH.md`、`docs/room-oo-reference.md` 不冲突。

### Phase 28：Message v2 + Export Contract

范围：`packages/shared/src/room.ts`、`packages/daemon/src/db/migrations.ts`、`packages/daemon/src/store/message-store.ts`、`packages/daemon/src/api/rooms.ts`、测试。

交付：

- 新增 message structured content / llmRole / trace / exportMeta contract。
- SQLite migration 兼容旧数据。
- API append message 支持 content/trace/exportMeta。
- `hf-chat-jsonl` 导出 serializer，先覆盖 room history，不要求完整 snapshot。
- 单元测试覆盖旧 text message、新 content message、导出 role/content。

非目标：不重做全部 UI，不引入真实训练 pipeline。

### Phase 29：Room Management UI

范围：`packages/ui` 和必要 room service。

交付：

- 新建 Room modal 接入真实 `createRoom`。
- Room 创建后自动选中，并创建/加入默认 human + LinkA member。
- Member avatar/list item 打开 Member drawer。
- 右侧栏改为信息/成员/公告/Docs/活动/文件 tabs。
- “下载 daemon”改成真实可用的启动说明/复制命令，不再假按钮。

验证：UI service tests、store tests、smoke:ui。

### Phase 30：Doc / Announcement CRUD

范围：`packages/shared/src/doc.ts`、daemon docs API/store、announcement API/store、UI Doc view。

交付：

- Doc detail drawer/page：浏览、编辑、保存、评论、版本。
- `PATCH /linka/docs/:docId` 或 `POST /linka/docs/:docId/revisions`。
- Announcement create/edit/delete API 和 UI。
- Doc 新建后自动进入 detail view。

验证：doc store/API tests、UI docs service tests、smoke:ui。

### Phase 31：Agent Activity Projection

范围：Harness event projection、UI activity rail。

交付：

- 定义 `AgentActivityEvent` projection 或 selector。
- Activity 栏展示触发、上下文投影、runtime dispatch、工具摘要、等待用户、失败、完成。
- 点击 activity 打开 run detail，显示 raw runtime events。

验证：harness event tests、UI activity tests。

### Phase 32：Context Snapshot + Trajectory Export

范围：Harness projection、daemon store/API、export serializer。

交付：

- `harness_context_snapshots` store + migration。
- Harness dispatch 前持久化 snapshot。
- Runtime output message 写入 `trace.projectionSnapshotId`。
- `linka-trajectory-jsonl` export。

验证：snapshot immutability tests、export deterministic fixture。

## 验收标准

下一阶段不能只看截图，必须满足：

- UI 中所有主按钮都有真实行为或明确 disabled 原因。
- 创建 Room、打开 member drawer、编辑公告、打开并编辑 Doc 形成可跑通闭环。
- Message v2 能导出 Hugging Face 风格 `messages: [{ role, content }]` 数据。
- Agent 的至少一次 mention -> projection -> runtime -> output -> room message 链路可以通过 trace 字段或 snapshot id 回溯。
- Activity 栏能解释 Agent 正在做什么，但不污染 Room 本体。
- 每个 phase 结束都必须提交、合入 `main`、删除 worktree 和已合并临时分支。

## 当前开放问题

- `llmRole` 是存储字段还是导出时派生字段？建议先存储可覆盖值，同时提供默认派生规则。
- Doc 更新是直接 PATCH doc 还是只允许创建 revision？建议 MVP 允许 PATCH，并在 store 内自动生成 revision。
- Announcement 是否放进 Room Store 还是独立 Announcement Store？建议独立 store，Room API 聚合读取。
- Export 是否默认包含 human private notes？建议默认只导出 `visibility.scope = room`，私有可见性需要显式参数。
- Activity projection 是否需要单独持久化？建议先从 harness tables 派生，等性能或审计需求明确后再持久化。
