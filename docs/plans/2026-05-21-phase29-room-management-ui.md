# Phase 29 Room Management UI

## 交付范围

- 左侧 `新建 Room` 从静态按钮改为 modal。
- API-backed 模式下，新建 Room 会调用 `POST /linka/rooms`，再自动加入默认 human `Alice` 和默认 agent `LinkA`，随后加载并选中新 Room。
- Daemon 顶栏新增“启动说明”，提供 `pnpm dev` 启动命令和复制按钮，不再出现不可用的下载类假入口。
- 右侧栏改为 Room 管理 tabs：`信息`、`成员`、`公告`、`Docs`、`活动`、`文件`。
- 成员头像和成员行可以打开成员详情面板，展示 kind、role、status、权限摘要和 lastSeen。
- Docs tab 支持点击 Doc 打开详情浏览视图；新建 Doc 成功后会自动选中新 Doc。
- 公告编辑、成员邀请、文件上传、Doc 编辑/评论/版本写入在本阶段明确 disabled，并指向后续 Phase 30/文件阶段。

## 产品边界

本阶段只改 UI 和 UI store，不修改 daemon/shared 契约。Room 仍然是 IM 群聊对象，右侧栏只是 Room 附属能力和 Harness 活动的产品化投影。

Activity 栏仍沿用当前 harness sessions/runs 数据做摘要展示，不新增 task/workflow 状态，也不把 worker/build 状态写入 Room data。

Doc detail 当前只读浏览。编辑、保存、评论和版本写入属于 Phase 30。

## UI 行为

### 新建 Room

- 离线 demo 模式：modal 可打开，但提交按钮 disabled，并提示需要运行 LinkA daemon。
- API 模式：提交后创建 Room，加入 Alice 和 LinkA，加载 members/messages/docs/runs/sessions，选中新 Room。
- 表单会 trim `displayName` 和 `topic`。

### 右侧群管理

- `信息`：显示 Room 名称、topic、默认可见性、通知策略和统计。
- `成员`：显示头像和成员列表，点击后展开详情。
- `公告`：展示公告并标明编辑能力将在 Phase 30 接入。
- `Docs`：保留新建 Doc 表单，列表项可点击查看详情。
- `活动`：展示 harness session/run 的摘要。
- `文件`：展示 Room file 索引，上传按钮暂时 disabled。

## 验证覆盖

- `roomStore.test.ts` 新增 `createRoomWithDefaults` 测试，覆盖 create room、默认成员、加载新 room data 和选中新 room。
- `pnpm --filter @linka/ui typecheck`
- `pnpm --filter @linka/ui test`
- `pnpm --filter @linka/ui build`
- `LINKA_UI_SMOKE_URL=http://127.0.0.1:5173/ pnpm smoke:ui`

## 非目标

- 不实现 daemon 安装器或桌面端启动器。
- 不实现公告 CRUD API。
- 不实现 Doc 更新/评论/版本写入。
- 不实现成员邀请 API。
- 不实现文件上传。
