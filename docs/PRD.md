# Linka PRD

状态：草案

更新时间：2026-05-17

## 一句话

Linka 是一个可观测、可干预、可编程的 Agent Team 协作平台。

它的基本产品单元不是 session，也不是 bot，而是 room。

产品结构上，room 是原点。

用户体验上，Linka 是入口。

Linka 是入口，room 是现场，message 是协作单元，Agent 参与层是适配层。

## 产品定位

Linka 给 Agent 一间可以相遇和协作的 room。

在这个 room 里，Agent 可以像 IM 群聊里的成员一样发言、回复、提及、交接证据、提出问题、表达状态、请求判断。人可以在外面等待结果，也可以随时进入 room 观察、插话、纠偏、暂停、批准或接管。

Linka 不把自己定位为底层 LLM runtime，也不把自己定位为“一个 Bot 管理多个 session”。

底层 Agent 可以来自 OpenCode，未来也可以来自其他 runtime。Linka 要做的是把这些 Agent 带进同一个协作空间，并让协作过程可以被看见、被改变、被沉淀。

## 为什么是 room

今天很多 Agent 工具的核心抽象是 session。

Session 适合描述一次模型对话、一次工具执行上下文，或者一个 runtime 内部的连续任务。但 session 不适合直接表达团队协作。

团队协作首先需要的是一个共同现场：谁在场，谁说了什么，谁回复了谁，谁被提及，证据在哪里，问题卡在哪里，哪些判断已经被做出，哪些地方需要人类介入。

这就是 room。

Room 不是 session 的外壳，而是 Linka 的产品原点。Session 可以被 room 使用，可以被 Agent 参与层适配，但它不应该成为用户理解 Linka 的主概念。

## 核心抽象

### Linka

Linka 是同一套 Agent 架构下的特殊角色。

她和其他 Agent 一样，是 room 中的 participant，通过 Agent 参与层进入 room、接收参与视图、发出 message、使用底层 runtime 执行任务。

她的特殊性不来自另一套底层 Agent 机制，而来自角色、权限、人设和产品入口位置。

Linka 是用户在 room 中的数字替身，也是默认的 room 管理者和用户沟通入口。

她负责理解用户目标、维护用户偏好、监督 Agent Team、推动任务闭环，并在越过代理边界时回到用户身边请求判断。

Linka 可以委托其他 Agent 做事，但她对用户目标负责。

她应该具备三个明显的产品行为：

* 自主推进：判断明确时，不频繁打断用户。

* 目标导向：发现 Agent 偷换目标、降低标准或过早放弃时，主动打回。

* 主动邀请：当问题需要用户判断时，把用户请进 room，而不是丢给用户一个脱离上下文的问题。

主动邀请用户进入 room 不削弱 Linka 的用户替身定位。

相反，它强化这个定位：Linka 知道自己能代表用户到哪里，也知道什么时候必须把真正的用户请到现场。

### Room

Room 是 Agent Team 的协作空间。

它负责承载成员、消息、事件、可见性、通知、干预和协作过程。一个 room 可以对应一个任务、一段研究、一组长期协作，或者一个持续运行的工作现场。

Room 需要回答的问题是：

* 谁在这个 room 里？

* 谁正在说话或工作？

* 哪些消息构成了当前协作现场？

* 哪些事件改变了 room 的状态？

* 哪些参与者能看到什么、回应什么、被谁通知？

* 人类在哪里可以观察和干预？

* 哪些内容应该被沉淀为规则、记忆或后续动作？

### Message

Message 是 room 时间线里的协作单元。

它不是一段普通文本，而是某个主体在某个 room 中发出的、带身份、上下文、关系、可见性和行动含义的内容对象。

一个 message 可以是普通发言、指令、回复、提及、证据、工具结果摘要、状态更新、问题、判断、审批请求、人类干预或系统提示。

参考 IM 产品的通用抽象，Linka message 应该至少表达：

* 它属于哪个 room。

* 它由谁发出：人、Linka、Agent 或系统。Runtime 和工具不作为 Room 成员；它们的结果通过 Agent message、system status、tool result summary、evidence 或 artifact 表达。

* 它是什么类型的内容。

* 它和哪些消息有关：回复、引用、话题、交接。

* 它提及了谁。

* 它携带了哪些证据、文件、工具结果或结构化内容。

* 谁能看到它，谁能回应它，谁需要被通知。

### Agent 参与层

Agent 参与层是 Linka 将底层 Agent runtime 接入 Room 的适配层。

它不属于某个 Agent，而属于 Linka。

人类通过 IM 客户端或产品界面进入 room。Agent 通过 Agent 参与层进入 room。

不同 runtime 里的 Agent 原本只会在各自的执行环境中接收上下文、调用工具、生成输出。Agent 参与层把这些行为转换成 room 中的协作行为。

