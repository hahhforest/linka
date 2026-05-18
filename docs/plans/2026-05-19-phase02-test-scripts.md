# Phase 02 Test Script Integration

## 目标

把 Phase 02 已经落地的 daemon 与 UI 测试接入各 package 的 `test` script，使根级 `pnpm test` 通过 turbo 实际运行这些质量门槛，不再只输出占位信息。

## 范围

本 lane 只更新 package test script，不修改业务源码、测试源码、根配置、lockfile 或 shared/config/harness/cli 包。

- `@linka/daemon` 的 `test` 先运行 daemon core Node test，再运行 DB/store 聚合 runner。
- `@linka/ui` 的 `test` 先使用 `tsconfig.test.json` 做测试类型检查，再运行 demo room fixture sanity test。

## 命令

Daemon test script：

```sh
node --import tsx --test src/app.test.ts src/container/index.test.ts src/server.test.ts && tsx src/db/run-db-tests.ts
```

UI test script：

```sh
tsc -p tsconfig.test.json --noEmit && tsx src/fixtures/demoRoom.test.ts
```

## 验证计划

- `pnpm --filter @linka/daemon test`
- `pnpm --filter @linka/ui test`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm format`
- `git diff --name-only`
