# LinkA TECH

状态：草案

更新时间：2026-05-17

## 一句话

LinkA 的技术核心不是 Agent runtime，而是 room runtime。

这里的 room 首先是 IM 群聊对象，不是任务执行单元。OpenCode 负责执行智能任务，LinkA 负责让用户和 Agent 在同一个本地群聊基础设施中相遇、发言、管理成员、沉淀公告和共享材料。

整体边界是：

```text
Human Clients
Desktop / Web / CLI / IM Bridge
        |
        v
LinkA API
HTTP / WebSocket / local IPC
        |
        v
LinkA Daemon
Room Runtime / Message Store / Event Bus / Permissions / LinkA Harness Manager
        |
        v
LinkA Harness
Context Projection / Runtime Adapter / Tool Result Normalization / Policy
        |
        v
Agent Runtimes
OpenCode first, later other runtimes
```

## 已确定的技术方向

### 本地优先

LinkA 是运行在用户本地的产品。

当前不考虑云端架构。

所有核心数据优先落在本地。未来如果出现同步、备份或远程协作需求，再单独设计，不提前把云端复杂性带进 v0。

### Daemon

LinkA 需要一个本地常驻进程，也就是 LinkA Daemon。

Daemon 是软件工程里常见的抽象：一个在后台运行、长期存在、对外提供服务的进程。它通常不直接面向用户界面，而是负责管理状态、处理请求、调度任务、监听事件、维护连接。

在 LinkA 中，Daemon 是本地协作中枢。

它负责：

* 管理 room 生命周期。

* 存储和分发 message / event。

* 维护成员、可见性、通知和干预状态。

* 对外提供 HTTP / WebSocket / local IPC。

* 管理 LinkA Harness 和底层 Agent runtime 的连接。

* 将 UI、CLI、IM bridge、Agent runtime 接到同一个本地 room 基础设施。

Daemon v0 使用 TypeScript / Node.js。

暂时不使用 Rust。LinkA 早期的难点是产品抽象、room 语义、实时协作和 runtime 边界，不是底层性能。TypeScript 更利于快速迭代，也方便和 UI、SDK、schema 共享类型。

### UI

UI 使用 React + Vite SPA。

当前 TECH 不展开 UI 页面设计。

原则上，UI 是 LinkA Daemon 的客户端，用来进入 room、观察协作过程、插话和干预。

后续桌面端可以使用 Tauri 包裹同一套 Web UI，但 v0 不把 Tauri 作为必须前提。

### 存储

本地存储使用 SQLite。

SQLite 是 room、message、event、room member、announcement、pinned item、room file、runtime session、harness run 等结构化数据的主存储。

文件系统用于保存附件、截图、网页快照、导出 transcript、Agent 产物等大文件或非结构化内容。

原则：

* SQLite 是协作事实的来源。

* 文件系统保存大对象和可导出产物。

* 不用纯文件日志作为主存储，因为 room 群聊需要查询、过滤、关联、历史同步和恢复。

### 通信协议

Client 与 LinkA Daemon 的通信优先使用：

* HTTP：用于命令和查询。

* WebSocket：用于实时 room event 推送。

* local IPC：用于本地桌面端或 CLI 的高便利集成，后续再定。

v0 不过度 protocol 化。

先把本地 domain model、room runtime 和 harness 边界做清楚。开放协议可以在稳定抽象之后自然长出来。

## 事件总线

### 软件工程里的事件总线是什么

事件总线是一种解耦系统内部组件的通信抽象。

一个组件不直接调用另一个组件，而是发布一条事件：

```text
MessageCreated
ParticipantJoined
InterventionSubmitted
RuntimeOutputReceived
```

其他关心这类事件的组件订阅它，然后各自做自己的事。

它通常负责：

* 解耦模块：发送者不需要知道谁会处理事件。

* 传播状态变化：把系统中发生的事情通知给 UI、worker、adapter、logger。

* 支持实时更新：例如 WebSocket 客户端收到新消息。

* 支持审计和回放：如果事件被持久化，就能知道系统发生过什么。

