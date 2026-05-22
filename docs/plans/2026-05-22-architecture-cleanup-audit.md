# Architecture Cleanup Audit Before Human Intervention Loop

## 结论

当前代码库的主方向是对的：`Room` / `RoomMember` 没有被 task、workflow、runtime session 或 worker/build 状态污染；Harness、Runtime、Context Snapshot、Activity 也基本保持在 Room 之外的参与层和投影层。下一轮 Human Intervention Loop 不需要重新定义 Room。

但现在不能直接继续堆 HIL 功能。HIL 需要“用户插话、等待判断、批准/接管、Agent 后续继续”形成可追踪闭环；当前风险集中在三处：UI 默认路径仍可能落入 demo/fallback，Message v2 字段没有完整进入 Harness projection/runtime prompt，Harness trigger/session/pending interaction 生命周期没有闭环。如果跳过这些清理，HIL 很容易把等待用户、阻塞点或审批状态临时塞进 Room data，破坏 PRD/TECH 里的核心边界。

本轮审查只做架构结论和文档修正，不做业务代码重构。后续实现应合并为少量 commit 级目标，不再无限拆 phase。

## 审查依据

- `docs/vision.md`: LinkA 是可观测、可干预、可编程的 Agent Team 协作平台。
- `docs/PRD.md`: Linka 是入口，Room 是现场，Message 是协作单元，Agent 参与层是适配层。
- `docs/TECH.md`: Room 是 IM 群聊聚合根；HarnessSession、HarnessTurn、HarnessTrigger、RuntimeSession、PendingInteraction、AgentActivity 属于 Harness/Runtime 层，不进入 RoomMember。
- `docs/room-oo-reference.md`: Room 不直接包含任务状态、workflow 阶段或 Agent 内部推理状态。
- `docs/plans/2026-05-21-webui-product-architecture.md`: Message v2、Context Snapshot、trajectory export、Activity projection 的来源。
- `docs/plans/2026-05-22-real-agent-run-loop-ui.md`: 当前 daemon-backed `@LinkA -> Harness run -> Activity/output -> trajectory export` 主路径。
- 重点代码路径：`packages/shared/src/room.ts`、`packages/shared/src/runtime.ts`、`packages/shared/src/harness-projection.ts`、`packages/daemon/src/api/rooms.ts`、`packages/daemon/src/harness/*`、`packages/ui/src/store/roomStore.ts`、`packages/ui/src/components/room/MemberRail.tsx`、`scripts/daemon-ui-e2e.mjs`。

## Must Fix Before Human Intervention Loop

### 1. 默认产品路径必须退出 demo/fallback seed

**发现**：UI store 仍把 `demoRoom` 和 fallback 放在默认工作区路径里。`initializeRoomWorkspace()` 在 daemon room list 为空时自动调用 `createDemoLikeApiRoom()`，该函数会创建 demo room、添加 Alice/LinkA/Agent 成员，并发送带 `@LinkA` 的 instruction message。因为 daemon entrypoint 默认接入 `createOpenCodeRoomHarnessRunner`，空真实 profile 首次打开 UI 可能产生 demo run。发送失败或非 API 模式还会把全局 `source` 改成 `fallback`，而 `App.tsx` 的 realtime/refresh 又要求 `roomSource === "api"`，形成 sticky offline/demo 状态。

**影响**：HIL 的第一条等待用户或 intervention 可能不是用户真实意图，而是 demo seed 或 fallback 本地消息。UI 也可能显示“能浏览 demo”，掩盖 daemon-backed 主路径是否真实可用。

**处理**：必须修。

**后续 commit 目标**：

1. 将 `RoomDataSource` 拆清楚：`checking` / `api` / `offline` / `demo`，daemon API 失败默认进入 offline/error empty state，不自动加载 fixture。
2. 删除 `initializeRoomWorkspace()` 里的自动 `createDemoLikeApiRoom()`；空 daemon 显示 create room prompt。需要 demo 时用显式开发命令或显式 UI action。
3. API mutation 失败只产生 mutation error 或 local draft，不把全局 workspace 降级成 fallback。
4. daemon 从 offline/error 变 online 后重新初始化 API workspace，恢复 realtime/refresh。

### 2. Message v2 必须进入 Harness projection 和 runtime prompt

