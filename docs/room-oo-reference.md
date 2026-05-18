# Room 面向对象参考：从 QQ 群到 LinkA Room

状态：草案

更新时间：2026-05-17

## 为什么看 QQ 群

LinkA 的 room 不应该先被理解成任务容器，也不应该先被理解成 workflow run。

更准确的类比是 QQ 群：一个多人长期存在的群聊空间。它有成员、有消息、有群公告、有群文件、有群主和管理员，也有邀请、退群、禁言、置顶、历史记录这些群管理能力。

群里的人可以讨论任务，但“任务”不是群对象本身。

这个区别很重要。如果我们把任务状态塞进 Room，本体就会被上层业务污染。正确的顺序应该是：先把 Room 建成稳定的 IM 群聊基础设施，再让 LinkA、Agent、任务系统、Harness 在这个基础设施上协作。

## QQ 群的对象感

QQ 群最值得参考的不是某个具体 API，而是它的对象边界。

一个 QQ 群不是消息列表。它是一个聚合对象。群名、群头像、群公告、群成员、群主、管理员、群文件、群消息、群权限和群历史都围绕这个对象组织。

同一个用户在不同群里不是同一个“成员关系”。他可以在 A 群是管理员，在 B 群是普通成员；在一个群有群名片，在另一个群没有；在一个群被禁言，在另一个群可以发言。因此“用户”和“群成员”必须分开理解。

消息也不是单纯字符串。它有发送者、时间、顺序、引用、回复、撤回、附件和原始平台定位信息。群文件和群公告也不是普通聊天文本，而是群的附属能力。

从面向对象角度看，QQ 群更像这样：

```text
Group
  Profile: 名称、头像、简介、公告
  Members: 群主、管理员、普通成员
  Messages: 群消息流、顺序、引用、撤回
  Announcements: 群公告
  Pins: 群置顶
  Files: 群文件
  Permissions: 发言、邀请、踢人、禁言、改公告等权限
  History: 历史消息、未读、漫游、入群前历史可见性
```

这些对象共同构成“群”。它们不是任务系统，也不是 Agent 执行状态。

## 开源 QQ 生态的启发

Mirai、oicq、OneBot、NapCat、Lagrange 等项目虽然实现方式不同，但它们给出的抽象高度一致。

Mirai 和 oicq 更接近面向对象模型。它们通常会把 `Group`、`Member`、`Friend`、`Message`、`GroupFile` 分开。尤其重要的是，`Member` 不是 `User`。成员是“某个用户在某个群里的关系”。这个关系包含群名片、权限、入群时间、禁言状态等群内属性。

OneBot 更像 RPC 和事件 DTO。它不会强行暴露复杂对象，而是提供 `send_group_msg`、`set_group_ban`、`set_group_admin`、`get_group_member_info` 这样的动作。它的价值在于提醒我们：群对象的行为应该最终能转成明确命令，不能只停留在抽象名词。

NapCat 和 Lagrange 更强调协议适配边界。它们内部有 QQ / NTQQ 的复杂 ID、消息定位、文件定位和权限细节，但对外会尽量提供更稳定的对象或 API。这个经验对 LinkA 很重要：LinkA Room 不应该暴露 OpenCode、QQ、飞书或其他 runtime 的内部字段。那些应该留在 adapter 或 harness 层。

## 经典 IM 的共同模型

Matrix、Slack、Discord、Telegram、XMPP MUC、Mattermost、Rocket.Chat 的群聊模型也有类似共性。

它们都会把 Room / Channel / Chat 当成多人消息上下文，而不是任务对象。

这些系统共同关心：谁在房间里，谁能发言，谁能管理成员，消息如何排序，历史如何拉取，公告或 topic 写在哪里，文件如何挂到消息上，bot 以什么身份加入。

不同系统的层级不同。Discord 有 Guild 和 Channel，Slack 有 Conversation，Matrix 有 Room 和 State Events，Telegram 有 Chat 和 ChatMember，XMPP MUC 有 room JID 和 occupant。但抽象的核心很稳定：

> Room 是通信上下文，Member 是人在 room 中的关系，Message 是 room 中的发言记录，Permission 决定成员能做什么。

这给 LinkA 的启发是：先做最小通用 Room，不要过早引入任务状态、workflow state 或 Agent 内部状态。

## LinkA Room 应该采用什么

LinkA Room 应该采用 IM 群聊的稳定对象：Room、RoomMember、RoomMessage、Announcement、PinnedItem、RoomFile、PermissionPolicy、History。

Room 是聚合根。它负责群聊空间的边界。

RoomMember 表示用户或 Agent 在某个 room 中的成员关系。它不是用户本体，也不是 Agent 本体。同一个 Agent 在不同 room 中可以有不同角色、昵称、权限和参与方式。

