# Phase 01B config/profile 实施记录

## 范围

实现 `@linka/config` 叶子包的配置/profile 层，只覆盖环境变量、profile、路径、端口和 PID file。

## Public API

- `DEFAULT_PORT`
- `ConfigError`
- `getProfile(options?)`
- `getDataDir(options?)`
- `resolvePort(options?)`
- `getPidFilePath(options?)`
- `parsePidFile(content)`
- `formatPidFile(record)`
- `readPidFile(options?)`
- `writePidFile(record, options?)`
- `removePidFile(options?)`
- `getRunningDaemonPort(options?)`

## Profile 契约

- `LINKA_PROFILE` 优先；显式 profile 只 sanitize，不追加 hash，保证 CLI/daemon 用户可预测。
- 无 `LINKA_PROFILE` 时从 git branch 与 resolved `worktreeRoot` / `cwd` 自动派生，并追加 8 位稳定短 hash。
- `main` / `master` / `trunk` 保留为 `main`。
- 自动派生的非 main 形态为 `<sanitized-source>-<8hex>`，hash 输入至少包含 sanitized source 与 resolved worktree root / cwd，避免同分支或同名目录 worktree 撞 profile。`profile` option 也是显式语义：传入值 sanitize 后直接使用，不追加 hash。

## PID file 契约

PID file 为当前 profile 的 `dataDir/daemon.pid.json`，内容字段固定为：

- `version: 1`
- `profile`
- `pid`
- `port`
- `dataDir`
- `cwd`
- `startedAt`

`parsePidFile()` 严格校验版本、profile、pid、port、绝对路径和启动时间。`readPidFile()` 只接受当前 profile 的 PID file；profile mismatch 返回 `null`，不跨 profile fallback。`writePidFile()` 如果传入 profile 与当前 profile 不一致，会拒绝写入。

`getRunningDaemonPort()` 当前只读取当前 profile 的 PID file 并返回端口，不做进程存活检测。stale PID 检测和进程扫描 defer 到 daemon lifecycle，避免 config 叶子包承担进程管理职责。

## 边界

- `@linka/config` 不依赖任何 `@linka/*` 内部包。
- 不包含 Room / Message / Event 业务类型。
- 不包含 Hono / SQLite / SSE / OpenCode / runtime session 逻辑。
- PID file 只读取当前 profile 的 dataDir，不跨 profile fallback。

## 验证

按任务要求运行：

- `pnpm --filter @linka/config test`
- `pnpm --filter @linka/config typecheck`
- `pnpm --filter @linka/config build`
- `pnpm typecheck`
- `pnpm test`
- `rg "@linka/" packages/config || true`
- `rg "Room|Message|Event|Hono|SQLite|SSE|OpenCode|runtimeSession" packages/config || true`