**发现**：shared contract 已经让 `ProjectedRoomMessage` 包含 `content`、`llmRole`、`thread`、`trace` 等 v2 字段，daemon API/store 也能接收和持久化这些字段。但 daemon 的实际 `projectMessage()` 仍只映射 `text`、`mentions`、`replyTo`、references、attachments、evidence 等字段；OpenCode adapter 的 prompt 格式化也只读 `message.text ?? ""`。

**影响**：人类 intervention、approval 或纠偏如果以 structured content、threaded reply、trace-rich message 进入 Room，可能在 timeline/export 中可见，但不会完整进入 Agent 后续上下文。HIL 会表现为“用户说了，但 Agent 没真正看见”。

**处理**：必须修。

**后续 commit 目标**：

1. 在 daemon projection 中映射 `content`、`llmRole`、`thread`、`trace`，补 projection tests。
2. 增加 message 兼容 helper，例如 `getMessagePlainText()`、`getReplyToMessageId()`；prompt formatting 从 helper 读取，优先保留 structured text part，再回退 `text`。
3. 新写 message 时保持 `replyTo.messageId` 与 `thread.replyToMessageId` 对齐；`text` 可从 text parts 派生，但不移除旧字段。
4. 给 content-only intervention、threaded intervention、trace-linked runtime output 增加 deterministic tests。

### 3. HIL 等待状态必须归 Harness / PendingInteraction 所有

**发现**：TECH 和 shared contract 已经定义 `HarnessSession`、`HarnessTurn`、`HarnessTrigger`、`PendingInteraction`、`AgentActivity`，daemon store 也有 `updateSessionStatus()`、`claimTrigger()`、`updateTriggerStatus()`。但当前 OpenCode room runner 创建 trigger 后没有 claim/dispatch/consume，也没有把 session 推进到 `running -> idle|waiting_user|failed`；`PendingInteraction` 只有 shared 类型，没有 daemon 持久化/API。

**影响**：HIL 最核心的问题是“谁在等用户、为什么等、用户回答后继续哪个 Agent/trigger/run”。如果这个状态没有 Harness 层事实源，实现压力会把 `waiting_user`、`blockedBy`、approval state 或 takeover state 塞进 Room、RoomMember 或 UI local state。

**处理**：必须修。

**后续 commit 目标**：

1. 在 runner 中推进 trigger/session 生命周期：`pending -> claimed/dispatched/consumed`，session `idle -> running -> idle|waiting_user|failed`。
2. 增加最小 `PendingInteraction` store/API，用来表达 question/approval/takeover/clarification 的等待状态。
3. Room timeline 只写人类可读 request/response message，并通过 `replyTo` / `thread` / `trace` 连接 Harness 对象；不要给 Room 或 RoomMember 增加 task/workflow 字段。
4. Activity projection 从 Harness lifecycle 和 pending interaction 派生 user-facing item，而不是展示 raw runtime/session status。

### 4. Snapshot provenance 必须写入 session/trigger 维度

**发现**：`HarnessContextSnapshot` contract 和 DB schema 已支持 `harnessSessionId`、`harnessTriggerId`、`harnessTurnId`、`harnessRunId`，但 `run-service` 当前只写 `harnessRunId`。output RoomMessage trace 后续会补 session/trigger/run/snapshot id，但失败、取消、waiting-user 或无输出路径不能依赖 output message 才知道 snapshot 属于哪个 session/trigger。

**影响**：HIL 需要解释“Agent 当时看到什么上下文，为什么向用户请求判断”。snapshot provenance 不完整会削弱 trajectory export、debug 和评测数据可靠性。

**处理**：必须修。

**后续 commit 目标**：

1. 给 `startHarnessRun()` / `createContextSnapshot()` 增加可选 `harnessSessionId` 和 `harnessTriggerId` 输入。
2. 从 `opencode-room-runner` 传入 session/trigger；保留 `harnessTurnId` 到真正 turn store 出现后再接。
3. 给 no-output/failure/waiting-user 路径补 export/provenance fixture。

### 5. Phase 34 旧 seed DB E2E 叙述必须修正

**发现**：`docs/plans/2026-05-22-phase34-trajectory-export-ui.md` 仍写着 daemon UI E2E 会在 UI 创建 room 后直接 seed SQLite harness run/runtime session/context snapshot/runtime events/messages。当前真实脚本已经改为 browser composer 发送 `@LinkA`，由 daemon mention handler 触发 Harness run，再从 Activity 导出 trajectory。