RoomMessage 是群消息。它可以包含文本、提及、回复、引用、附件和系统消息。它不应该被简化成纯文本日志。

Announcement 是群公告。它适合存放长期重要信息，例如群规则、当前协作约定、onboarding 信息。对于人来说，它应该方便阅读和修改；对于 Agent 来说，将来可能需要更结构化、更适合检索和上下文投影的表示。

PinnedItem 是群置顶。它可以指向消息、公告、文件或链接。置顶比“目标”更适合做 room 的核心能力，因为它是 IM 群里自然存在的组织方式。

RoomFile 是群文件。它不是 Agent artifact 的全部，但可以作为 room 中共享材料的基础能力。

PermissionPolicy 决定谁能发言、邀请、踢人、改公告、置顶、上传文件、查看历史。

History 负责消息历史、游标、未读、入群前历史是否可见等群聊基础设施问题。

## LinkA Room 不应该采用什么

Room 不应该直接包含任务状态。

它不应该有“任务是否完成”“当前阻塞点”“当前步骤”“workflow 阶段”这样的本体字段。

这些信息可以由上层对象从 room 消息中派生，也可以由 LinkA 或某个 Agent 总结后写入公告、置顶或文件，但不能成为 Room 本身的定义。

Room 也不应该理解 Agent 的内部推理状态。

Agent 的计划、工具调用、临时思考、runtime session 属于 LinkA Harness 或底层 runtime。Room 只关心这个 Agent 作为群成员说了什么、上传了什么、被谁提及、拥有什么权限。

Room 也不应该直接复制 QQ 的所有社交功能。群荣誉、等级、头衔、匿名聊天、复杂娱乐化能力，不是 LinkA v0 的重点。

## Agent 协作扩展

LinkA Room 不是普通人类 IM 群的简单复制。它要容纳拟人化 Agent，因此需要一些 Agent 协作扩展。

这些扩展不能污染 Room 的 IM 本体，但可以作为 Room 上的可选能力存在。

例如公告板。

对于人，公告板应该是易读、易改、能被置顶的文本或文档。

对于 Agent，公告板可能需要更适合机器读取的结构：规则条目、长期共识、当前约定、上下文摘要、禁止事项、用户偏好索引。它的实现方式可能是一份文件，也可能是一组结构化记录，还可能有读写锁或版本控制。

现在不必提前决定实现。

但方向应该明确：Room 本体提供公告板这个群聊能力；Agent 协作层可以在公告板之上发展出更适合 Agent 的读写协议。

类似地，Agent 可能需要能力卡片、可见上下文摘要、入群 onboarding、协作规则、工具权限说明。这些都应该作为 Room 的扩展能力，而不是把 Room 变成任务系统。

## 对 LinkA 的对象定义建议

LinkA Room 的基础定义可以写成：

> Room 是 LinkA 的群聊聚合根。它抽象的是用户和 Agent 共同存在的 IM 群，而不是任务执行单元。它拥有成员、消息、公告、置顶、文件、权限、历史和群设置。它的参与者只有用户和 Agent。它不理解任务状态，也不负责执行任务。任务、工作流、Agent 推理和上下文投影都建立在 Room 之上，而不是塞进 Room 里面。

这一定义把 Room 固定在基础设施层。

它让 LinkA 可以继续向上生长：LinkA 本人、LinkA Harness、Agent 协作规则、任务派生、研究实验，都可以基于 Room，但不破坏 Room。

## 参考来源

本参考综合了以下公开资料和开源实现：

* 腾讯云 IM 群组系统文档：<https://cloud.tencent.com/document/product/269/1502>

* QQ 机器人开放平台文档：<https://bot.q.qq.com/wiki/develop/api-v2/>

* Mirai：<https://github.com/mamoe/mirai>

* mirai-api-http：<https://github.com/project-mirai/mirai-api-http>

* oicq：<https://github.com/takayama-lily/oicq>

* OneBot v11：<https://github.com/botuniverse/onebot-11>

* go-cqhttp：<https://github.com/Mrs4s/go-cqhttp>

* NapCatQQ：<https://github.com/NapNeko/NapCatQQ>

* Lagrange.Core：<https://github.com/LagrangeDev/Lagrange.Core>

* Matrix Client-Server API：<https://spec.matrix.org/latest/client-server-api/>

* Slack Conversation Object：<https://docs.slack.dev/reference/objects/conversation-object/>

* Discord Channel Object：<https://discord.com/developers/docs/resources/channel>

* Telegram Bot API：<https://core.telegram.org/bots/api>

* XMPP MUC：<https://xmpp.org/extensions/xep-0045.html>

* Mattermost Channel model：<https://github.com/mattermost/mattermost/blob/master/server/public/model/channel.go>

* Rocket.Chat Rooms API：<https://developer.rocket.chat/apidocs/get-room-information>