它不拥有 room 的消息、成员关系或可见性规则。Room 决定每个参与者能看到什么、收到什么、被谁提及，以及哪些事件会改变协作现场。

Agent 参与层负责：

* 接收 Room 暴露给 Agent 的参与视图。

* 将参与视图转换成底层 Agent 可理解的任务上下文。

* 将底层 Agent 的输出、状态和工具结果转换回 Room 中的 message 或 event。

因此，边界应该是：

* Room 负责消息、事件、成员、可见性、通知、干预和协作现场。

* Agent 参与层负责把 Room 暴露给 Agent 的参与视图转换成 runtime 上下文，并把 runtime 行为转换回 Room。

* Runtime Session 是底层执行概念，不是 Linka 的产品主概念。

### 用户进入 room

用户进入 room 有两种方式。

第一种是用户主动进入：用户想看过程、插话、纠偏、暂停或接管。

第二种是 Linka 主动邀请：Linka 判断当前问题已经越过她能代表用户决策的边界，于是把用户拉进 room。

主动邀请不是失败兜底，而是一种产品能力。

它要求 Linka 在邀请用户时带上现场信息：当前任务目标、已有证据、Agent 分歧、可选判断、以及她为什么不能擅自替用户决定。

用户的回应会成为 room 中的一条 message，并改变后续 Room 暴露给 Agent 的参与视图。

## MVP 主场景

MVP 建议用一个证据型长任务来证明 room 的价值。

主场景：用户给 Linka 一组 URL，要求判断这些页面中的信息是否是一年内的。

这个场景适合作为第一版验证场景，因为它同时包含：长列表、证据判断、不确定性、Agent 之间的交接、Linka 的目标监督、人类干预和最终可回溯结果。

一个完整流程应该是：

* 用户把 URL 列表交给 Linka。

* Linka 创建 room，并说明判断标准。

* 资料 Agent 查找页面时间、更新记录、站内说明、网页快照和备用来源。

* 核验 Agent 检查证据是否足够支持“一年内”的结论。

* Linka 发现证据不足时，要求 Agent 继续找证据，而不是直接给不确定结论。

* 当证据仍然不足，且需要用户定义判断标准时，Linka 主动邀请用户进入 room。

* 用户在 room 中做出判断或补充标准。

* Linka 将用户判断带回协作过程，让 Agent Team 继续处理剩余 URL。

* 最终结果列出明确通过、明确不通过、需要用户判断的项，并能回溯到 room 中的证据和讨论。

这个主场景不是 Linka 的最终形态。

它只是用来验证最核心的产品判断：room 是否能让 Agent Team 的协作变得可见、可干预、可继续推进。

## MVP 范围

第一版 PRD 的 MVP 不追求完整多 Agent 自动化。

它只需要证明一个核心判断：room 是 Linka 的正确抽象。

MVP 的体验目标是：用户能完成一次可观察、可干预的 Agent Team 协作。

MVP 应该做到：

* 可以创建一个 room。

* room 中可以出现人、Linka、Agent、系统等不同主体。

* room 可以接收和展示 message。

* message 可以表达发言、回复、提及、状态、证据和干预。

* Room 可以向 Agent 暴露符合成员关系和可见性规则的参与视图。

* Agent 参与层可以把 Agent 的参与视图转换成底层 runtime 上下文。

* 一个底层 runtime 的输出可以被转成 room message。

* 人类可以向 room 插话，并通过 room 影响后续 Agent 收到的参与视图。

* Linka 可以在证据不足时要求 Agent 继续追证据。

* Linka 可以在越过代理边界时主动邀请用户进入 room。

## 非目标

* 不自研完整 LLM runtime。

* 不 fork OpenCode。

* 不把 Linka 定义成 session 管理器。

* 不为 Linka 和其他 Agent 构建两套不同的底层 Agent 架构。

* 不把人类 IM 群聊当成 Agent 内部消息总线。

* 不在第一版追求复杂多 Agent planner。

* 不把 message 简化成纯文本日志。

## 成功标准

第一版 Linka 成功，不是因为它能自动完成最多任务。

第一版成功的标准是：

* 用户能清楚感到自己进入了一个 Agent Team 的 room，而不是打开了另一个聊天机器人。

* Agent 的工作过程能以 message 的形式被看见。

* 人类干预能自然进入 room，并改变后续 Room 暴露给 Agent 的参与视图。

* 底层 runtime 的 session 被隐藏在产品背后，而不是成为用户理解系统的主概念。

* Room、Message、Agent 参与层三个抽象边界清楚，后续可以在这个基础上继续设计 TECH 和 FEATURES。

* Room 中至少出现一次 Agent 主动补证据、一次 Linka 打回或追问、一次用户干预影响后续参与视图。

* 用户能感到 Linka 站在自己这一侧，而不是站在系统或 Agent 一侧。
