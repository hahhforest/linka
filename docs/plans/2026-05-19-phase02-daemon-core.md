# Phase 02A Daemon Core

## 目标

建立 LinkA Daemon 的最小 Hono core，只提供本地 daemon 的装配、健康检查、统一错误响应和可测试的 Node server 包装。

## 范围

本 lane 只覆盖：

- `createDaemonContainer(options?)`：静态依赖 `@linka/config`，读取 profile、port、dataDir，并保存 version、startedAt、uptimeMs 等进程级信息。
- `createDaemonApp(container)`：创建 Hono app，base path 为 `/linka`。
- `GET /linka/health`：返回 daemon 非业务健康信息。
- `createDaemonServer(options)`：包装 `@hono/node-server`，提供 `serveHTTP`、`start`、`shutdown`。
- `src/index.ts`：作为进程入口，只做 container/app/server 装配和信号处理。

## 非目标

本 lane 不实现 Room CRUD、SQLite、SSE、WebSocket、workflow/task 业务状态，也不修改 shared/config/ui/cli/harness 或根配置。

## Config 依赖与 TypeScript 输出

Daemon core 使用静态 import 依赖 `@linka/config` 的 `getProfile`、`getDataDir`、`resolvePort`。

Container 对显式 `profile` 通过临时注入 `LINKA_PROFILE` 调用 `getProfile`，复用 config 的显式 profile 规范化语义，不从 `dataDir` 路径反推。

`packages/daemon/tsconfig.json` 不覆盖根 `paths`。为避免静态引用 config 源码时触发 `rootDir` 越界，daemon tsconfig 移除了 `rootDir` 并保留 `outDir`。这样 clean checkout 下 `pnpm --filter @linka/daemon typecheck` 不依赖预先 build 的 `packages/*/dist`。

当前 daemon build 输出为嵌套结构：`packages/daemon/dist/daemon/src/...` 与 `packages/daemon/dist/config/src/...`。该结构不写入源码目录。

## API

### Health

`GET /linka/health`

返回字段：

- `ok: true`
- `profile`
- `port`
- `dataDir`
- `version`
- `startedAt`
- `uptimeMs`

错误响应使用统一基础格式：

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found"
  }
}
```

## 验证计划

从删除所有 `packages/*/dist` 后验证：

- `pnpm --filter @linka/daemon typecheck`
- `pnpm typecheck`
- `pnpm --filter @linka/daemon build`
- `pnpm build`
- daemon test script 当前仍是占位；如不改 `package.json`，使用 `pnpm exec node --import tsx --test packages/daemon/src/app.test.ts packages/daemon/src/container/index.test.ts packages/daemon/src/server.test.ts` 直接运行测试文件。
- `pnpm test`
- `rg "Room|Message|SQLite|better-sqlite3|EventSource|WebSocket|workflow|task" packages/daemon/src || true`