**影响**：后续 worker 可能按旧文档把 seed DB 重新引入主 E2E，绕开 Room composer 和 daemon mention handler。

**处理**：本审查 lane 已同步修正文档。后续仍要保护 `pnpm smoke:daemon-ui`，不能用 seed DB 替代主路径。

## Should Fix Soon

### 1. `rooms.ts` 拆成 thin route + command/export helper

`packages/daemon/src/api/rooms.ts` 同时承担 parser、Room/Member/Message command、event publish、mention target selection、harness runner trigger、HF chat export、Hono route adapter。HIL 会继续改 message kind、mention policy、pending user interaction 和 trigger path，继续堆在 route 文件会让边界更难审查。

建议先抽小模块，不做通用 CRUD 框架：

- `room-command-service`: `createRoom`、`addMember`、`appendMessage`、event publish、mention trigger policy。
- `room-message-export`: `hf-chat-jsonl` serializer 和 export filter。
- route 文件只负责 request parse、service call、response/error mapping。

### 2. API 输入边界补 runtime validators

Room message API 目前对 `content` 只验证 part type，对 `thread`、`trace`、`exportMeta` 只验证 object 后 cast。HIL 会依赖 trace、projection snapshot、export labels 和 intervention kind，外部 malformed payload 会在 projection/export 阶段爆炸。

建议优先给 `RoomMessageContentPart`、`RoomMessageThread`、`RoomMessageTrace`、`RoomMessageExportMeta` 加最小 validator；docs/announcements/realtime parser 的浅 cast 后续跟进。

### 3. Export 默认策略收紧到 room-visible / non-excluded

当前 room history export 和 trajectory export 会把加载到的 messages/docs/runtime events 全量放入 export。HIL 引入 private note、approval、user-sensitive intervention 后，需要默认只导出 `visibility.scope = room`，排除 `exportMeta.redactionState = excluded`，member/private scoped export 必须显式 opt-in。

### 4. `roomStore.ts` 和 `MemberRail.tsx` 拆出稳定边界

`roomStore.ts` 超过 1100 行，混合 rooms、members、messages、docs、announcements、harness runs/sessions/events、mutation flags、realtime keys 和重复 refresh/merge。`MemberRail.tsx` 超过 1100 行，混合成员、公告、Doc、Activity、trajectory export 和 clipboard state。HIL UI 若继续落在这些文件里，回归风险会明显增加。

建议：

- 先抽 `loadRoomWorkspaceSnapshot()` 和 `mergeRoomWorkspaceSnapshot()`，减少重复 set block。
- 再抽 `AnnouncementsPanel`、`DocsPanel`、`ActivityPanel`；`MemberRail` 只保留 tab 和数据选择。
- trajectory export/copy 放入 `ActivityPanel` 或 hook。

### 5. Test runtime 和 smoke tooling 边界收窄

当前默认 runtime 仍正确：没有 env flag 时走 OpenCode adapter；`LINKA_RUNTIME_ADAPTER=test` / `LINKA_TEST_RUNTIME=1` 才走 deterministic test adapter。但 `scripts/daemon-ui-e2e.mjs` 的 `commonEnv` 会把 test runtime flag 同时传给 daemon 和 Vite UI 进程，且 daemon package root 暴露 `createTestRuntimeAdapter` / `TestRuntimeAdapter`。

建议：

- 拆成 `daemonEnv` / `uiEnv`，只有 daemon 子进程拿 test runtime flag。
- 如果测试不需要 root import test adapter，从 daemon root export 中移除；否则加 test-only 注释并保留默认 OpenCode 单测。
- 先抽 `scripts/lib/cdp-browser.mjs` 和 `scripts/lib/process-smoke.mjs`，保持 `daemon-ui-e2e` scenario 文案和断言直观。

### 6. Container / health / API client 小清理

