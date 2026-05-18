# Phase 01A Shared Contracts Plan

## 目标

实现 `@linka/shared` 的稳定契约层，作为上层 daemon、UI、CLI、harness 的共同类型来源。该包只暴露 DTO、branded ID、基础 guard 和少量纯函数，不承载运行时行为。

## 范围

- `packages/shared/src/primitives.ts`：contract version、`UnixMs`、基础 guard。
- `packages/shared/src/ids.ts`：Room、Member、Message、Event、Participant、Attachment、RoomFile、Announcement、PinnedItem 的 branded ID、parser 和 type guard。
- `packages/shared/src/room.ts`：Room 基础 IM 本体契约，覆盖 member、message、event、file、announcement、pin、permission policy，以及相关枚举、可见性、通知、提及、回复、引用、附件、证据契约。
- `packages/shared/src/harness-projection.ts`：Harness projection request、trigger、projected room/member/message/event/announcement/pin/file DTO。
- `packages/shared/src/index.ts`：统一 public exports。
- `packages/shared/test/contracts.test.ts`：轻量契约测试。

## 设计决策

- ID 只校验和 parse，不生成。每类 ID 必须使用稳定前缀：`room_`、`rmem_`、`rmsg_`、`revt_`、`part_`、`att_`、`rfile_`、`ann_`、`pin_`。不同类型的 ID guard/parser 不互相接受，避免上层把成员、消息、事件、公告、置顶等引用混用。
- Room 中的 member kind 只表达 room participant 的基础类型：`human` 或 `agent`。LinkA 是特殊的 agent member，不是单独的 member kind；它的身份差异应由 role、name 或后续 participant metadata 表达。
- System 可以作为 message sender 或 event actor，用来表达系统提示或系统事件，但 system 不是 room participant，也不是 RoomMember。
- `Announcement`、`PinnedItem`、`RoomFile`、`PermissionPolicy` 是 Room 的基础 IM 本体，不表达任务、工作流或 runtime 状态。`PermissionPolicy` 只覆盖 room 默认角色权限矩阵，暂不引入企业权限系统。

## 不做

- 不生成 ID，只校验和 parse。
- 不实现 Room runtime、存储、事件总线、HTTP、SSE 或底层 agent 对接。
- 不引入 `@linka/config` 或任何上层包。
- 不引入运行时 dependencies。
- 不把任务状态、工作流步骤或底层会话概念写入 shared contract。

## 验证

必须运行：

```bash
pnpm --filter @linka/shared typecheck
pnpm --filter @linka/shared build
pnpm --filter @linka/shared test
pnpm typecheck
pnpm test
rg "@linka/(config|daemon|ui|harness|cli)" packages/shared || true
rg "taskState|workflowStep|runtimeSession|opencode|sqlite|sse|hono" packages/shared || true
```