* 支持异步处理：某些事情不必在当前请求里同步完成。

### LinkA 中的事件总线

LinkA 的事件总线负责把 room 中发生的事情变成可持久、可分发、可订阅的 event。

它不是 Kafka / NATS / Redis 这类外部系统。

v0 使用 Daemon 内部事件总线：

```text
Command -> Domain Event -> SQLite append -> In-memory pub/sub -> WebSocket / Harness / UI
```

原则是：先持久化，再广播。

也就是说，room 中发生的关键事情应该先写入 SQLite，再通过内存 pub/sub 推送给 UI、LinkA Harness、IM bridge 或其他订阅者。

在 LinkA 中，事件总线负责：

* 把新 message 推送到 room UI。

* 通知 LinkA Harness 某个 Agent 被提及或需要继续执行。

* 通知 LinkA 本人用户已经进入 room 或提交了判断。

* 通知 IM bridge 哪些内容需要同步到飞书 / Slack 等外部入口。

* 记录 room 的协作过程，使过程可回放、可分析、可恢复。

事件总线不负责：

* 决定 Agent 应该看到什么上下文。

* 调用模型。

* 执行工具。

* 代替 room 做权限判断。

这些分别属于 LinkA Harness、Agent runtime 和 Room Runtime。

## Room 的职责范围

Room 是 LinkA 的产品原点和核心 domain object。

Room 不是任务现场，也不是 workflow run。它首先是一个 IM 群聊聚合根，类似 QQ 群。

Room 负责群聊基础设施本身：

* 群资料：群名、头像、简介、公告。

* 群成员：用户和 Agent 在这个 room 中的成员关系。

* 群角色：群主、管理员、普通成员等管理身份。

* 群消息：文本、提及、回复、引用、附件、系统消息。

* 群公告 / 公告板：长期重要信息、群规、协作约定。

* 群置顶：被置顶的消息、公告、文件或链接。

* 群文件：room 内共享的材料和附件索引。

* 群权限：谁能发言、邀请、踢人、改公告、置顶、上传文件、查看历史。

* 群历史：消息历史、游标、未读、入群前历史可见性。

Room 中的参与者只有用户和 Agent。

外部 IM 是用户接入 LinkA 的通道，不是 Room 里的成员。工具、规则、系统也不是成员；它们可以作为消息、公告、文件、权限或系统事件出现。

Room 不负责：

* 理解任务是否完成。

* 维护 workflow 状态。

* 记录“当前卡在哪里”这类任务状态。

* 调模型。

* 执行 shell。

* 修改代码。

* 做浏览器自动化。

* 压缩 token。

* 适配 OpenCode。

这些属于 LinkA Harness、底层 Agent runtime 或更上层的任务系统。

Agent 协作扩展可以建立在 Room 之上，但不能污染 Room 本体。

例如公告板。对于人，它应该是方便阅读和编辑的公告或文档；对于 Agent，它未来可能需要结构化条目、读写锁、版本记录或机器友好的索引。具体实现等做到时再定，但对象边界应该清楚：Room 提供公告板能力，Agent 协作层在公告板之上发展自己的读写协议。

## LinkA Harness 的职责范围

规范命名：**LinkA Harness**。

LinkA Harness 是完整的、自闭环的一层。

它不只是 LinkA Daemon 的内部 helper。单独拿出来，它应该像 OpenClaw、Hermes 等 harness 层产品一样，可以作为一套可用的 Agent 参与层。

LinkA Harness 的核心职责是：

> 把 room 的群聊上下文投影给某个 Agent，并把 Agent 的行为翻译回 room。

它负责：

* Context Projection：决定某个 Agent 应该看到哪些 room message、公告、置顶、群文件、成员信息、规则和用户偏好。

* Context Packing：在 token 限制下做摘要、压缩、排序和格式化。

* Role Framing：注入 Agent 的职责、边界、语气和参与方式。

* Runtime Adapter：把参与视图转换成 OpenCode 或其他 runtime 可以消费的输入。

* Output Translation：把 runtime 输出转换成 room message、artifact、status 或 event。

