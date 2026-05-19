# Phase 03 CLI Lifecycle

## 目标

实现 LinkA CLI 的最小 daemon lifecycle 与 smoke 操作，让本地 profile 对应的 daemon 可以被 CLI 启动、探活，并通过 HTTP API 创建 room、发送 message。

## 范围

本阶段只覆盖 `@linka/cli`：

- `linka health`：读取当前 profile 的 PID file port；没有 PID file 时 fallback 到 resolved port；请求 `GET /linka/health` 并输出 JSON。
- `linka start --once`：启动 daemon、写入当前 profile 的 PID file、验证 health，然后 shutdown 并移除 PID file。
- `linka start`：前台启动 daemon，不做长期后台 daemonize；收到 `SIGINT` / `SIGTERM` 后 shutdown 并移除 PID file。
- `linka rooms create <name>`：请求 `POST /linka/rooms`，输出 daemon 返回 JSON。
- `linka messages send <roomId> <senderMemberId> <text>`：请求当前 daemon 的 room message endpoint，输出 daemon 返回 JSON。

## 实现约束

- CLI 使用简单 argv parser，不引入 commander / yargs / execa。
- lifecycle 依赖 `@linka/config` 的 profile、dataDir、port 和 PID file API。
- CLI 运行时动态加载 daemon start helper，避免新增 lockfile 变更。
- `start --once` 用于测试与 smoke，不留下长期进程。

## 验证

CLI lane scoped 验证：

- `pnpm --filter @linka/cli test`
- `pnpm --filter @linka/cli typecheck`
- `pnpm --filter @linka/cli build`
- `pnpm format`
- `rg "commander|yargs|execa" packages/cli package.json pnpm-lock.yaml || true`

全仓 `pnpm test/typecheck/build` 需要先由对应 lane 修正 config build 输出路径，避免在 `packages/config/src` 生成构建产物。
