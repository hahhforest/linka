# Phase 02C UI Shell

## 目标

Phase 02C 只交付 Web UI 的 room workspace 外壳。首屏直接展示 Agent Team 的 room 现场：左侧 room nav，中间 timeline，右侧 member rail，顶部 daemon connection 状态。

本阶段不接真实 room API，不引入 WebSocket 或 SSE。daemon 离线时，UI 显示 offline/error banner，同时继续展示 fixture 中的 demo room。

## 实现范围

- `packages/ui/src/fixtures/demoRoom.ts` 使用 `@linka/shared` 的 Room、RoomMember、RoomMessage、RoomFile、Announcement、PinnedItem 类型构造 demo room。
- `demoRoom.ts` 的 ID 全部通过 `@linka/shared` 的 `roomId`、`roomMemberId`、`roomMessageId`、`participantId`、`attachmentId`、`roomFileId`、`announcementId`、`pinnedItemId` constructors 创建，不用强制断言绕过 shared contract。
- `packages/ui/src/fixtures/demoRoom.test.ts` 提供可用 `tsx` 直接运行的最小 sanity test；UI test script 接入后续由 Lead 统一处理，本 lane 不改 `package.json`。
- `packages/ui/tsconfig.json` 保持 Web app 类型环境，只启用 `vite/client`，不引入 Node types。
- `packages/ui/tsconfig.test.json` 专门给 fixture sanity test 使用，Node 类型只在 test tsconfig 中启用。
- `packages/ui/src/services/apiClient.ts` 统一封装 HTTP JSON GET。
- `packages/ui/src/services/healthService.ts` 负责 GET `/linka/health` 并归一化 health snapshot。
- `healthService` 对 `status` / `message` 的兼容解析仅用于 daemon-core 尚未合入前后 UI 都能显示连接状态，不定义新的 health contract。
- `packages/ui/src/store/connectionStore.ts` 使用 zustand 管理 daemon connection 状态。
- `packages/ui/src/app/App.tsx` 只装配 demo room 与 connection store，不直接 fetch。
- `packages/ui/src/components/shell/**` 承载 room workspace 和 daemon connection bar。
- `packages/ui/src/components/room/**` 承载 room nav、timeline、member rail、composer 展示组件。
- `packages/ui/src/styles/main.css`、`packages/ui/tailwind.config.cjs`、`packages/ui/postcss.config.cjs` 建立 Tailwind 3 样式链路。

## Demo Room 内容

Demo room 覆盖 MVP 关键现场：

- 用户成员。
- LinkA agent member。
- 资料 Agent。
- 核验 Agent。
- 系统消息。
- 证据附件和 room file。
- LinkA 主动邀请用户判断。
- 一次用户干预，并影响后续 room 判断标准。

## 后续边界

Phase 02C 不处理真实 send API、realtime、Playwright smoke、room API 数据装载或 daemon/db schema。Phase 03 可以在这个 shell 上替换 fixture 数据源，并补浏览器级 smoke test。