* Tool Result Normalization：把工具结果转换成 room 能理解的证据、附件、状态或摘要。

* Intervention Feedback：让底层 Agent 在后续执行时看到用户插话、LinkA 打回、规则变化等 room 事件。

* Policy Enforcement：执行 room 授权、工具权限、可见性和人工确认边界。

LinkA Harness 不负责：

* 拥有 room。

* 存储 room message。

* 管理 room 成员关系。

* 替 LinkA 做最终用户判断。

* 成为新的 workflow engine。

一句话：

Room 是现场。

LinkA Harness 是参与层。

Runtime 是执行者。

## OpenCode 的职责范围

OpenCode 是第一阶段的底层 Agent runtime。

它负责实际智能执行：

* 接收 LinkA Harness 投影出来的上下文。

* 调用模型。

* 调用工具。

* 读写文件。

* 执行 coding / research / test 等具体任务。

* 返回输出。

* 维护自己的 runtime session。

OpenCode 不负责：

* room 成员关系。

* room message 存储。

* 用户长期偏好。

* 人类何时介入。

* 多 Agent 的可见性规则。

* LinkA 的 message schema。

* 最终协作记录。

OpenCode 是会干活的人。

LinkA 是房间、群聊秩序、成员关系和记录。

## LinkA 本人的职责范围

LinkA 本人运行为一个特殊 participant。

她和其他 Agent 一样，通过 LinkA Harness 进入 room、接收参与视图、发出 message、使用底层 runtime 执行任务。

她的特殊性不来自另一套底层 Agent 机制，而来自角色、权限、人设和产品入口位置。

LinkA 是用户在 room 中的数字替身，也是默认的 room 管理者和用户沟通入口。

她负责：

* 理解用户目标。

* 维护用户偏好。

* 监督 Agent Team。

* 打回偷换目标、降低标准、过早放弃的 Agent 行为。

* 在判断明确时替用户继续推进。

* 在越过代理边界时主动把用户请进 room。

用户在 room 中时，可以 @ 任意对象。

LinkA 不是唯一可以被 @ 的对象。

用户可以 @ LinkA，也可以 @ 某个具体 Agent。

## MVP 技术路线

v0 的技术路线：

* Local Daemon：TypeScript / Node.js。

* UI：React + Vite SPA。

* Storage：SQLite + filesystem artifacts。

* Realtime：WebSocket。

* Event Bus：SQLite 持久事件 + Daemon 内存 pub/sub。

* First Runtime：OpenCode。

* Product Core：Room Runtime，优先按 IM 群聊聚合根设计。

* Agent Layer：LinkA Harness。

* LinkA Herself：特殊 participant，而不是 hardcoded service。

MVP 要证明的不是复杂多 Agent 自动化。

MVP 要证明的是：Agent 能像群成员一样进入 room，读取公告、接收提及、发消息、引用历史，并被用户和 LinkA 在群里自然干预。

## 暂不展开

本 TECH 当前不展开：

* UI 主要页面。

* 完整字段设计。

* 多 runtime adapter。

* 云端同步。

* 复杂 workflow builder。

* 任务状态系统。

* 企业权限系统。

这些内容等 room、LinkA Harness、OpenCode adapter 和事件流边界更稳定后再进入设计。

## 需要继续讨论的问题

### 如何避免 room 退化成漂亮日志

这是最关键的风险之一。

如果 room 只是展示底层 runtime 的输出，那它只是漂亮日志。

但避免这个问题，不是把任务状态塞进 Room。

正确方向是让 Agent 真正以群成员身份参与 room：

* Agent 能读取群公告、置顶和历史消息。

* Agent 能被用户或其他 Agent @。

* Agent 能回复、引用、上传文件和更新公告板。

* 用户在 room 里的发言能进入后续 Agent 的 LinkA Harness 参与视图。

* LinkA 的打回和纠偏表现为群消息、公告板更新或置顶变化，而不是外部日志。

换句话说：

如果 Agent 只是把结果倒进 room，它就是日志。

如果 Agent 把 room 当成群来读、写、回应、协作，它才是 LinkA 的 room。
