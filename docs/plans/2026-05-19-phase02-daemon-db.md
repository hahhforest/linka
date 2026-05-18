# Phase 02B Daemon DB

## 目标

建立 daemon 的 SQLite 基础层，提供可幂等运行的 migration 框架和最小 persisted event store。此阶段只落事件表，不实现 Room、Member、Message repository，也不接入 HTTP、SSE 或 UI。

## 实现范围

- `packages/daemon/src/db/connection.ts`：封装 `better-sqlite3` 打开逻辑，支持 `:memory:` 与文件路径，并启用 SQLite foreign key pragma。
- `packages/daemon/src/db/migrations.ts`：创建 `linka_migrations` 元数据表，按版本幂等执行 migration。
- 初始 migration：创建 `daemon_events` 表，使用 `cursor INTEGER PRIMARY KEY AUTOINCREMENT` 作为稳定单调游标。
- `packages/daemon/src/store/event-store.ts`：提供 `append(event)` 与 `listAfter(cursor, limit)`，事件 envelope 是 daemon store 内部最小结构，不向 UI 暴露。
- `packages/daemon/src/db/run-db-tests.ts`：聚合 db/store 测试，便于后续 Lead 接入 daemon test script。

## DB 层不变量

- 调用 `createEventStore(handle)` 前必须先运行 `runMigrations(handle)`；store 创建时会检测 `daemon_events` 表，不满足时抛出可诊断错误：`runMigrations must be called before createEventStore`。
- event cursor 只来自 SQLite `AUTOINCREMENT`，不能用数组下标、时间戳或调用方输入代替。
- `append(event)` 入库前校验最小 envelope：`id` 与 `type` 必须是非空字符串，`createdAt` 必须是非负 safe integer。
- `payload` 必须能稳定 JSON 序列化；`undefined`、循环引用、`BigInt` 等不可序列化值统一抛出 `event payload must be JSON-serializable`。
- `listAfter(cursor, limit)` 要求 cursor 是非负整数，limit 是正整数。

## 边界

本阶段不写 Hono route，不写 SSE/WebSocket endpoint，不实现 Room repository，不使用 in-memory map 作为事实源。事件先持久化到 SQLite，后续 daemon-core / realtime lane 可在此基础上接入内存 pub/sub。

## 验证

单元测试使用 SQLite `:memory:` 数据库，不污染项目目录。当前 `@linka/daemon` 的 `test` script 仍是占位命令，db/store 测试可以通过 `pnpm --filter @linka/daemon exec tsx src/db/run-db-tests.ts` 直接执行；是否纳入 package test script 需要 Lead 后续统一。
