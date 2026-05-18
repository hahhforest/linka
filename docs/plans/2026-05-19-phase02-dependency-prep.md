# Phase 02 Dependency Prep

## 目标

Phase 02 会并行推进 daemon-core、daemon-db、daemon-sse、ui-shell 等 lane。依赖清单和 lockfile 是共享热点文件，本 lane 先统一安装后续 lane 明确需要的基础依赖，避免多个 worker 同时修改 `package.json` 与 `pnpm-lock.yaml` 造成冲突。

## Daemon 依赖

- `hono`：daemon-core lane 用于建立 Hono app、health route 与统一 HTTP 入口。
- `@hono/node-server`：daemon-core lane 用于本地 Node HTTP server 启停与开发环境验证。
- `better-sqlite3`：daemon-db lane 用于本地 SQLite 持久化，支撑 Room、Member、Message、Event 等事实源。
- `@types/better-sqlite3`：daemon-db lane 的 TypeScript 类型依赖，保持 repository 与 migration 代码可 typecheck。

## UI 依赖

- `zustand`：ui-shell 与后续 UI realtime lane 用于状态管理和轻量 store slice。
- `tailwindcss@3`：ui-shell lane 的样式基础依赖；本 lane 只安装依赖，不生成 Tailwind 配置。
- `postcss`：Tailwind 构建链路需要的 PostCSS 基础依赖。
- `autoprefixer`：Tailwind/PostCSS 构建链路的浏览器前缀处理依赖。

## 边界

本 lane 不写 daemon 或 ui 源码，不生成 Tailwind 配置，不修改 shared/config、根配置、README 或内部文档。后续 worker 可以直接基于已更新的 workspace package 与 lockfile 实现各自 lane。