- `createDaemonContainer()` 目前每个 store helper 都调用 `runMigrations()`；可改为拥有 database 时只跑一次 migration。
- `allStoresProvided` 未包含 announcement/context snapshot store，unavailable store 读方法返回 empty/undefined、写方法才 throw；建议无 database 且 store 不全时 fail-fast。
- `healthService.ts` 仍兼容旧 `status/message` payload，并把 non-object 或缺 `ok` payload 当 healthy；daemon health contract 已稳定，HIL 前应保守解析。
- `apiClient.ts` 只允许 `GET | POST`，PATCH/DELETE 靠 cast；建议扩展 method union，并提供 shared `requestText()` 给 trajectory export 使用。

## Defer

- 不做 breaking `RoomMessage v3`。`text` / `replyTo` 暂时保留，等 UI/projection/export 全部走 helper 后再考虑收敛。
- 不把 message content parts 拆成 SQL 表。当前 JSON column 适合 v0，性能检索以后再设计。
- 不持久化 `AgentActivityEvent`。现在从 Harness sessions/runs/runtime events 派生是正确边界；等 HIL event taxonomy 稳定后再决定。
- 不做通用 CRUD framework。Docs、Announcements、Rooms 只有小工具相似，业务语义不同。
- 不引入泛型 task/workflow state system。HIL 只需要 Harness `PendingInteraction` 和 Room message/thread/trace links。
- 不急着抽 OpenCode smoke REST helper 或 daemon E2E DOM scenario layer。等出现第三个复用点再做。

## 建议的下一轮工作分解

### Lane 37: Real Room Default Path

目标：确保 UI 默认路径只表达真实 daemon-backed Room，demo 变成显式开发能力。

建议 commit：

1. 移除空 daemon 自动 demo seed，新增 empty/create room state。
2. 拆分 `api/offline/demo` data source，修复 daemon online 后重新初始化。
3. 修改 composer failure 行为，不把全局 source 降成 fallback。
4. 更新 room store tests 和 daemon UI E2E fixture 创建方式。

验收：`pnpm --filter @linka/ui test`、`pnpm smoke:daemon-ui`。

### Lane 38: Harness HIL Foundation

目标：让用户干预能进入 Agent 后续上下文，并由 Harness 层拥有等待状态。

建议 commit：

1. Message v2 projection + prompt helper + tests。
2. Runner trigger/session lifecycle wiring。
3. Minimal `PendingInteraction` store/API/read model。
4. Context snapshot session/trigger provenance + export fixture。

验收：`pnpm --filter @linka/daemon test`、`pnpm --filter @linka/shared test`、`pnpm smoke:opencode-loop` 或 deterministic harness test。

### Lane 39: Boundary Hardening Before HIL UI

目标：降低 HIL UI/API 改动面，让后续实现不继续堆巨型文件。

建议 commit：

1. `rooms.ts` 拆 thin route / command service / export helper。
2. Room message API validators + export visibility/redaction filter。
3. `roomStore` snapshot merge helper；`MemberRail` 拆 `ActivityPanel`。
4. daemon UI E2E env scoping和 helper 抽取。

验收：`pnpm --filter @linka/daemon test`、`pnpm --filter @linka/ui test`、`node --check scripts/daemon-ui-e2e.mjs scripts/ui-smoke.mjs`、`pnpm smoke:daemon-ui`。

## 不改什么

- 不把 task、workflow、build、worker、runtime session、pending approval 状态写入 `Room` 或 `RoomMember`。
- 不删除或弱化 `pnpm smoke:daemon-ui`。
- 不默认启用 `TestRuntimeAdapter`。
- 不把 seed DB / direct harness table writes 作为 daemon UI E2E 主路径。
- 不大改 `shared` / `config` 公共契约；必要时先用 helper 和 daemon internal validator 收紧。

## 验证记录

本轮审查使用 team-work 分工完成：Product/Room Boundary、Code Path、E2E/Tooling 三条 Producer 独立审查，并由对应 Verifier 回到原始 docs/code/scripts 核验。三条结论均为 `PASS_WITH_RISK`，风险均来自底层现状，不来自审查产物事实错误。

已运行的 owner 侧验证：

```bash
node --check scripts/daemon-ui-e2e.mjs
```

T3 producer/verifier 还分别运行了四个 smoke/E2E 脚本的 `node --check`，均通过。未在本轮运行完整 `pnpm smoke:daemon-ui`，因为本轮没有改业务代码或 E2E 脚本行为；若 Lane 37/38/39 任一实现开始，`pnpm smoke:daemon-ui` 必须作为合入门禁。
